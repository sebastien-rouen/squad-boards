"""Réglages de projet partagés (3.266.0) : lecture groupée, écriture par lot.

GET  /api/project-settings            → { clé: valeur }
PUT  /api/project-settings  {values}  → { clé: valeur | null } ; null ou "" = retour au défaut (ligne supprimée)
"""
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from app.common import _now
from app.db import get_session
from app.models import ProjectSetting

router = APIRouter(tags=["settings"])

_KEY_RE = re.compile(r"^sb-[A-Za-z0-9_.\-]{1,120}$")
MAX_VALUE = 256 * 1024   # 256 Ko : la plus grosse valeur attendue (mémoire des sprints vides) en fait quelques-uns


@router.get("/api/project-settings")
def list_project_settings(session: Session = Depends(get_session)):
    return {r.key: r.value for r in session.exec(select(ProjectSetting)).all()}


@router.put("/api/project-settings")
async def put_project_settings(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    values = body.get("values") if isinstance(body, dict) else None
    if not isinstance(values, dict) or not values:
        raise HTTPException(400, "values (objet clé → valeur) requis")
    for key, value in values.items():
        if not _KEY_RE.match(str(key)):
            raise HTTPException(400, f"Clé invalide : {key!r}")
        if value is not None and not isinstance(value, str):
            raise HTTPException(400, f"Valeur texte attendue pour {key}")
        if value and len(value) > MAX_VALUE:
            raise HTTPException(413, f"Valeur trop longue pour {key}")
    for key, value in values.items():
        row = session.get(ProjectSetting, key)
        if not value:
            if row:
                session.delete(row)
        elif row:
            row.value, row.updated_at = value, _now()
        else:
            session.add(ProjectSetting(key=key, value=value))
    session.commit()
    return {"ok": True, "count": len(values)}
