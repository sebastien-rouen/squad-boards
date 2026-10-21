"""Routeur JIRA Proxy (plugin optionnel) — relaie les appels REST/Agile vers JIRA Cloud."""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import httpx

from urllib.parse import urlparse

from app.config import JIRA_URL, JIRA_USER, JIRA_TOKEN, JIRA_ALLOWED_HOSTS
from app import http_client

router = APIRouter(tags=["jira"])


def _host_allowed(host: str) -> bool:
    """Hôte JIRA acceptable quand l'URL vient du navigateur : Atlassian Cloud, l'hôte du .env, ou JIRA_ALLOWED_HOSTS."""
    host = (host or "").lower()
    env_host = (urlparse(JIRA_URL).hostname or "").lower()
    return bool(host) and (host.endswith(".atlassian.net") or host == env_host or host in JIRA_ALLOWED_HOSTS)


def _resolve_target(request: Request):
    """(url, user, token) à utiliser — SÉCURITÉ (3.238.0).

    Avant : l'URL pouvait venir de l'en-tête X-Jira-Url et les identifiants du .env — n'importe qui atteignant le
    port recevait `Authorization: Basic <user:jeton du .env>` sur le serveur de son choix (reproduit). Désormais :
      • URL du navigateur DIFFÉRENTE de JIRA_URL → identifiants du navigateur OBLIGATOIRES (jamais ceux du .env),
        HTTPS et hôte autorisé (`_host_allowed`) : pas de requête du serveur vers le réseau interne ;
      • sinon (pas d'URL, ou la même que le .env) → chaque valeur fournie prime, repli sur le .env, comme avant.
    """
    hdr_url = (request.headers.get("X-Jira-Url") or "").strip().rstrip("/")
    hdr_user = request.headers.get("X-Jira-User") or ""
    hdr_token = request.headers.get("X-Jira-Token") or ""
    if hdr_url and hdr_url != JIRA_URL:
        u = urlparse(hdr_url)
        if u.scheme != "https" or not _host_allowed(u.hostname):
            raise HTTPException(400, "URL JIRA refusée : HTTPS et hôte Atlassian (ou JIRA_ALLOWED_HOSTS) requis")
        if not (hdr_user and hdr_token):
            raise HTTPException(400, "URL JIRA personnalisée : renseignez aussi l'utilisateur et le jeton (Paramètres → JIRA)")
        return hdr_url, hdr_user, hdr_token
    return JIRA_URL, hdr_user or JIRA_USER, hdr_token or JIRA_TOKEN


@router.api_route("/jira/{path:path}", methods=["GET", "POST", "PUT"])
async def jira_proxy(path: str, request: Request):
    base_url, jira_user, jira_token = _resolve_target(request)
    if not all([base_url, jira_user, jira_token]):
        raise HTTPException(503, "JIRA non configure")
    allowed = ("rest/api/", "rest/agile/", "rest/greenhopper/")
    if not path.startswith(allowed) or ".." in path:
        raise HTTPException(403, "Chemin interdit")

    url = f"{base_url}/{path}"
    params = dict(request.query_params)
    auth = (jira_user, jira_token)
    headers = {"Accept": "application/json"}
    body = await request.body() if request.method != "GET" else None
    if body:
        headers["Content-Type"] = "application/json"

    try:
        resp = await http_client.client.request(
            request.method, url, params=params, auth=auth, headers=headers, content=body
        )
    except httpx.RequestError as e:
        raise HTTPException(502, f"Connexion JIRA: {e}")

    # 204 No Content / corps vide = réponse OK sans payload (cas PUT sprint update)
    if not resp.content:
        return JSONResponse(content=None, status_code=resp.status_code)
    try:
        data = resp.json()
    except Exception:
        # JIRA peut renvoyer du texte d'erreur HTML/plain — propage le code + message brut
        if resp.is_success:
            return JSONResponse(content=None, status_code=resp.status_code)
        raise HTTPException(resp.status_code, resp.text[:300] or "Reponse JIRA invalide")

    return JSONResponse(content=data, status_code=resp.status_code)
