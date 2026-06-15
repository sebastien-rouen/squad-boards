"""Routeur JIRA Proxy (plugin optionnel) — relaie les appels REST/Agile vers JIRA Cloud."""
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse
import httpx

from app.config import JIRA_URL, JIRA_USER, JIRA_TOKEN
from app import http_client

router = APIRouter(tags=["jira"])


@router.api_route("/jira/{path:path}", methods=["GET", "POST", "PUT"])
async def jira_proxy(path: str, request: Request):
    if not all([JIRA_URL, JIRA_USER, JIRA_TOKEN]):
        raise HTTPException(503, "JIRA non configure")
    allowed = ("rest/api/", "rest/agile/", "rest/greenhopper/")
    if not path.startswith(allowed) or ".." in path:
        raise HTTPException(403, "Chemin interdit")

    url = f"{JIRA_URL}/{path}"
    params = dict(request.query_params)
    auth = (JIRA_USER, JIRA_TOKEN)
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
