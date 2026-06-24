"""Routeur Workshop Templates — catalogue admin des ateliers (Team Canvas, Tuckman, ...)."""
from fastapi import Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _gen_id
from app.db import get_session
from app.models import WorkshopTemplate, TeamWorkshop
from app.serializers import _workshop_template_dict
from app.crud import make_crud_router

router = make_crud_router(model=WorkshopTemplate, serializer=_workshop_template_dict,
                          prefix="/api/workshop-templates", tag="workshop-templates",
                          not_found="Atelier non trouve", with_list=False, with_delete=False)


@router.get("")
def list_templates(session: Session = Depends(get_session)):
    rows = session.exec(select(WorkshopTemplate)).all()
    return [_workshop_template_dict(w) for w in sorted(rows, key=lambda x: (x.sort, x.name))]


@router.post("")
async def create_template(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("key") or not body.get("name"):
        raise HTTPException(400, "key et name sont requis")
    if session.exec(select(WorkshopTemplate).where(WorkshopTemplate.key == body["key"])).first():
        raise HTTPException(400, "Cette clé d'atelier existe déjà")
    w = WorkshopTemplate(
        id=body.get("id") or _gen_id(),
        key=body["key"], name=body["name"], description=body.get("description", ""),
        icon=body.get("icon", "📋"),
        category=body.get("category", "custom"), fields=body.get("fields", []),
        sort=body.get("sort", 0), active=body.get("active", True),
    )
    session.add(w)
    session.commit()
    session.refresh(w)
    return _workshop_template_dict(w)


@router.delete("/{item_id}")
def delete_template(item_id: str, session: Session = Depends(get_session)):
    w = session.get(WorkshopTemplate, item_id)
    if not w:
        raise HTTPException(404, "Atelier non trouve")
    session.delete(w)
    for row in session.exec(select(TeamWorkshop).where(TeamWorkshop.template_key == w.key)).all():
        session.delete(row)
    session.commit()
    return {"ok": True}
