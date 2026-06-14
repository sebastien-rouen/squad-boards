"""Routeurs agile : Events, RetroItems, Risks (ROAM), Mood/Fist votes.

Quatre ressources regroupées (toutes en CRUD léger). Chacune expose son routeur ;
main.py les inclut séparément.
"""
from typing import Optional

from fastapi import Request, HTTPException, Depends
from sqlmodel import Session, select

from app.db import get_session
from app.models import Event, RetroItem, Risk, MoodVote
from app.serializers import _event_dict, _retro_dict, _risk_dict, _mood_dict
from app.crud import make_crud_router

# ── Events (faits marquants) ────────────────────────────────────────────────
router_events = make_crud_router(
    model=Event, serializer=_event_dict, prefix="/api/events", tag="events",
    not_found="Evenement non trouve",
    field_map={"startDate": "start_date", "endDate": "end_date"},
)


@router_events.post("")
async def create_event(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    e = Event(
        type=body.get("type", "other"),
        title=body["title"],
        description=body.get("description", ""),
        start_date=body.get("startDate", ""),
        end_date=body.get("endDate") or body.get("startDate", ""),
        teams=body.get("teams", []),
    )
    session.add(e)
    session.commit()
    session.refresh(e)
    return _event_dict(e)


# ── Retro items (amélioration continue) ──────────────────────────────────────
router_retro = make_crud_router(
    model=RetroItem, serializer=_retro_dict, prefix="/api/retro", tag="retro",
    not_found="Action non trouvee", with_list=False,
    field_map={"piSprint": "pi_sprint"},
)


@router_retro.get("")
def list_retro(team: Optional[str] = None, source: Optional[str] = None,
               session: Session = Depends(get_session)):
    q = select(RetroItem)
    if team: q = q.where(RetroItem.team == team)
    if source: q = q.where(RetroItem.source == source)
    return [_retro_dict(r) for r in session.exec(q).all()]


@router_retro.post("")
async def create_retro(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    r = RetroItem(
        title=body["title"],
        source=body.get("source", "retro"),
        status=body.get("status", "todo"),
        team=body.get("team", ""),
        owner=body.get("owner"),
        pi_sprint=body.get("piSprint"),
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return _retro_dict(r)


# ── Risks (ROAM board) ───────────────────────────────────────────────────────
router_risks = make_crud_router(
    model=Risk, serializer=_risk_dict, prefix="/api/risks", tag="risks",
    not_found="Risque non trouve", with_list=False,
    field_map={"piSprint": "pi_sprint"},
)


@router_risks.get("")
def list_risks(team: Optional[str] = None, quadrant: Optional[str] = None,
               session: Session = Depends(get_session)):
    q = select(Risk)
    if team: q = q.where(Risk.team == team)
    if quadrant: q = q.where(Risk.quadrant == quadrant)
    return [_risk_dict(r) for r in session.exec(q.order_by(Risk.created_at)).all()]


@router_risks.post("")
async def create_risk(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    r = Risk(
        title=body["title"],
        description=body.get("description", ""),
        quadrant=body.get("quadrant", "open"),
        team=body.get("team", ""),
        owner=body.get("owner"),
        impact=body.get("impact", "medium"),
        probability=body.get("probability", "medium"),
        mitigation=body.get("mitigation", ""),
        pi_sprint=body.get("piSprint"),
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return _risk_dict(r)


# ── Mood / Fist of Five votes (pas d'update) ─────────────────────────────────
router_mood = make_crud_router(
    model=MoodVote, serializer=_mood_dict, prefix="/api/mood", tag="mood",
    not_found="Vote non trouve", with_list=False, with_update=False,
)


@router_mood.get("")
def list_mood(type: Optional[str] = None, team: Optional[str] = None,
              session: Session = Depends(get_session)):
    q = select(MoodVote)
    if type: q = q.where(MoodVote.type == type)
    if team: q = q.where(MoodVote.team == team)
    return [_mood_dict(m) for m in session.exec(q.order_by(MoodVote.created_at)).all()]


@router_mood.post("")
async def create_mood(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    try:
        _val = int(body.get("value", 3))
    except (TypeError, ValueError):
        _val = 3
    m = MoodVote(
        type=body.get("type", "mood"),
        team=body.get("team", ""),
        value=max(1, min(5, _val)),
        pi_sprint=body.get("piSprint"),
        author=body.get("author"),
        note=body.get("note", ""),
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return _mood_dict(m)
