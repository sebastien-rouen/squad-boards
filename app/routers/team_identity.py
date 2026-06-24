"""Routeur Team Identity — fiche d'identité d'équipe (get-or-create par team, upsert)."""
from fastapi import APIRouter, Request, Depends
from sqlmodel import Session, select

from app.common import _now
from app.db import get_session
from app.models import TeamIdentity
from app.serializers import _team_identity_dict

router = APIRouter(prefix="/api/team-identity", tags=["team-identity"])

_FIELDS = ["vision", "perimeter", "quiSommesNous", "queFaisonsNous",
           "avecQui", "commentFonctionnons", "besoinsReussite"]
_MAP = {"quiSommesNous": "qui_sommes_nous", "queFaisonsNous": "que_faisons_nous",
        "avecQui": "avec_qui", "commentFonctionnons": "comment_fonctionnons",
        "besoinsReussite": "besoins_reussite"}


@router.get("/{team}")
def get_team_identity(team: str, session: Session = Depends(get_session)):
    row = session.exec(select(TeamIdentity).where(TeamIdentity.team == team)).first()
    if not row:
        return _team_identity_dict(TeamIdentity(team=team))
    return _team_identity_dict(row)


@router.put("/{team}")
async def upsert_team_identity(team: str, request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    row = session.exec(select(TeamIdentity).where(TeamIdentity.team == team)).first()
    if not row:
        row = TeamIdentity(team=team)
    for key in _FIELDS:
        if key in body:
            setattr(row, _MAP.get(key, key), body[key])
    row.updated_at = _now()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _team_identity_dict(row)
