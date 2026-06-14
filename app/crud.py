"""Factory CRUD générique.

Génère les endpoints 100% mécaniques (list / get / update / delete) partagés par
la majorité des ressources. Le `create` reste écrit à la main dans chaque routeur
(validation + valeurs par défaut spécifiques à l'entité).

Le routeur retourné est un APIRouter normal : chaque module peut y attacher des
routes supplémentaires (`@router.post("")`, endpoints bulk, etc.).
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _now
from app.db import get_session


def make_crud_router(*, model, serializer, prefix, tag, not_found="Introuvable",
                     field_map=None, with_list=True, with_get=False,
                     with_update=True, with_delete=True):
    """Construit un APIRouter avec les opérations CRUD mécaniques activées.

    - `field_map` : mapping clé JSON (camelCase) → attribut modèle (snake_case) pour update.
    - `with_list`  : GET {prefix} (sans filtre, sans tri). Désactiver pour une liste custom.
    - `with_get`   : GET {prefix}/{id}. Off par défaut (peu de ressources l'exposent).
    - `with_update`: PUT {prefix}/{id}.
    - `with_delete`: DELETE {prefix}/{id}.
    """
    field_map = field_map or {}
    router = APIRouter(prefix=prefix, tags=[tag])

    if with_list:
        @router.get("")
        def list_items(session: Session = Depends(get_session)):
            return [serializer(x) for x in session.exec(select(model)).all()]

    if with_get:
        @router.get("/{item_id}")
        def get_item(item_id: str, session: Session = Depends(get_session)):
            x = session.get(model, item_id)
            if not x:
                raise HTTPException(404, not_found)
            return serializer(x)

    if with_update:
        @router.put("/{item_id}")
        async def update_item(item_id: str, request: Request,
                              session: Session = Depends(get_session)):
            x = session.get(model, item_id)
            if not x:
                raise HTTPException(404, not_found)
            body = await request.json()
            for key, val in body.items():
                attr = field_map.get(key, key)
                if hasattr(x, attr):
                    setattr(x, attr, val)
            x.updated_at = _now()
            session.add(x)
            session.commit()
            session.refresh(x)
            return serializer(x)

    if with_delete:
        @router.delete("/{item_id}")
        def delete_item(item_id: str, session: Session = Depends(get_session)):
            x = session.get(model, item_id)
            if not x:
                raise HTTPException(404, not_found)
            session.delete(x)
            session.commit()
            return {"ok": True}

    return router
