"""Routeur Teams — CRUD standard (factory) + create."""
from fastapi import Request, HTTPException, Depends
from sqlmodel import Session

from app.common import _gen_id
from app.db import get_session
from app.models import Team
from app.serializers import _team_dict
from app.crud import make_crud_router

router = make_crud_router(model=Team, serializer=_team_dict, prefix="/api/teams",
                          tag="teams", not_found="Equipe non trouvee")


@router.post("")
async def create_team(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    t = Team(
        id=body.get("id") or _gen_id(),
        name=body["name"],
        color=body.get("color", "#3b82f6"),
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return _team_dict(t)
