"""Authentification SSO BastaVerse (3.280.0) — verrou unique devant l'API, le proxy JIRA et Swagger.

Port Python du verrou de référence (`backlog/api/middleware/auth.js`, skill `/auth-sso`) : la session est celle
du hub d'identité `auth` (collection `users` d'une PocketBase dédiée). Le site ne gère aucun compte.

Réglages (`.env`) :
    AUTH_REQUIRED=false                        # false = porte ouverte (état livré) — UN SEUL commutateur
    AUTH_POCKETBASE_URL=http://127.0.0.1:8146  # vérification côté serveur (réseau interne)
    AUTH_PUBLIC_URL=https://auth-drafts.bastou.dev/pb   # même instance, vue par le NAVIGATEUR
    AUTH_ALLOWED_EMAILS=                       # vide = tout compte du hub ; sinon liste séparée par des virgules

Jeton lu dans `Authorization: Bearer …` OU dans le cookie `sb_session` (posé par le front, SameSite=Strict) :
le cookie couvre ce qui ne peut pas porter d'en-tête — `<img>` des pièces jointes JIRA, liens de téléchargement.
Le front lit le commutateur sur `GET /api/auth/status` (public) : il ne peut pas diverger du serveur.

⚠️ Hub injoignable ⇒ REFUS (jamais de porte ouverte par défaut). Le jeton n'est jamais gardé en clair (empreinte).
"""
import hashlib
import logging
import os
import re
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import http_client
from app.secrets_store import get_secret, set_secrets

REQUIRED = os.getenv("AUTH_REQUIRED", "").strip().lower() == "true"
PB_URL = os.getenv("AUTH_POCKETBASE_URL", "").strip().rstrip("/")
PUBLIC_URL = os.getenv("AUTH_PUBLIC_URL", "https://auth-drafts.bastou.dev/pb").strip().rstrip("/")
ALLOWED = {e.strip().lower() for e in os.getenv("AUTH_ALLOWED_EMAILS", "").split(",") if e.strip()}   # accès de secours
_DB_KEY = "auth_allowed_emails"   # liste éditée dans Paramètres → Accès (table server_secret, 3.285.0)
_EMAIL_RE = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")
_db_cache: tuple[float, set] = (0.0, set())
COOKIE = "sb_session"
logger = logging.getLogger("uvicorn.error")   # journal pm2 du site

# Préfixes protégés : tout le reste (page, JS, CSS, images, page de connexion) est public — le code n'est pas
# secret, les DONNÉES le sont. Exemptions posées à l'endpoint, jamais au préfixe.
_PROTECTED = ("/api/", "/jira/", "/docs", "/redoc", "/openapi.json")
_PUBLIC = {("GET", "/api/auth/status")}

_CACHE_TTL = 60.0     # un jeton vérifié est cru 60 s (sinon un aller-retour au hub par requête)
_CACHE_MAX = 200
_verified: dict[str, tuple[float, dict]] = {}

router = APIRouter(tags=["auth"])


def _token(request: Request) -> str:
    h = request.headers.get("authorization", "").strip()
    if h:
        return h[7:].strip() if h.lower().startswith("bearer ") else h
    return request.cookies.get(COOKIE, "").strip()


async def _verify(token: str) -> dict | None:
    """Seul le hub peut trancher (la signature d'un jeton PocketBase dépend de l'enregistrement)."""
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _verified.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    _verified.pop(key, None)
    try:
        r = await http_client.client.post(f"{PB_URL}/api/collections/users/auth-refresh",
                                          headers={"Authorization": token}, timeout=10.0)
    except Exception as e:  # réseau : on refuse plutôt que de laisser passer
        logger.error("[auth] hub injoignable : %s", e)
        return None
    if r.status_code != 200:
        # 401 = jeton invalide ; 404 = URL qui ne vise pas PocketBase ; 502 = hub éteint
        logger.warning("[auth] vérification refusée (%s) par %s", r.status_code, PB_URL)
        return None
    try:
        user = (r.json() or {}).get("record")
    except ValueError:
        return None
    if not user:
        return None
    if len(_verified) >= _CACHE_MAX:
        _verified.pop(next(iter(_verified)))
    _verified[key] = (time.monotonic() + _CACHE_TTL, user)
    return user


def _db_allowed() -> set:
    """Liste de Paramètres → Accès, relue au plus toutes les 15 s (sinon une lecture SQLite par requête)."""
    global _db_cache
    if _db_cache[0] > time.monotonic():
        return _db_cache[1]
    emails = {e for e in get_secret(_DB_KEY).split(",") if e}
    _db_cache = (time.monotonic() + 15.0, emails)
    return emails


def allowed_emails() -> set:
    """`.env` ∪ liste éditée ; vide = tout compte du hub."""
    return ALLOWED | _db_allowed()


def _deny(detail: str, status: int = 401) -> JSONResponse:
    # En-tête propre au verrou : un 401 RELAYÉ par le proxy JIRA (jeton JIRA expiré) ne doit pas déconnecter
    return JSONResponse({"detail": detail}, status_code=status, headers={"X-Auth-Required": "1"})


async def auth_middleware(request: Request, call_next):
    request.state.user = None
    path = request.url.path
    if not REQUIRED or not path.startswith(_PROTECTED) or (request.method, path) in _PUBLIC:
        return await call_next(request)
    token = _token(request)
    if not token:
        return _deny("Authentification requise")
    if not PB_URL:
        return _deny("Authentification mal configurée (AUTH_POCKETBASE_URL)", 500)
    user = await _verify(token)
    if not user:
        return _deny("Session invalide ou expirée")
    allowed = allowed_emails()
    if allowed and str(user.get("email", "")).lower() not in allowed:
        logger.warning("[auth] compte hors liste : %s", user.get("email"))
        return _deny("Ce compte n'est pas autorisé sur Squad Board", 403)
    request.state.user = user
    return await call_next(request)


@router.get("/api/auth/status")
def auth_status():
    """Public : le front y lit s'il doit exiger une connexion, et où se trouve le hub."""
    return {"required": REQUIRED, "hub": PUBLIC_URL}


@router.get("/api/auth/me")
def auth_me(request: Request):
    """Compte de la session (null porte ouverte) — protégé comme le reste de l'API."""
    u = getattr(request.state, "user", None)
    return {"user": {"email": u.get("email"), "name": u.get("name") or ""} if u else None}


def signed(request: Request, fallback: str = "") -> str:
    """Auteur d'une écriture (3.281.0) : le compte SSO de la session quand la porte est armée — il PRIME sur le nom
    saisi, qui pouvait être n'importe quoi ; porte ouverte, le nom fourni par le client (comportement d'avant)."""
    u = getattr(request.state, "user", None)
    if not u:
        return fallback
    return (str(u.get("name") or "").strip() or str(u.get("email") or "").split("@")[0] or fallback)[:80]


@router.get("/api/auth/access")
def get_access(request: Request):
    """Paramètres → Accès : état du verrou, liste `.env` (lecture seule) et liste éditée."""
    u = getattr(request.state, "user", None)
    return {"required": REQUIRED, "envEmails": sorted(ALLOWED), "emails": sorted(_db_allowed()),
            "me": (u or {}).get("email", "")}


@router.put("/api/auth/access")
async def put_access(request: Request):
    """Remplace la liste éditée. Refuse ce qui fermerait la porte à celui qui écrit (compte hors `.env`)."""
    global _db_cache
    body = await request.json()
    raw = body.get("emails") if isinstance(body, dict) else None
    if not isinstance(raw, list):
        return JSONResponse({"detail": "emails (liste) requis"}, status_code=400)
    emails = sorted({str(e).strip().lower() for e in raw if str(e).strip()})
    bad = [e for e in emails if not _EMAIL_RE.match(e)]
    if bad:
        return JSONResponse({"detail": f"E-mail invalide : {bad[0]}"}, status_code=400)
    if len(emails) > 200:
        return JSONResponse({"detail": "200 e-mails au plus"}, status_code=400)
    me = str((getattr(request.state, "user", None) or {}).get("email", "")).lower()
    if REQUIRED and me and (ALLOWED or emails) and me not in ALLOWED and me not in emails:
        return JSONResponse({"detail": "Tu te retirerais l'accès : garde ton e-mail dans la liste"}, status_code=400)
    set_secrets({_DB_KEY: ",".join(emails)})
    _db_cache = (0.0, set())
    return {"ok": True, "emails": emails}
