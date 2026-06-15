"""Routeur Features — list/get/update/delete (factory) + create + bulk rank."""
from fastapi import Request, HTTPException, Depends
from sqlmodel import Session

from app.common import _gen_id, _now
from app.db import get_session
from app.models import Feature
from app.serializers import _feature_dict
from app.crud import make_crud_router

router = make_crud_router(
    model=Feature, serializer=_feature_dict, prefix="/api/features", tag="features",
    not_found="Feature non trouvee", with_get=True,
    field_map={"piSprint": "pi_sprint", "assignee": "leader"},
)


@router.post("")
async def create_feature(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    f = Feature(
        id=body.get("id") or _gen_id(),
        title=body["title"],
        status=body.get("status", "todo"),
        team=body.get("team", ""),
        leader=body.get("leader") or body.get("assignee"),
        priority=body.get("priority", "high"),
        pi_sprint=body.get("piSprint"),
        labels=body.get("labels", []),
        description=body.get("description", ""),
    )
    session.add(f)
    session.commit()
    session.refresh(f)
    return _feature_dict(f)


@router.post("/rank")
async def bulk_rank_features(request: Request, session: Session = Depends(get_session)):
    """Update rank for a list of features: [{id, rank}, ...]"""
    body = await request.json()
    for item in body:
        f = session.get(Feature, item.get("id", ""))
        if f:
            f.rank = item.get("rank", 0)
            f.updated_at = _now()
            session.add(f)
    session.commit()
    return {"ok": True}
