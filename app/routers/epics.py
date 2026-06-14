"""Routeur Epics — CRUD standard (factory) + create."""
from fastapi import Request, HTTPException, Depends
from sqlmodel import Session

from app.common import _gen_id
from app.db import get_session
from app.models import Epic
from app.serializers import _epic_dict
from app.crud import make_crud_router

router = make_crud_router(model=Epic, serializer=_epic_dict, prefix="/api/epics",
                          tag="epics", not_found="Epic non trouve",
                          field_map={"piSprint": "pi_sprint", "feature": "feature_id"})


@router.post("")
async def create_epic(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    e = Epic(
        id=body.get("id") or _gen_id(),
        title=body["title"],
        status=body.get("status", "todo"),
        team=body.get("team", ""),
        feature_id=body.get("feature") or body.get("feature_id"),
        pi_sprint=body.get("piSprint"),
        labels=body.get("labels", []),
        description=body.get("description", ""),
    )
    session.add(e)
    session.commit()
    session.refresh(e)
    return _epic_dict(e)
