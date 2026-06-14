"""Sérialiseurs ORM → dict (contrat camelCase du front).

⚠ SOURCE UNIQUE du contrat d'API consommé par le frontend. Toute modification
de forme ici impacte directement le JS — à garder synchrone (cf. golden test
/api/export & /api/all).
"""
from app.models import (
    Ticket, Feature, Risk, Epic, Member, Team, Skill, Appetence,
    MemberSkill, MemberAppetence, MemberMobility, SprintConfig, PIConfig,
    TeamGroup, Absence, SupportRotation, Event, MoodVote, RetroItem,
    TeamCalendar,
)


def _ticket_dict(t: Ticket) -> dict:
    return {
        "id": t.id, "title": t.title, "type": t.type, "status": t.status,
        "jiraStatus": t.jira_status or "",
        "team": t.team, "leader": t.leader, "reporter": t.reporter,
        "contributors": t.contributors or [],
        "assignee": t.leader,
        "points": t.points, "priority": t.priority,
        "sprint": t.sprint, "sprintName": t.sprint_name, "piSprint": t.pi_sprint,
        "flagged": t.flagged, "labels": t.labels or [],
        "epic": t.epic_id, "description": t.description,
        "links": t.links or [],
        "comments": t.comments or [], "recentChanges": t.recent_changes or [],
        "createdAt": t.created_at, "updatedAt": t.updated_at,
        "startedDate": t.started_date,
        "resolvedDate": t.resolved_date,
        "cycleTimeDays": t.cycle_time_days or 0,
        "leadTimeDays": t.lead_time_days or 0,
    }


def _feature_dict(f: Feature) -> dict:
    return {
        "id": f.id, "title": f.title, "type": "feature", "status": f.status,
        "team": f.team, "leader": f.leader, "assignee": f.leader,
        "priority": f.priority, "piSprint": f.pi_sprint,
        "rank": f.rank or 0,
        "points": f.points or 0,
        "dependencies": f.dependencies or [],
        "labels": f.labels or [], "description": f.description,
        "createdAt": f.created_at, "updatedAt": f.updated_at,
    }


def _risk_dict(r: Risk) -> dict:
    return {
        "id": r.id, "title": r.title, "description": r.description,
        "quadrant": r.quadrant, "team": r.team, "owner": r.owner,
        "impact": r.impact, "probability": r.probability,
        "mitigation": r.mitigation, "piSprint": r.pi_sprint,
        "createdAt": r.created_at, "updatedAt": r.updated_at,
    }


def _epic_dict(e: Epic) -> dict:
    return {
        "id": e.id, "title": e.title, "type": "epic", "status": e.status,
        "team": e.team, "feature": e.feature_id, "piSprint": e.pi_sprint,
        "labels": e.labels or [], "description": e.description,
        "createdAt": e.created_at, "updatedAt": e.updated_at,
    }


def _member_dict(m: Member) -> dict:
    return {
        "id": m.id, "name": m.name, "team": m.team, "role": m.role,
        "entity": m.entity,
        "createdAt": m.created_at, "updatedAt": m.updated_at,
    }


def _team_dict(t: Team) -> dict:
    return {
        "id": t.id, "name": t.name, "color": t.color,
        "createdAt": t.created_at, "updatedAt": t.updated_at,
    }


def _skill_dict(s: Skill) -> dict:
    return {"id": s.id, "name": s.name, "category": s.category, "color": s.color, "sort": s.sort}


def _appetence_dict(a: Appetence) -> dict:
    return {"id": a.id, "name": a.name, "category": a.category, "color": a.color, "sort": a.sort}


def _member_skill_dict(ms: MemberSkill) -> dict:
    return {"id": ms.id, "scope": ms.scope, "scopeKey": ms.scope_key, "team": ms.team,
            "skillId": ms.skill_id, "level": ms.level, "updatedAt": ms.updated_at}


def _member_appetence_dict(ma: MemberAppetence) -> dict:
    return {"id": ma.id, "scope": ma.scope, "scopeKey": ma.scope_key, "team": ma.team,
            "appetenceId": ma.appetence_id, "value": ma.value, "updatedAt": ma.updated_at}


def _mobility_dict(m: MemberMobility) -> dict:
    return {"id": m.id, "memberName": m.member_name, "team": m.team,
            "targetTeam": m.target_team, "targetRole": m.target_role,
            "currentLevel": m.current_level, "potential": m.potential,
            "appetence": m.appetence, "risk": m.risk, "plan": m.plan,
            "transitionDuration": m.transition_duration, "updatedAt": m.updated_at}


def _sprint_dict(s: SprintConfig) -> dict | None:
    if not s:
        return None
    return {
        "name": s.name, "startDate": s.start_date, "endDate": s.end_date,
        "goal": s.goal, "updatedAt": s.updated_at,
        "jiraId": s.jira_id, "jiraBoardId": s.jira_board_id,
        "teamSprints": s.team_sprints or [],
    }


def _pi_dict(p: PIConfig) -> dict | None:
    if not p:
        return None
    return {
        "number": p.number, "name": p.name,
        "sprintsPerPI": p.sprints_per_pi, "sprintDuration": p.sprint_duration,
        "startDate": p.start_date,
        "velocityTarget": p.velocity_target,
        "objectives": p.objectives or [],
        "sprintVelocities": p.sprint_velocities or [],
        "roleCapacity": p.role_capacity or {},
        "piMembers": p.pi_members or {},
        "piObjectives": p.pi_objectives or {},
        "updatedAt": p.updated_at,
    }


def _group_dict(g: TeamGroup) -> dict:
    return {
        "id": g.id, "name": g.name, "color": g.color,
        "teams": g.teams or [],
        "createdAt": g.created_at, "updatedAt": g.updated_at,
    }


def _absence_dict(a: Absence) -> dict:
    return {
        "id": a.id, "memberName": a.member_name, "team": a.team,
        "startDate": a.start_date, "endDate": a.end_date,
        "type": a.type, "days": a.days, "note": a.note,
        "createdAt": a.created_at, "updatedAt": a.updated_at,
    }


def _support_dict(s: SupportRotation) -> dict:
    return {
        "id": s.id, "team": s.team, "weekLabel": s.week_label,
        "weekStart": s.week_start, "weekEnd": s.week_end,
        "members": s.members or [],
        "locked": s.locked, "unlocked": s.unlocked, "membersPerWeek": s.members_per_week,
        "weekMode": s.week_mode,
        "updatedAt": s.updated_at,
    }


def _event_dict(e: Event) -> dict:
    return {
        "id": e.id, "type": e.type, "title": e.title,
        "description": e.description,
        "startDate": e.start_date, "endDate": e.end_date,
        "teams": e.teams or [],
        "createdAt": e.created_at, "updatedAt": e.updated_at,
    }


def _mood_dict(m: MoodVote) -> dict:
    return {
        "id": m.id, "type": m.type, "team": m.team,
        "value": m.value, "piSprint": m.pi_sprint,
        "author": m.author, "note": m.note,
        "createdAt": m.created_at,
    }


def _retro_dict(r: RetroItem) -> dict:
    return {
        "id": r.id, "title": r.title, "source": r.source,
        "status": r.status, "team": r.team, "owner": r.owner,
        "piSprint": r.pi_sprint,
        "createdAt": r.created_at, "updatedAt": r.updated_at,
    }


def _cal_dict(c: TeamCalendar) -> dict:
    return {
        "id": c.id, "team": c.team, "name": c.name,
        "icalUrl": c.ical_url, "lastFetched": c.last_fetched,
        "createdAt": c.created_at,
    }
