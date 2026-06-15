"""Squad Board - Self-contained project board with SQLite + optional JIRA sync."""
import json
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import httpx
from sqlmodel import SQLModel, Session, select

from app.config import STATIC_DIR, JIRA_URL, JIRA_USER, JIRA_TOKEN, JIRA_PROJECT
from app.common import _gen_id, _now, _normalize_team
from app.db import engine, get_session
from app.migrations import run_migrations
from app.seed import seed_atlas_catalog
from app.services.ics import _parse_ics_events
from app.models import (
    Team, Member, Ticket, Feature, Epic,
    SprintConfig, PIConfig, TeamGroup,
    Absence, SupportRotation,
    Event, MoodVote, RetroItem, Risk,
    Skill, Appetence, MemberSkill, MemberAppetence, MemberMobility,
    TeamCalendar,
)
from app.serializers import (
    _ticket_dict, _feature_dict, _risk_dict, _epic_dict, _member_dict,
    _team_dict, _skill_dict, _appetence_dict, _member_skill_dict,
    _member_appetence_dict, _mobility_dict, _sprint_dict, _pi_dict,
    _group_dict, _absence_dict, _support_dict, _event_dict, _mood_dict,
    _retro_dict, _cal_dict,
)

_client: httpx.AsyncClient | None = None


# ══════════════════════════════════════════════════════════════════════════════
# Database bootstrap (engine importé depuis app.db, migrations depuis app.migrations)
# ══════════════════════════════════════════════════════════════════════════════
SQLModel.metadata.create_all(engine)
run_migrations(engine)


seed_atlas_catalog(engine)


# ══════════════════════════════════════════════════════════════════════════════
# App
# ══════════════════════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client
    _client = httpx.AsyncClient(timeout=30.0)
    yield
    await _client.aclose()


app = FastAPI(title="Squad Board", version="3.0.0", lifespan=lifespan)


# ══════════════════════════════════════════════════════════════════════════════
# Routers (modules par domaine — migration progressive depuis main.py)
# ══════════════════════════════════════════════════════════════════════════════
from app.routers import (
    teams as _r_teams,
    groups as _r_groups,
    epics as _r_epics,
    members as _r_members,
    absences as _r_absences,
    support as _r_support,
    agile as _r_agile,
    tickets as _r_tickets,
    features as _r_features,
    planning as _r_planning,
    atlas as _r_atlas,
)

app.include_router(_r_teams.router)
app.include_router(_r_groups.router)
app.include_router(_r_epics.router)
app.include_router(_r_members.router)
app.include_router(_r_absences.router)
app.include_router(_r_support.router)
app.include_router(_r_agile.router_events)
app.include_router(_r_agile.router_retro)
app.include_router(_r_agile.router_risks)
app.include_router(_r_agile.router_mood)
app.include_router(_r_tickets.router)
app.include_router(_r_features.router)
app.include_router(_r_planning.router)
app.include_router(_r_atlas.router)


# ══════════════════════════════════════════════════════════════════════════════
# Bulk import / export
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/export")
def export_all(session: Session = Depends(get_session)):
    return {
        "tickets": [_ticket_dict(t) for t in session.exec(select(Ticket)).all()],
        "features": [_feature_dict(f) for f in session.exec(select(Feature)).all()],
        "epics": [_epic_dict(e) for e in session.exec(select(Epic)).all()],
        "members": [_member_dict(m) for m in session.exec(select(Member)).all()],
        "teams": [_team_dict(t) for t in session.exec(select(Team)).all()],
        "groups": [_group_dict(g) for g in session.exec(select(TeamGroup)).all()],
        "absences": [_absence_dict(a) for a in session.exec(select(Absence)).all()],
        "support": [_support_dict(s) for s in session.exec(select(SupportRotation)).all()],
        "events": [_event_dict(e) for e in session.exec(select(Event)).all()],
        "risks": [_risk_dict(r) for r in session.exec(select(Risk)).all()],
        "skills": [_skill_dict(s) for s in session.exec(select(Skill)).all()],
        "appetences": [_appetence_dict(a) for a in session.exec(select(Appetence)).all()],
        "memberSkills": [_member_skill_dict(ms) for ms in session.exec(select(MemberSkill)).all()],
        "memberAppetences": [_member_appetence_dict(ma) for ma in session.exec(select(MemberAppetence)).all()],
        "mobility": [_mobility_dict(m) for m in session.exec(select(MemberMobility)).all()],
        "sprint": _sprint_dict(session.get(SprintConfig, "sprint-1")),
        "pi": _pi_dict(session.get(PIConfig, "pi-1")),
        "exportedAt": _now(),
    }


@app.get("/api/all")
def get_all_data(session: Session = Depends(get_session)):
    """Single endpoint for boot load — replaces 17 parallel HTTP calls in loadAllData().
    Atlas data (skills/appetences/memberSkills/memberAppetences/mobility) is excluded
    and still loaded lazily in the background."""
    cal_events: list[dict] = []
    for cal in session.exec(select(TeamCalendar)).all():
        if not cal.events_json:
            continue
        try:
            for ev in json.loads(cal.events_json):
                ev["calendarId"] = cal.id; ev["calendarName"] = cal.name; ev["team"] = cal.team
                cal_events.append(ev)
        except Exception:
            pass
    cal_events.sort(key=lambda e: e.get("start", ""))
    return {
        "tickets":       [_ticket_dict(t) for t in session.exec(select(Ticket)).all()],
        "features":      [_feature_dict(f) for f in session.exec(select(Feature)).all()],
        "epics":         [_epic_dict(e) for e in session.exec(select(Epic)).all()],
        "members":       [_member_dict(m) for m in session.exec(select(Member)).all()],
        "teams":         [_team_dict(t) for t in session.exec(select(Team)).all()],
        "groups":        [_group_dict(g) for g in session.exec(select(TeamGroup)).all()],
        "absences":      [_absence_dict(a) for a in session.exec(select(Absence)).all()],
        "support":       [_support_dict(s) for s in session.exec(select(SupportRotation)).all()],
        "events":        [_event_dict(e) for e in session.exec(select(Event)).all()],
        "retroItems":    [_retro_dict(r) for r in session.exec(select(RetroItem)).all()],
        "risks":         [_risk_dict(r) for r in session.exec(select(Risk)).all()],
        "moodVotes":     [_mood_dict(m) for m in session.exec(select(MoodVote).where(MoodVote.type == "mood")).all()],
        "fistVotes":     [_mood_dict(m) for m in session.exec(select(MoodVote).where(MoodVote.type == "fist")).all()],
        "calendars":     [_cal_dict(c) for c in session.exec(select(TeamCalendar)).all()],
        "calendarEvents": cal_events,
        "sprint":        _sprint_dict(session.get(SprintConfig, "sprint-1")),
        "pi":            _pi_dict(session.get(PIConfig, "pi-1")),
    }


@app.post("/api/import")
async def import_all(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    mode = body.get("mode", "replace")
    counts = {}

    if "teams" in body and body["teams"] is not None:
        items = body["teams"]
        if mode == "replace":
            for row in session.exec(select(Team)).all():
                session.delete(row)
        elif mode == "merge":
            # Dédoublonnage : artefact des anciennes syncs rapides qui créaient un nouveau Team
            # à chaque sync au lieu de réutiliser l'existant. On garde le plus ancien par nom.
            existing = session.exec(select(Team)).all()
            kept_by_name = {}
            for t in existing:
                prev = kept_by_name.get(t.name)
                if prev is None:
                    kept_by_name[t.name] = t
                elif (t.created_at or '') < (prev.created_at or ''):
                    session.delete(prev); kept_by_name[t.name] = t
                else:
                    session.delete(t)
        for d in items:
            t = None
            if mode == "merge":
                # Lookup par id si fourni, sinon par nom (sync JIRA n'envoie pas d'id, mais le nom est la clé logique)
                if d.get("id"):
                    t = session.get(Team, d["id"])
                if not t and d.get("name"):
                    t = session.exec(select(Team).where(Team.name == d["name"])).first()
            if t:
                t.color = d.get("color", t.color)
                t.updated_at = _now()
            else:
                t = Team(id=d.get("id") or _gen_id(), name=d["name"], color=d.get("color", "#3b82f6"))
            session.add(t)
        counts["teams"] = len(items)

    if "members" in body and body["members"] is not None:
        items = body["members"]
        if mode == "replace":
            for row in session.exec(select(Member)).all():
                session.delete(row)
        for d in items:
            m = session.get(Member, d.get("id", "")) if mode == "merge" else None
            if m:
                m.name = d.get("name", m.name)
                m.team = d.get("team", m.team)
                m.role = d.get("role", m.role)
                m.updated_at = _now()
            else:
                m = Member(id=d.get("id") or _gen_id(), name=d["name"], team=d.get("team", ""), role=d.get("role", ""))
            session.add(m)
        counts["members"] = len(items)

    if "epics" in body and body["epics"] is not None:
        items = body["epics"]
        if mode == "replace":
            for row in session.exec(select(Epic)).all():
                session.delete(row)
        for d in items:
            e = Epic(
                id=d.get("id") or _gen_id(), title=d.get("title", ""),
                status=d.get("status", "todo"), team=d.get("team", ""),
                feature_id=d.get("feature") or d.get("feature_id"),
                pi_sprint=d.get("piSprint"), labels=d.get("labels", []),
                description=d.get("description", ""),
            )
            session.merge(e)
        counts["epics"] = len(items)

    if "features" in body and body["features"] is not None:
        items = body["features"]
        if mode == "replace":
            for row in session.exec(select(Feature)).all():
                session.delete(row)
        for d in items:
            # Préserver rank/points existants si non fournis (sync.js les envoie, test page Synchro non)
            fid = d.get("id") or _gen_id()
            existing = session.get(Feature, fid) if d.get("id") else None
            f = Feature(
                id=fid, title=d.get("title", ""),
                status=d.get("status", "todo"), team=d.get("team", ""),
                leader=d.get("leader") or d.get("assignee"),
                priority=d.get("priority", "high"),
                pi_sprint=d.get("piSprint"), labels=d.get("labels", []),
                description=d.get("description", ""),
                rank=d.get("rank", existing.rank if existing else 0),
                points=d.get("points", existing.points if existing else 0),
            )
            session.merge(f)
        counts["features"] = len(items)

    if "tickets" in body and body["tickets"] is not None:
        items = body["tickets"]
        if mode == "replace":
            for row in session.exec(select(Ticket)).all():
                session.delete(row)
        for d in items:
            t = Ticket(
                id=d.get("id") or _gen_id(), title=d.get("title", ""),
                type=d.get("type", "story"), status=d.get("status", "todo"),
                jira_status=d.get("jiraStatus", ""),
                team=d.get("team", ""),
                leader=d.get("leader") or d.get("assignee"),
                reporter=d.get("reporter"),
                contributors=d.get("contributors", []),
                points=d.get("points", 0), priority=d.get("priority", "medium"),
                sprint=d.get("sprint"), sprint_name=d.get("sprintName"),
                pi_sprint=d.get("piSprint"), flagged=d.get("flagged", False),
                labels=d.get("labels", []),
                epic_id=d.get("epic") or d.get("epic_id"),
                description=d.get("description", ""),
                links=d.get("links", []),
                comments=d.get("comments", []),
                recent_changes=d.get("recentChanges", []),
                started_date=d.get("startedDate"),
                resolved_date=d.get("resolvedDate"),
                cycle_time_days=d.get("cycleTimeDays") or 0,
                lead_time_days=d.get("leadTimeDays") or 0,
            )
            session.merge(t)
        counts["tickets"] = len(items)

    if "sprint" in body and body["sprint"] is not None:
        sd = body["sprint"]
        if isinstance(sd, list):
            sd = sd[0] if sd else {}
        s = session.get(SprintConfig, "sprint-1") or SprintConfig(id="sprint-1")
        s.name = sd.get("name", "")
        s.start_date = sd.get("startDate")
        s.end_date = sd.get("endDate")
        s.goal = sd.get("goal", "")
        if sd.get("jiraId") is not None:       s.jira_id = sd.get("jiraId")
        if sd.get("jiraBoardId") is not None:  s.jira_board_id = sd.get("jiraBoardId")
        if sd.get("teamSprints") is not None:  s.team_sprints = sd.get("teamSprints") or []
        s.updated_at = _now()
        session.add(s)

    if "pi" in body and body["pi"] is not None:
        pd = body["pi"]
        if isinstance(pd, list):
            pd = pd[0] if pd else {}
        p = session.get(PIConfig, "pi-1") or PIConfig(id="pi-1")
        p.number = pd.get("number", 0)
        p.name = pd.get("name", "")
        p.sprints_per_pi   = pd.get("sprintsPerPI", p.sprints_per_pi)
        p.sprint_duration  = pd.get("sprintDuration", p.sprint_duration)
        p.start_date       = pd.get("startDate", p.start_date)
        p.velocity_target  = pd.get("velocityTarget", p.velocity_target)
        p.objectives       = pd.get("objectives", [])
        p.sprint_velocities = pd.get("sprintVelocities", p.sprint_velocities or [])
        p.role_capacity    = pd.get("roleCapacity", p.role_capacity or {})
        p.pi_members       = pd.get("piMembers", p.pi_members or {})
        p.pi_objectives    = pd.get("piObjectives", p.pi_objectives or {})
        # Historise les objectifs importés sous la clé du PI courant si pas déjà couverts.
        if p.number and str(p.number) not in (p.pi_objectives or {}):
            snap = dict(p.pi_objectives or {})
            snap[str(p.number)] = p.objectives or []
            p.pi_objectives = snap
        p.updated_at = _now()
        session.add(p)

    if "groups" in body and body["groups"] is not None:
        items = body["groups"]
        if mode == "replace":
            for row in session.exec(select(TeamGroup)).all():
                session.delete(row)
        for d in items:
            g = TeamGroup(
                id=d.get("id") or _gen_id(), name=d.get("name", ""),
                color=d.get("color", "#6366f1"), teams=d.get("teams", []),
            )
            session.merge(g)
        counts["groups"] = len(items)

    if "absences" in body and body["absences"] is not None:
        items = body["absences"]
        if mode == "replace":
            for row in session.exec(select(Absence)).all():
                session.delete(row)
        for d in items:
            a = Absence(
                id=d.get("id") or _gen_id(),
                member_name=d.get("memberName", ""),
                team=d.get("team", ""),
                start_date=d.get("startDate", ""),
                end_date=d.get("endDate", ""),
                type=d.get("type", "conge"),
                days=d.get("days", 1.0),
                note=d.get("note", ""),
            )
            session.merge(a)
        counts["absences"] = len(items)

    if "support" in body and body["support"] is not None:
        items = body["support"]
        if mode == "replace":
            for row in session.exec(select(SupportRotation)).all():
                session.delete(row)
        for d in items:
            s = SupportRotation(
                id=d.get("id") or _gen_id(),
                team=d.get("team", ""),
                week_label=d.get("weekLabel", ""),
                week_start=d.get("weekStart", ""),
                week_end=d.get("weekEnd", ""),
                members=d.get("members", []),
            )
            session.merge(s)
        counts["support"] = len(items)

    if "events" in body and body["events"] is not None:
        items = body["events"]
        if mode == "replace":
            for row in session.exec(select(Event)).all():
                session.delete(row)
        for d in items:
            e = Event(
                id=d.get("id") or _gen_id(),
                type=d.get("type", "other"),
                title=d.get("title", ""),
                description=d.get("description", ""),
                start_date=d.get("startDate", ""),
                end_date=d.get("endDate", ""),
                teams=d.get("teams", []),
            )
            session.merge(e)
        counts["events"] = len(items)

    # ── Atlas : compétences / appétences / niveaux / mobilité ──────────────────
    if "skills" in body and body["skills"] is not None:
        items = body["skills"]
        if mode == "replace":
            for row in session.exec(select(Skill)).all():
                session.delete(row)
        for d in items:
            session.merge(Skill(
                id=d.get("id") or _gen_id(), name=d.get("name", ""),
                category=d.get("category", ""), color=d.get("color", "#6366f1"),
                sort=d.get("sort", 0),
            ))
        counts["skills"] = len(items)

    if "appetences" in body and body["appetences"] is not None:
        items = body["appetences"]
        if mode == "replace":
            for row in session.exec(select(Appetence)).all():
                session.delete(row)
        for d in items:
            session.merge(Appetence(
                id=d.get("id") or _gen_id(), name=d.get("name", ""),
                category=d.get("category", ""), color=d.get("color", "#f59e0b"),
                sort=d.get("sort", 0),
            ))
        counts["appetences"] = len(items)

    if "memberSkills" in body and body["memberSkills"] is not None:
        items = body["memberSkills"]
        if mode == "replace":
            for row in session.exec(select(MemberSkill)).all():
                session.delete(row)
        for d in items:
            session.merge(MemberSkill(
                id=d.get("id") or _gen_id(),
                scope=d.get("scope", "member"), scope_key=d.get("scopeKey", ""),
                team=d.get("team", ""), skill_id=d.get("skillId", ""),
                level=d.get("level", 0),
            ))
        counts["memberSkills"] = len(items)

    if "memberAppetences" in body and body["memberAppetences"] is not None:
        items = body["memberAppetences"]
        if mode == "replace":
            for row in session.exec(select(MemberAppetence)).all():
                session.delete(row)
        for d in items:
            session.merge(MemberAppetence(
                id=d.get("id") or _gen_id(),
                scope=d.get("scope", "member"), scope_key=d.get("scopeKey", ""),
                team=d.get("team", ""), appetence_id=d.get("appetenceId", ""),
                value=d.get("value", "neutre"),
            ))
        counts["memberAppetences"] = len(items)

    if "mobility" in body and body["mobility"] is not None:
        items = body["mobility"]
        if mode == "replace":
            for row in session.exec(select(MemberMobility)).all():
                session.delete(row)
        for d in items:
            session.merge(MemberMobility(
                id=d.get("id") or _gen_id(), member_name=d.get("memberName", ""),
                team=d.get("team", ""), target_team=d.get("targetTeam", ""),
                target_role=d.get("targetRole", ""), current_level=d.get("currentLevel", 0),
                potential=d.get("potential", "moyen"), appetence=d.get("appetence", "neutre"),
                risk=d.get("risk", "aucun"), plan=d.get("plan", ""),
                transition_duration=d.get("transitionDuration", ""),
            ))
        counts["mobility"] = len(items)

    session.commit()
    return {"ok": True, "mode": mode, "counts": counts}


# ══════════════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════════════
# Calendriers ICS
# ══════════════════════════════════════════════════════════════════════════════


@app.get("/api/calendars")
def list_calendars(session: Session = Depends(get_session)):
    return [_cal_dict(c) for c in session.exec(select(TeamCalendar)).all()]


@app.post("/api/calendars")
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


@app.put("/api/calendars/{cal_id}")
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


@app.delete("/api/calendars/{cal_id}")
def delete_calendar(cal_id: str, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    session.delete(c); session.commit()
    return {"ok": True}


@app.post("/api/calendars/{cal_id}/refresh")
async def refresh_calendar(cal_id: str, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    if not c.ical_url:
        raise HTTPException(400, "Aucune URL configurée")
    try:
        resp = await _client.get(c.ical_url, follow_redirects=True, timeout=30)
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


@app.get("/api/calendars/events")
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


# ══════════════════════════════════════════════════════════════════════════════
# Config
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/config")
def get_config():
    return {
        "jiraConfigured": bool(JIRA_URL and JIRA_USER and JIRA_TOKEN),
        "project": JIRA_PROJECT,
        "jiraUrl": JIRA_URL if JIRA_URL else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# JIRA Proxy (optional plugin)
# ══════════════════════════════════════════════════════════════════════════════
@app.api_route("/jira/{path:path}", methods=["GET", "POST", "PUT"])
async def jira_proxy(path: str, request: Request):
    if not all([JIRA_URL, JIRA_USER, JIRA_TOKEN]):
        raise HTTPException(503, "JIRA non configure")
    allowed = ("rest/api/", "rest/agile/", "rest/greenhopper/")
    if not path.startswith(allowed) or ".." in path:
        raise HTTPException(403, "Chemin interdit")

    url = f"{JIRA_URL}/{path}"
    params = dict(request.query_params)
    auth = (JIRA_USER, JIRA_TOKEN)
    headers = {"Accept": "application/json"}
    body = await request.body() if request.method != "GET" else None
    if body:
        headers["Content-Type"] = "application/json"

    try:
        resp = await _client.request(
            request.method, url, params=params, auth=auth, headers=headers, content=body
        )
    except httpx.RequestError as e:
        raise HTTPException(502, f"Connexion JIRA: {e}")

    # 204 No Content / corps vide = réponse OK sans payload (cas PUT sprint update)
    if not resp.content:
        return JSONResponse(content=None, status_code=resp.status_code)
    try:
        data = resp.json()
    except Exception:
        # JIRA peut renvoyer du texte d'erreur HTML/plain — propage le code + message brut
        if resp.is_success:
            return JSONResponse(content=None, status_code=resp.status_code)
        raise HTTPException(resp.status_code, resp.text[:300] or "Reponse JIRA invalide")

    return JSONResponse(content=data, status_code=resp.status_code)


# ── Static Files ──────────────────────────────────────────────────────────────
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
