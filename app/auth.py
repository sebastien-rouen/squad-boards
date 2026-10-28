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
import time

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import http_client

REQUIRED = os.getenv("AUTH_REQUIRED", "").strip().lower() == "true"
PB_URL = os.getenv("AUTH_POCKETBASE_URL", "").strip().rstrip("/")
PUBLIC_URL = os.getenv("AUTH_PUBLIC_URL", "https://auth-drafts.bastou.dev/pb").strip().rstrip("/")
ALLOWED = {e.strip().lower() for e in os.getenv("AUTH_ALLOWED_EMAILS", "").split(",") if e.strip()}
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
    if ALLOWED and str(user.get("email", "")).lower() not in ALLOWED:
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
