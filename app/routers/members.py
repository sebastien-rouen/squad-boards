"""Routeur Members — CRUD standard (factory) + create + bulk upsert."""
from fastapi import Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _gen_id, _now, _normalize_team
from app.db import get_session
from app.models import Member
from app.serializers import _member_dict
from app.crud import make_crud_router

router = make_crud_router(model=Member, serializer=_member_dict, prefix="/api/members",
                          tag="members", not_found="Membre non trouve")


@router.post("")
async def create_member(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    m = Member(
        id=body.get("id") or _gen_id(),
        name=body["name"],
        team=body.get("team", ""),
        role=body.get("role", ""),
        entity=body.get("entity", ""),
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return _member_dict(m)


@router.post("/bulk")
async def bulk_merge_members(request: Request, session: Session = Depends(get_session)):
    """Upsert members by name (CSV import = source of truth).
    replace=False → si name existe : enrichit team/role/entity avec les valeurs CSV
                    non-vides (préserve les valeurs existantes si CSV vide).
                    Sinon → insert.
    replace=True  → clear all members first, then insert.

    Dédup par name.lower() — gère "Alain Lenom" ↔ "alain lenom" comme la même
    personne. Pour deux graphies vraiment différentes (ex: "Alain Lenom" vs
    "LENOM, Alain"), c'est l'utilisateur qui doit nettoyer côté Settings.
    """
    body = await request.json()
    items = body.get("members", [])
    replace = body.get("replace", False)

    if replace:
        for row in session.exec(select(Member)).all():
            session.delete(row)
        session.flush()

    # Map nom_lower → row existant pour upsert
    existing_by_name = {
        m.name.lower(): m
        for m in session.exec(select(Member)).all()
    }
    created = 0
    updated = 0
    for d in items:
        name = (d.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        new_team   = _normalize_team((d.get("team")   or "").strip())
        new_role   = (d.get("role")   or "").strip()
        new_entity = (d.get("entity") or "").strip()

        if key in existing_by_name:
            m = existing_by_name[key]
            changed = False
            # On enrichit : on n'écrase pas une valeur existante par une valeur vide,
            # mais on remplit une valeur vide avec celle du CSV.
            if new_team and m.team != new_team:
                m.team = new_team
                changed = True
            if new_role and m.role != new_role:
                m.role = new_role
                changed = True
            if new_entity and m.entity != new_entity:
                m.entity = new_entity
                changed = True
            if changed:
                m.updated_at = _now()
                session.add(m)
                updated += 1
        else:
            m = Member(
                id=_gen_id(),
                name=name,
                team=new_team,
                role=new_role,
                entity=new_entity,
            )
            session.add(m)
            existing_by_name[key] = m
            created += 1

    session.commit()
    return {"ok": True, "created": created, "updated": updated}
