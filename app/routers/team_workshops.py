"""Routeur Team Workshops — réponses d'une équipe à un atelier (upsert par team+templateKey)."""
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _gen_id, _now
from app.config import UPLOADS_DIR
from app.db import get_session
from app.models import TeamWorkshop, Attachment
from app.serializers import _team_workshop_dict

router = APIRouter(prefix="/api/team-workshops", tags=["team-workshops"])


@router.get("")
def list_team_workshops(team: Optional[str] = None, session: Session = Depends(get_session)):
    stmt = select(TeamWorkshop)
    if team:
        stmt = stmt.where(TeamWorkshop.team == team)
    return [_team_workshop_dict(w) for w in session.exec(stmt).all()]


@router.put("")
async def upsert_team_workshop(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    team = (body.get("team") or "").strip()
    template_key = (body.get("templateKey") or "").strip()
    if not team or not template_key:
        raise HTTPException(400, "team et templateKey sont requis")
    row = session.exec(select(TeamWorkshop).where(
        TeamWorkshop.team == team, TeamWorkshop.template_key == template_key)).first()
    if not row:
        row = TeamWorkshop(id=_gen_id(), team=team, template_key=template_key)
    row.data = body.get("data", row.data or {})
    row.status = body.get("status", row.status)
    row.updated_at = _now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _team_workshop_dict(row)


@router.delete("/{item_id}")
def delete_team_workshop(item_id: str, session: Session = Depends(get_session)):
    row = session.get(TeamWorkshop, item_id)
    if not row:
        raise HTTPException(404, "Réponse d'atelier non trouvée")
    session.delete(row)
    for att in session.exec(select(Attachment).where(Attachment.team_workshop_id == item_id)).all():
        (UPLOADS_DIR / att.stored_name).unlink(missing_ok=True)
        session.delete(att)
    session.commit()
    return {"ok": True}
