"""Routeur Support Rotation — liste filtrée triée + create + bulk + update/delete (factory)."""
from typing import Optional

from fastapi import Request, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import SupportRotation
from app.serializers import _support_dict
from app.crud import make_crud_router

router = make_crud_router(
    model=SupportRotation, serializer=_support_dict, prefix="/api/support",
    tag="support", not_found="Rotation non trouvee", with_list=False,
    field_map={"weekLabel": "week_label", "weekStart": "week_start", "weekEnd": "week_end",
               "membersPerWeek": "members_per_week", "weekMode": "week_mode",
               "memberDays": "member_days"},
)


@router.get("")
def list_support(team: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(SupportRotation)
    if team:
        q = q.where(SupportRotation.team == team)
    return [_support_dict(s) for s in session.exec(q.order_by(SupportRotation.week_start)).all()]


@router.post("")
async def create_support(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    s = SupportRotation(
        team=body.get("team", ""),
        week_label=body.get("weekLabel", ""),
        week_start=body.get("weekStart", ""),
        week_end=body.get("weekEnd", ""),
        members=body.get("members", []),
        member_days=body.get("memberDays", {}),
        locked=body.get("locked", False),
        unlocked=body.get("unlocked", False),
        members_per_week=body.get("membersPerWeek", 2),
        week_mode=body.get("weekMode", "monday"),
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    return _support_dict(s)


@router.post("/bulk")
async def bulk_create_support(request: Request, session: Session = Depends(get_session)):
    """Import full rotation grid at once."""
    body = await request.json()
    items = body.get("rotations", [])
    team = body.get("team")
    if team:
        for row in session.exec(select(SupportRotation).where(SupportRotation.team == team)).all():
            session.delete(row)
    for d in items:
        s = SupportRotation(
            team=d.get("team", team or ""),
            week_label=d.get("weekLabel", ""),
            week_start=d.get("weekStart", ""),
            week_end=d.get("weekEnd", ""),
            members=d.get("members", []),
            member_days=d.get("memberDays", {}),
            locked=d.get("locked", False),
            unlocked=d.get("unlocked", False),
            members_per_week=d.get("membersPerWeek", 2),
            week_mode=d.get("weekMode", "monday"),
        )
        session.add(s)
    session.commit()
    return {"ok": True, "count": len(items)}
