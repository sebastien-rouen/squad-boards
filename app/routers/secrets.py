"""Secrets de projet en écriture seule (3.269.0) : connexion JIRA partagée, webhook Slack.

PUT /api/secrets/jira   {url?, user?, token?, reset?}  — champ absent = inchangé, "" = retiré (retour au .env) ;
                                                          reset: true = tout retirer.
PUT /api/secrets/slack  {webhook}                       — "" = retiré.
L'état (présence, jamais la valeur d'un jeton) est lu par GET /api/config.
"""
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request

from app.secrets_store import set_secrets, host_allowed

router = APIRouter(tags=["secrets"])


@router.put("/api/secrets/jira")
async def put_jira_secrets(request: Request):
    body = await request.json()
    if body.get("reset"):
        set_secrets({"jira.url": "", "jira.user": "", "jira.token": ""})
        return {"ok": True}
    values = {}
    if "url" in body:
        url = str(body.get("url") or "").strip().rstrip("/")
        if url:
            u = urlparse(url)
            if u.scheme != "https" or not host_allowed(u.hostname):
                raise HTTPException(400, "URL JIRA refusée : HTTPS et hôte Atlassian (ou JIRA_ALLOWED_HOSTS) requis")
        values["jira.url"] = url
    if "user" in body:
        values["jira.user"] = str(body.get("user") or "").strip()[:200]
    if "token" in body:
        values["jira.token"] = str(body.get("token") or "").strip()[:1000]
    if not values:
        raise HTTPException(400, "url, user, token ou reset attendu")
    set_secrets(values)
    return {"ok": True}


@router.put("/api/secrets/slack")
async def put_slack_secret(request: Request):
    body = await request.json()
    webhook = str(body.get("webhook") or "").strip()
    if webhook and not webhook.startswith("https://hooks.slack.com/"):
        raise HTTPException(400, "URL de webhook Slack invalide (doit commencer par https://hooks.slack.com/)")
    set_secrets({"slack.webhook": webhook[:500]})
    return {"ok": True}
