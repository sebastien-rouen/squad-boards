"""Routeur Tickets — liste filtrée, get/delete (factory), create, update (tracking
de changement de statut), et sous-ressource comments."""
from typing import Optional

from fastapi import Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _gen_id, _now
from app.db import get_session
from app.models import Ticket
from app.serializers import _ticket_dict
from app.crud import make_crud_router

# get + delete via factory ; list (filtres) et update (tracking statut) custom.
router = make_crud_router(
    model=Ticket, serializer=_ticket_dict, prefix="/api/tickets", tag="tickets",
    not_found="Ticket non trouve", with_list=False, with_get=True, with_update=False,
)


@router.get("")
def list_tickets(team: Optional[str] = None, status: Optional[str] = None,
                 epic: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(Ticket)
    if team and team != "all":
        q = q.where(Ticket.team == team)
    if status:
        q = q.where(Ticket.status == status)
    if epic:
        q = q.where(Ticket.epic_id == epic)
    return [_ticket_dict(t) for t in session.exec(q).all()]


@router.post("")
async def create_ticket(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    t = Ticket(
        id=body.get("id") or _gen_id(),
        title=body["title"],
        type=body.get("type", "story"),
        status=body.get("status", "todo"),
        jira_status=body.get("jiraStatus", ""),
        team=body.get("team", ""),
        leader=body.get("leader") or body.get("assignee"),
        reporter=body.get("reporter"),
        contributors=body.get("contributors", []),
        points=body.get("points", 0),
        priority=body.get("priority", "medium"),
        sprint=body.get("sprint"),
        sprint_name=body.get("sprintName"),
        pi_sprint=body.get("piSprint"),
        flagged=body.get("flagged", False),
        labels=body.get("labels", []),
        epic_id=body.get("epic") or body.get("epic_id"),
        description=body.get("description", ""),
        links=body.get("links", []),
        comments=body.get("comments", []),
        recent_changes=body.get("recentChanges", []),
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return _ticket_dict(t)


@router.put("/{ticket_id}")
async def update_ticket(ticket_id: str, request: Request, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    body = await request.json()
    # Track status change
    if "status" in body and body["status"] != t.status:
        changes = list(t.recent_changes or [])
        changes.append({
            "date": _now(),
            "author": body.pop("_author", "Utilisateur"),
            "field": "status",
            "from": t.status,
            "to": body["status"],
        })
        t.recent_changes = changes
    body.pop("_author", None)
    # Map JSON field names to model attrs
    field_map = {
        "sprintName": "sprint_name", "piSprint": "pi_sprint",
        "epic": "epic_id", "recentChanges": "recent_changes",
        "assignee": "leader", "jiraStatus": "jira_status",
        "stageDurations": "stage_durations",
    }
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(t, attr):
            setattr(t, attr, val)
    t.updated_at = _now()
    session.add(t)
    session.commit()
    session.refresh(t)
    return _ticket_dict(t)


# ── Comments (sous-ressource) ────────────────────────────────────────────────
@router.post("/{ticket_id}/comments")
async def add_comment(ticket_id: str, request: Request, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    body = await request.json()
    comment = {
        "id": _gen_id(),
        "author": body.get("author", "Utilisateur"),
        "body": body.get("body", ""),
        "date": _now(),
    }
    comments = list(t.comments or [])
    comments.append(comment)
    t.comments = comments
    t.updated_at = _now()
    session.add(t)
    session.commit()
    return comment


@router.delete("/{ticket_id}/comments/{comment_id}")
def delete_comment(ticket_id: str, comment_id: str, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    t.comments = [c for c in (t.comments or []) if c.get("id") != comment_id]
    t.updated_at = _now()
    session.add(t)
    session.commit()
    return {"ok": True}
