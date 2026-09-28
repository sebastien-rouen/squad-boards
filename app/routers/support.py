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


def _merge_into(existing: SupportRotation, body: dict) -> None:
    """Fusionne un POST dans la ligne déjà en base pour la même (équipe, semaine).

    Chaque POST est calculé par le front à partir d'une ligne qu'il croit absente : deux clics
    rapides dans la grille envoient donc chacun « [le membre cliqué] » seul. Union des membres ;
    jours : l'absence de clé vaut semaine pleine (supportDaysForMember) et l'emporte, sinon
    union des indices.
    """
    members = list(existing.members or [])
    days = dict(existing.member_days or {})
    new_days = body.get("memberDays") or {}
    for m in body.get("members") or []:
        was_member = m in members
        if not was_member:
            members.append(m)
        if m not in new_days:
            days.pop(m, None)                                    # POST = semaine pleine
        elif not was_member or m in days:                        # déjà plein → reste plein
            days[m] = sorted(set(days.get(m, [])) | set(new_days[m]))
    existing.members = members
    existing.member_days = days
    if body.get("locked"):
        existing.locked, existing.unlocked = True, False
    if body.get("unlocked"):
        existing.unlocked, existing.locked = True, False


@router.post("")
async def create_support(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    team = body.get("team", "")
    week_start = body.get("weekStart", "")
    # UNE ligne par (équipe, semaine) : la grille n'affiche et ne modifie que la première (`find`).
    # Un double clic envoyait deux POST avant le rechargement du store → doublons en base (2 à 3
    # lignes sur la semaine de transition 31.5.3, créées à 11 ms d'écart). Aucun `await` entre ce
    # select et le commit : la vérification est atomique dans la boucle d'événements.
    existing = session.exec(
        select(SupportRotation).where(SupportRotation.team == team,
                                      SupportRotation.week_start == week_start)
    ).first()
    if existing:
        _merge_into(existing, body)
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return _support_dict(existing)
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
