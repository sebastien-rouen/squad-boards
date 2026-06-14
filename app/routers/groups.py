"""Routeur Team Groups (lignes produit) — CRUD standard (factory) + create."""
from fastapi import Request, HTTPException, Depends
from sqlmodel import Session

from app.common import _gen_id
from app.db import get_session
from app.models import TeamGroup
from app.serializers import _group_dict
from app.crud import make_crud_router

router = make_crud_router(model=TeamGroup, serializer=_group_dict, prefix="/api/groups",
                          tag="groups", not_found="Groupe non trouve")


@router.post("")
async def create_group(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    g = TeamGroup(
        id=body.get("id") or _gen_id(),
        name=body["name"],
        color=body.get("color", "#6366f1"),
        teams=body.get("teams", []),
    )
    session.add(g)
    session.commit()
    session.refresh(g)
    return _group_dict(g)
