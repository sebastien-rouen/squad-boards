"""Routeur Data — export / all (boot) / import + config.

export & all sont pilotés par un registre {clé: (Model, serializer)} (lecture, couverts
par le golden test). import_all conserve sa logique par entité (mutation à risque, non
couverte par golden) — déplacé tel quel.
"""
from fastapi import APIRouter, Request, Depends
from sqlmodel import Session, select

from app.common import _gen_id, _now
from app.config import JIRA_URL, JIRA_USER, JIRA_TOKEN, JIRA_PROJECT
from app.db import get_session
from app.services.ics import expand_calendar_events
from app.models import (
    Team, Member, Ticket, Feature, Epic, SprintConfig, PIConfig, TeamGroup,
    Absence, SupportRotation, Event, MoodVote, RetroItem, Risk,
    Skill, Appetence, MemberSkill, MemberAppetence, MemberMobility, TeamCalendar,
)
from app.serializers import (
    _ticket_dict, _feature_dict, _epic_dict, _member_dict, _team_dict, _group_dict,
    _absence_dict, _support_dict, _event_dict, _risk_dict, _skill_dict, _appetence_dict,
    _member_skill_dict, _member_appetence_dict, _mobility_dict, _sprint_dict, _pi_dict,
    _retro_dict, _mood_dict, _cal_dict,
)

router = APIRouter(tags=["data"])

# Registre des collections exportées : clé JSON → (modèle, sérialiseur).
_EXPORT_SPEC = [
    ("tickets",          Ticket,          _ticket_dict),
    ("features",         Feature,         _feature_dict),
    ("epics",            Epic,            _epic_dict),
    ("members",          Member,          _member_dict),
    ("teams",            Team,            _team_dict),
    ("groups",           TeamGroup,       _group_dict),
    ("absences",         Absence,         _absence_dict),
    ("support",          SupportRotation, _support_dict),
    ("events",           Event,           _event_dict),
    ("risks",            Risk,            _risk_dict),
    ("skills",           Skill,           _skill_dict),
    ("appetences",       Appetence,       _appetence_dict),
    ("memberSkills",     MemberSkill,     _member_skill_dict),
    ("memberAppetences", MemberAppetence, _member_appetence_dict),
    ("mobility",         MemberMobility,  _mobility_dict),
]


@router.get("/api/export")
def export_all(session: Session = Depends(get_session)):
    out = {key: [ser(x) for x in session.exec(select(model)).all()]
           for key, model, ser in _EXPORT_SPEC}
    out["sprint"] = _sprint_dict(session.get(SprintConfig, "sprint-1"))
    out["pi"] = _pi_dict(session.get(PIConfig, "pi-1"))
    out["exportedAt"] = _now()
    return out


@router.get("/api/all")
def get_all_data(session: Session = Depends(get_session)):
    """Single endpoint for boot load — replaces 17 parallel HTTP calls in loadAllData().
    Atlas data (skills/appetences/memberSkills/memberAppetences/mobility) is excluded
    and still loaded lazily in the background."""
    cals = session.exec(select(TeamCalendar)).all()
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
        "calendars":     [_cal_dict(c) for c in cals],
        "calendarEvents": expand_calendar_events(cals),
        "sprint":        _sprint_dict(session.get(SprintConfig, "sprint-1")),
        "pi":            _pi_dict(session.get(PIConfig, "pi-1")),
    }


@router.post("/api/import")
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


@router.get("/api/config")
def get_config():
    return {
        "jiraConfigured": bool(JIRA_URL and JIRA_USER and JIRA_TOKEN),
        "project": JIRA_PROJECT,
        "jiraUrl": JIRA_URL if JIRA_URL else None,
    }
