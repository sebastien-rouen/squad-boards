"""Routeur Calendriers ICS — CRUD + refresh (fetch + parse) + agrégation d'événements."""
import json
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlmodel import Session, select
import httpx

from app.common import _now
from app.db import get_session
from app import http_client
from app.models import TeamCalendar
from app.serializers import _cal_dict
from app.services.ics import _parse_ics_events

router = APIRouter(prefix="/api/calendars", tags=["calendars"])


@router.get("")
def list_calendars(session: Session = Depends(get_session)):
    return [_cal_dict(c) for c in session.exec(select(TeamCalendar)).all()]


@router.post("")
async def create_calendar(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("icalUrl"):
        raise HTTPException(400, "icalUrl est requis")
    c = TeamCalendar(
        team=body.get("team", ""),
        name=body.get("name", "Calendrier"),
        ical_url=body["icalUrl"],
    )
    session.add(c); session.commit(); session.refresh(c)
    return _cal_dict(c)


@router.put("/{cal_id}")
async def update_calendar(cal_id: str, request: Request, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    body = await request.json()
    if "team" in body: c.team = body["team"]
    if "name" in body: c.name = body["name"]
    if "icalUrl" in body: c.ical_url = body["icalUrl"]
    c.updated_at = _now()
    session.add(c); session.commit(); session.refresh(c)
    return _cal_dict(c)


@router.delete("/{cal_id}")
def delete_calendar(cal_id: str, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    session.delete(c); session.commit()
    return {"ok": True}


@router.post("/{cal_id}/refresh")
async def refresh_calendar(cal_id: str, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    if not c.ical_url:
        raise HTTPException(400, "Aucune URL configurée")
    try:
        resp = await http_client.client.get(c.ical_url, follow_redirects=True, timeout=30)
        resp.raise_for_status()
    except httpx.RequestError as e:
        raise HTTPException(502, f"Erreur réseau : {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Erreur HTTP {e.response.status_code}")
    try:
        evs = _parse_ics_events(resp.text)
    except Exception as e:
        raise HTTPException(422, str(e))
    c.events_json = json.dumps(evs, ensure_ascii=False)
    c.last_fetched = _now()
    c.updated_at = _now()
    session.add(c); session.commit(); session.refresh(c)
    return {"ok": True, "count": len(evs), "lastFetched": c.last_fetched}


@router.get("/events")
def get_calendar_events(team: Optional[str] = None, session: Session = Depends(get_session)):
    all_events: list[dict] = []
    for cal in session.exec(select(TeamCalendar)).all():
        # cal.team peut être vide (toutes équipes) ou CSV "Fuego,Caméléon"
        if team and cal.team:
            cal_teams = [t.strip() for t in cal.team.split(',') if t.strip()]
            if cal_teams and team not in cal_teams:
                continue
        if not cal.events_json:
            continue
        try:
            for ev in json.loads(cal.events_json):
                ev["calendarId"]   = cal.id
                ev["calendarName"] = cal.name
                ev["team"]         = cal.team
                all_events.append(ev)
        except Exception:
            pass
    all_events.sort(key=lambda e: e.get("start", ""))
    return all_events
