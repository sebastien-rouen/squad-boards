"""Routeur Absences — liste filtrée + create + repair-encoding + bulk + update/delete (factory)."""
from typing import Optional

from fastapi import Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _normalize_team
from app.db import get_session
from app.models import Absence
from app.serializers import _absence_dict
from app.crud import make_crud_router

# update (field_map) + delete via factory ; list custom (filtres), pas de GET/{id}.
router = make_crud_router(
    model=Absence, serializer=_absence_dict, prefix="/api/absences",
    tag="absences", not_found="Absence non trouvee", with_list=False,
    field_map={"memberName": "member_name", "startDate": "start_date", "endDate": "end_date"},
)


@router.get("")
def list_absences(team: Optional[str] = None, member: Optional[str] = None,
                  session: Session = Depends(get_session)):
    q = select(Absence)
    if team:
        q = q.where(Absence.team == team)
    if member:
        q = q.where(Absence.member_name == member)
    return [_absence_dict(a) for a in session.exec(q).all()]


@router.post("")
async def create_absence(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("memberName"):
        raise HTTPException(400, "Le nom du membre est requis")
    a = Absence(
        member_name=body["memberName"],
        team=_normalize_team(body.get("team", "")),
        start_date=body.get("startDate", ""),
        end_date=body.get("endDate", ""),
        type=body.get("type", "conge"),
        days=body.get("days", 1.0),
        note=body.get("note", ""),
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return _absence_dict(a)


@router.post("/repair-encoding")
async def repair_absence_encoding(session: Session = Depends(get_session)):
    """Corrige les noms d'équipe et de membre encodés en mojibake (Windows-1252 lu comme UTF-8).
    Ex: 'CamÃ©lÃ©on' -> 'Caméléon'. Idempotent : ne modifie que les lignes effectivement corrompues."""
    def _fix(s: str) -> str:
        if not s:
            return s
        try:
            fixed = s.encode('latin-1').decode('utf-8')
            return fixed if fixed != s else s
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s

    fixed_count = 0
    for a in session.exec(select(Absence)).all():
        new_team = _normalize_team(_fix(a.team or ""))
        new_name = _fix(a.member_name or "")
        if new_team != a.team or new_name != a.member_name:
            a.team = new_team
            a.member_name = new_name
            session.add(a)
            fixed_count += 1
    session.commit()
    return {"ok": True, "fixed": fixed_count}


@router.post("/bulk")
async def bulk_create_absences(request: Request, session: Session = Depends(get_session)):
    """Import multiple absences. Deduplicates by (member_name, start_date, end_date).
    replace=True clears the table first; replace=False appends without duplicates."""
    body = await request.json()
    items = body.get("absences", [])
    replace = body.get("replace", False)
    if replace:
        for row in session.exec(select(Absence)).all():
            session.delete(row)
        session.flush()

    # Build a set of existing (member_name, start_date, end_date) to deduplicate
    existing = {
        (a.member_name, a.start_date, a.end_date)
        for a in session.exec(select(Absence)).all()
    }
    created = 0
    skipped = 0
    for d in items:
        key = (d.get("memberName", ""), d.get("startDate", ""), d.get("endDate", d.get("startDate", "")))
        if key in existing:
            skipped += 1
            continue
        a = Absence(
            member_name=d.get("memberName", ""),
            team=_normalize_team(d.get("team", "")),
            start_date=d.get("startDate", ""),
            end_date=d.get("endDate", d.get("startDate", "")),
            type=d.get("type", "conge"),
            days=d.get("days", 1.0),
            note=d.get("note", ""),
        )
        session.add(a)
        existing.add(key)
        created += 1
    session.commit()
    return {"ok": True, "created": created, "skipped": skipped}
