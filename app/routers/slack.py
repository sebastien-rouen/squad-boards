"""Proxy Slack — relaie un message vers un Incoming Webhook Slack côté serveur.

Le webhook URL est fourni dans le corps de la requête (stocké en localStorage côté client).
Le POST passe par le backend pour éviter les restrictions CORS des navigateurs.
"""
from fastapi import APIRouter, HTTPException, Request
from app import http_client

router = APIRouter(tags=["slack"])


@router.post("/api/slack/send")
async def slack_send(request: Request):
    body = await request.json()
    webhook = (body.get("webhook") or "").strip()
    text    = (body.get("text")    or "").strip()
    if not webhook or not text:
        raise HTTPException(status_code=400, detail="webhook et text requis")
    if not webhook.startswith("https://hooks.slack.com/"):
        raise HTTPException(status_code=400, detail="URL de webhook Slack invalide (doit commencer par https://hooks.slack.com/)")
    r = await http_client.client.post(webhook, json={"text": text},
                                      headers={"Content-Type": "application/json"})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Slack a répondu {r.status_code} : {r.text}")
    return {"ok": True}
