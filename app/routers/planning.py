"""Routeur Planning — SprintConfig & PIConfig (singletons sprint-1 / pi-1).

Inclut l'historisation des objectifs PI (snapshot par numéro de PI).
"""
import re

from fastapi import APIRouter, Request, Depends, HTTPException
from sqlmodel import Session

from app.common import _now
from app.db import get_session
from app.models import SprintConfig, PIConfig
from app.serializers import _sprint_dict, _pi_dict

router = APIRouter(tags=["planning"])


def _current_pi_number(session: Session, p: PIConfig | None) -> int:
    """Numéro du PI courant — MÊME dérivation que le front (`_extractPi(sprintInfo.name)`).

    ⚠️ `PIConfig.number` vaut 0 en base : le PI courant n'est jamais écrit, il est déduit du
    sprint JIRA actif (ex. "Team A - Itération 30.6" → 30). Les gardes `if p.number` étaient
    donc TOUJOURS fausses : `set_pi_objectives()` ne synchronisait jamais `objectives` (le jeu
    vivant) et `update_pi()` ne prenait jamais de snapshot. Comme la lecture du PI courant
    privilégie `objectives` sur `pi_objectives[n]` (cf. resolvePiObjectives, utils.js), un
    enregistrement passé par /api/pi/objectives/{n} restait invisible : l'écran réaffichait
    les anciennes valeurs après rafraîchissement.
    """
    s = session.get(SprintConfig, "sprint-1")
    name = (s.name if s else "") or ""
    m = re.search(r"(\d+)\.\d+", name) or re.search(r"PI\s*#?\s*(\d+)", name, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return p.number if p and p.number else 0


# ── Sprint config ────────────────────────────────────────────────────────────
@router.get("/api/sprint")
def get_sprint(session: Session = Depends(get_session)):
    s = session.get(SprintConfig, "sprint-1")
    return _sprint_dict(s)


@router.get("/api/sync-stamp")
def get_sync_stamp(session: Session = Depends(get_session)):
    """Horodatage du dernier import JIRA — quelques octets, interrogés toutes les 5 min par le
    mode TV : il ne recharge `/api/all` (~15 Mo) que si cette valeur a changé.

    La config sprint est réécrite à chaque import (`import_all`, data.py) : son `updated_at` date
    donc la dernière synchro. (Une édition manuelle du sprint la touche aussi : recharge sans
    conséquence.)
    """
    s = session.get(SprintConfig, "sprint-1")
    return {"updatedAt": s.updated_at if s else None}


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
    # Posés par la synchro seulement : une édition manuelle du sprint ne les efface pas.
    if "syncedBy" in body:     s.synced_by = str(body.get("syncedBy") or "")[:80]
    if "syncKind" in body:     s.sync_kind = str(body.get("syncKind") or "")[:20]
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
    if "supportWeekModes" in body:
        p.support_week_modes = body.get("supportWeekModes") or {}
    if "statusOverride" in body:
        p.done_override = _clean_status_override(body.get("statusOverride"))
    # Historisation auto : à chaque save des objectifs du PI courant, on snapshot dans
    # pi_objectives[number] pour que les PI passés restent consultables (dashboard / sélecteur).
    # Le snapshot ne s'écrase qu'à la clé du PI courant — les autres PI sont préservés.
    cur_pi = _current_pi_number(session, p)
    if "objectives" in body and cur_pi:
        snap = dict(p.pi_objectives or {})
        snap[str(cur_pi)] = p.objectives or []
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


_WEEK_MODES = {"monday", "tuesday", "wednesday", "thursday", "friday"}


@router.put("/api/pi/support-week-mode")
async def set_support_week_mode(request: Request, session: Session = Depends(get_session)):
    """Mode de semaine de support d'UNE équipe. Fusion — les autres équipes sont préservées.

    Body : { team, mode } avec mode ∈ monday | tuesday | wednesday | thursday | friday.
    Clé par clé plutôt que PUT /api/pi complet : deux navigateurs qui règlent deux équipes
    différentes ne s'écrasent pas l'un l'autre.
    """
    body = await request.json()
    team, mode = (body.get("team") or "").strip(), body.get("mode")
    if not team or mode not in _WEEK_MODES:
        raise HTTPException(400, "team et mode (monday … friday) requis")
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    modes = dict(p.support_week_modes or {})
    modes[team] = mode
    p.support_week_modes = modes
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "supportWeekModes": p.support_week_modes}


# Colonnes cibles, par PRIORITÉ : un statut présent dans deux listes reste dans la première.
_OVERRIDE_TARGETS = ("done", "inprog", "todo")


def _clean_labels(values, cap=60) -> list:
    """Libellés nettoyés : texte, 1 à 80 caractères, sans doublon (casse ignorée), `cap` au plus."""
    seen, out = set(), []
    for v in values or []:
        v = str(v).strip()[:80]
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out[:cap]


def _clean_status_override(raw) -> dict:
    """Valide la règle des statuts forcés : {done|inprog|todo: {statuses, exceptTeams}}.

    Ancienne forme {statuses, exceptTeams} (Terminé seul, 3.193.0) lue comme « done ». Un statut ne
    vit que dans une colonne (priorité done > inprog > todo). Aucun statut nulle part → {} (valeurs par
    défaut du front).
    """
    if not isinstance(raw, dict):
        return {}
    if "statuses" in raw:
        raw = {"done": raw}
    out, taken = {}, set()
    for cat in _OVERRIDE_TARGETS:
        part = raw.get(cat)
        if not isinstance(part, dict):
            continue
        statuses = [s for s in _clean_labels(part.get("statuses")) if s.lower() not in taken]
        taken.update(s.lower() for s in statuses)
        out[cat] = {"statuses": statuses, "exceptTeams": _clean_labels(part.get("exceptTeams"))}
    return out if any(v["statuses"] for v in out.values()) else {}


@router.put("/api/pi/status-override")
async def set_status_override(request: Request, session: Session = Depends(get_session)):
    """Statuts JIRA forcés dans une colonne (Paramètres → JIRA) :
    {done|inprog|todo: {statuses: [...], exceptTeams: [...]}}.

    Route dédiée plutôt que PUT /api/pi complet, comme les modes de semaine du support : ne touche
    rien d'autre de la config PI. Corps {} → retour aux valeurs par défaut.
    """
    body = await request.json()
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    p.done_override = _clean_status_override(body)
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "statusOverride": p.done_override or {}}


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
    # Le PI courant garde `objectives` (jeu vivant) aligne sur son snapshot : sans cela,
    # la lecture du PI courant (qui privilegie `objectives`) ignore l'enregistrement.
    cur_pi = _current_pi_number(session, p)
    if cur_pi and pi_number == cur_pi:
        p.objectives = objectives
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "piNumber": pi_number, "count": len(objectives)}
