"""Routeur Planning — SprintConfig & PIConfig (singletons sprint-1 / pi-1).

Inclut l'historisation des objectifs PI (snapshot par numéro de PI).
"""
from fastapi import APIRouter, Request, Depends
from sqlmodel import Session

from app.common import _now
from app.db import get_session
from app.models import SprintConfig, PIConfig
from app.serializers import _sprint_dict, _pi_dict

router = APIRouter(tags=["planning"])


# ── Sprint config ────────────────────────────────────────────────────────────
@router.get("/api/sprint")
def get_sprint(session: Session = Depends(get_session)):
    s = session.get(SprintConfig, "sprint-1")
    return _sprint_dict(s)


@router.put("/api/sprint")
async def update_sprint(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    s = session.get(SprintConfig, "sprint-1")
    if not s:
        s = SprintConfig(id="sprint-1")
    s.name = body.get("name", s.name)
    s.start_date = body.get("startDate", s.start_date)
    s.end_date = body.get("endDate", s.end_date)
    s.goal = body.get("goal", s.goal)
    if "jiraId" in body:       s.jira_id = body.get("jiraId")
    if "jiraBoardId" in body:  s.jira_board_id = body.get("jiraBoardId")
    if "teamSprints" in body:  s.team_sprints = body.get("teamSprints") or []
    s.updated_at = _now()
    session.add(s)
    session.commit()
    session.refresh(s)
    return _sprint_dict(s)


# ── PI config ────────────────────────────────────────────────────────────────
@router.get("/api/pi")
def get_pi(session: Session = Depends(get_session)):
    p = session.get(PIConfig, "pi-1")
    return _pi_dict(p)


@router.put("/api/pi")
async def update_pi(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    p.number = body.get("number", p.number)
    p.name = body.get("name", p.name)
    p.sprints_per_pi = body.get("sprintsPerPI", p.sprints_per_pi)
    p.sprint_duration = body.get("sprintDuration", p.sprint_duration)
    if "startDate" in body:
        p.start_date = body.get("startDate") or None
    p.velocity_target    = body.get("velocityTarget", p.velocity_target)
    p.objectives         = body.get("objectives", p.objectives)
    p.sprint_velocities  = body.get("sprintVelocities", p.sprint_velocities)
    if "roleCapacity" in body:
        p.role_capacity  = body.get("roleCapacity") or {}
    if "piMembers" in body:
        p.pi_members     = body.get("piMembers") or {}
    if "piObjectives" in body:
        p.pi_objectives  = body.get("piObjectives") or {}
    if "piBaselines" in body:
        p.pi_baselines   = body.get("piBaselines") or {}
    # Historisation auto : à chaque save des objectifs du PI courant, on snapshot dans
    # pi_objectives[number] pour que les PI passés restent consultables (dashboard / sélecteur).
    # Le snapshot ne s'écrase qu'à la clé du PI courant — les autres PI sont préservés.
    if "objectives" in body and p.number:
        snap = dict(p.pi_objectives or {})
        snap[str(p.number)] = p.objectives or []
        p.pi_objectives = snap
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return _pi_dict(p)


@router.put("/api/pi/members/{pi_number}")
async def set_pi_members(pi_number: int, request: Request, session: Session = Depends(get_session)):
    """Enregistre le snapshot des membres d'UN PI (fusion — n'écrase pas les autres PI)."""
    body = await request.json()
    members = body.get("members", [])
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    current = dict(p.pi_members or {})
    current[str(pi_number)] = members
    p.pi_members = current
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "piNumber": pi_number, "count": len(members)}


@router.put("/api/pi/baseline/{pi_number}")
async def set_pi_baseline(pi_number: int, request: Request, session: Session = Depends(get_session)):
    """Fige le snapshot de commitment d'UN PI (baseline). Fusion — n'écrase pas les autres PI.

    Body : { features: [{id, title, team, points, status}], committedPts }
    Stocke aussi capturedAt (horodatage de la capture).
    """
    body = await request.json()
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    current = dict(p.pi_baselines or {})
    current[str(pi_number)] = {
        "capturedAt": _now(),
        "committedPts": body.get("committedPts", 0),
        "features": body.get("features", []),
    }
    p.pi_baselines = current
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "piNumber": pi_number, "count": len(body.get("features", []))}


@router.put("/api/pi/objectives/{pi_number}")
async def set_pi_objectives(pi_number: int, request: Request, session: Session = Depends(get_session)):
    """Enregistre le snapshot des objectifs d'UN PI (fusion — n'écrase pas les autres PI).

    Si pi_number == PI courant, met aussi à jour `objectives` (le jeu vivant) pour rester cohérent.
    """
    body = await request.json()
    objectives = body.get("objectives", [])
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    current = dict(p.pi_objectives or {})
    current[str(pi_number)] = objectives
    p.pi_objectives = current
    if p.number and pi_number == p.number:
        p.objectives = objectives
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "piNumber": pi_number, "count": len(objectives)}
