"""Routeur Atlas — compétences, appétences, niveaux par membre/équipe, mobilité, compétences requises.

Upsert par clé logique (member-skills / member-appetences), suppression en cascade
des niveaux (et des exigences d'équipe) quand on supprime une compétence/appétence du catalogue.
"""
import json

from fastapi import APIRouter, Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _gen_id, _now
from app.db import get_session
from app.models import (
    Skill, Appetence, MemberSkill, MemberAppetence, MemberMobility, SkillLevelHistory,
    TeamSkillRequirement,
)
from app.serializers import (
    _skill_dict, _appetence_dict, _member_skill_dict, _member_appetence_dict,
    _mobility_dict, _skill_history_dict, _team_skill_req_dict,
)

_APPETENCES = ("faible", "neutre", "forte")
_STAGES = ("souhait", "plan", "en_cours", "bilan")

router = APIRouter(tags=["atlas"])


# ── Skills ───────────────────────────────────────────────────────────────────
@router.get("/api/skills")
def list_skills(session: Session = Depends(get_session)):
    rows = session.exec(select(Skill)).all()
    return [_skill_dict(s) for s in sorted(rows, key=lambda x: (x.sort, x.name))]


@router.post("/api/skills")
async def create_skill(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    s = Skill(id=body.get("id") or _gen_id(), name=body["name"],
              category=body.get("category", ""), color=body.get("color", "#6366f1"),
              sort=body.get("sort", 0))
    session.add(s); session.commit(); session.refresh(s)
    return _skill_dict(s)


@router.put("/api/skills/{skill_id}")
async def update_skill(skill_id: str, request: Request, session: Session = Depends(get_session)):
    s = session.get(Skill, skill_id)
    if not s:
        raise HTTPException(404, "Compétence non trouvée")
    body = await request.json()
    for k, v in body.items():
        if hasattr(s, k):
            setattr(s, k, v)
    s.updated_at = _now()
    session.add(s); session.commit(); session.refresh(s)
    return _skill_dict(s)


@router.delete("/api/skills/{skill_id}")
def delete_skill(skill_id: str, session: Session = Depends(get_session)):
    s = session.get(Skill, skill_id)
    if not s:
        raise HTTPException(404, "Compétence non trouvée")
    session.delete(s)
    # Nettoie les niveaux et les exigences d'équipe associés
    for ms in session.exec(select(MemberSkill).where(MemberSkill.skill_id == skill_id)).all():
        session.delete(ms)
    for r in session.exec(select(TeamSkillRequirement).where(TeamSkillRequirement.skill_id == skill_id)).all():
        session.delete(r)
    session.commit()
    return {"ok": True}


# ── Appetences ───────────────────────────────────────────────────────────────
@router.get("/api/appetences")
def list_appetences(session: Session = Depends(get_session)):
    rows = session.exec(select(Appetence)).all()
    return [_appetence_dict(a) for a in sorted(rows, key=lambda x: (x.sort, x.name))]


@router.post("/api/appetences")
async def create_appetence(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    a = Appetence(id=body.get("id") or _gen_id(), name=body["name"],
                  category=body.get("category", ""), color=body.get("color", "#f59e0b"),
                  sort=body.get("sort", 0))
    session.add(a); session.commit(); session.refresh(a)
    return _appetence_dict(a)


@router.put("/api/appetences/{appetence_id}")
async def update_appetence(appetence_id: str, request: Request, session: Session = Depends(get_session)):
    a = session.get(Appetence, appetence_id)
    if not a:
        raise HTTPException(404, "Appétence non trouvée")
    body = await request.json()
    for k, v in body.items():
        if hasattr(a, k):
            setattr(a, k, v)
    a.updated_at = _now()
    session.add(a); session.commit(); session.refresh(a)
    return _appetence_dict(a)


@router.delete("/api/appetences/{appetence_id}")
def delete_appetence(appetence_id: str, session: Session = Depends(get_session)):
    a = session.get(Appetence, appetence_id)
    if not a:
        raise HTTPException(404, "Appétence non trouvée")
    session.delete(a)
    for ma in session.exec(select(MemberAppetence).where(MemberAppetence.appetence_id == appetence_id)).all():
        session.delete(ma)
    session.commit()
    return {"ok": True}


# ── Member skills (upsert par clé logique) ───────────────────────────────────
@router.get("/api/member-skills")
def list_member_skills(session: Session = Depends(get_session)):
    return [_member_skill_dict(ms) for ms in session.exec(select(MemberSkill)).all()]


@router.put("/api/member-skills")
async def upsert_member_skill(request: Request, session: Session = Depends(get_session)):
    """Upsert par clé logique scope|scope_key|skill_id.

    `level` et `appetence` sont FACULTATIFS : un champ absent garde sa valeur (envoyer une envie seule ne
    remet pas le niveau à 0). La ligne disparaît quand il ne reste ni niveau ni envie (0 + neutre).
    """
    body = await request.json()
    scope = body.get("scope", "member")
    scope_key = (body.get("scopeKey") or "").strip()
    skill_id = body.get("skillId") or ""
    if not scope_key or not skill_id:
        raise HTTPException(400, "scopeKey et skillId requis")
    if "appetence" in body and body["appetence"] not in _APPETENCES:
        raise HTTPException(400, "appetence : faible | neutre | forte")
    row = session.exec(select(MemberSkill).where(
        MemberSkill.scope == scope, MemberSkill.scope_key == scope_key,
        MemberSkill.skill_id == skill_id)).first()
    prev = row.level if row else 0
    level = max(int(body["level"]), 0) if "level" in body else prev
    appetence = body.get("appetence") or (row.appetence if row else "neutre") or "neutre"
    # Historique (3.198.0) : une ligne par CHANGEMENT réel de niveau (même niveau resaisi = rien).
    if level != prev:
        session.add(SkillLevelHistory(scope=scope, scope_key=scope_key,
                                      team=body.get("team", row.team if row else ""),
                                      skill_id=skill_id, prev_level=prev, level=level))
    if level <= 0 and appetence == "neutre":
        if row:
            session.delete(row)
        session.commit()
        return {"ok": True, "deleted": True}
    if row:
        row.level = level; row.appetence = appetence
        row.team = body.get("team", row.team); row.updated_at = _now()
    else:
        row = MemberSkill(scope=scope, scope_key=scope_key, team=body.get("team", ""),
                          skill_id=skill_id, level=level, appetence=appetence)
    session.add(row); session.commit(); session.refresh(row)
    return _member_skill_dict(row)


@router.get("/api/skill-history")
def list_skill_history(scope: str = "", key: str = "", session: Session = Depends(get_session)):
    """Changements de niveau, du plus ancien au plus récent ; filtrables par scope et scope_key."""
    q = select(SkillLevelHistory)
    if scope:
        q = q.where(SkillLevelHistory.scope == scope)
    if key:
        q = q.where(SkillLevelHistory.scope_key == key)
    rows = session.exec(q).all()
    return [_skill_history_dict(h) for h in sorted(rows, key=lambda h: h.changed_at or "")]


# ── Member appetences (upsert par clé logique) ───────────────────────────────
@router.get("/api/member-appetences")
def list_member_appetences(session: Session = Depends(get_session)):
    return [_member_appetence_dict(ma) for ma in session.exec(select(MemberAppetence)).all()]


@router.put("/api/member-appetences")
async def upsert_member_appetence(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    scope = body.get("scope", "member")
    scope_key = (body.get("scopeKey") or "").strip()
    appetence_id = body.get("appetenceId") or ""
    value = body.get("value", "neutre")
    if not scope_key or not appetence_id:
        raise HTTPException(400, "scopeKey et appetenceId requis")
    row = session.exec(select(MemberAppetence).where(
        MemberAppetence.scope == scope, MemberAppetence.scope_key == scope_key,
        MemberAppetence.appetence_id == appetence_id)).first()
    if value == "neutre" and not body.get("keepNeutre"):
        if row:
            session.delete(row); session.commit()
        return {"ok": True, "deleted": True}
    if row:
        row.value = value; row.team = body.get("team", row.team); row.updated_at = _now()
    else:
        row = MemberAppetence(scope=scope, scope_key=scope_key, team=body.get("team", ""),
                              appetence_id=appetence_id, value=value)
    session.add(row); session.commit(); session.refresh(row)
    return _member_appetence_dict(row)


# ── Mobility (upsert par memberName) ─────────────────────────────────────────
@router.get("/api/mobility")
def list_mobility(session: Session = Depends(get_session)):
    return [_mobility_dict(m) for m in session.exec(select(MemberMobility)).all()]


@router.put("/api/mobility")
async def upsert_mobility(request: Request, session: Session = Depends(get_session)):
    """Upsert une ligne de mobilité par memberName (1 ligne par membre)."""
    body = await request.json()
    member_name = (body.get("memberName") or "").strip()
    if not member_name:
        raise HTTPException(400, "memberName requis")
    row = session.exec(select(MemberMobility).where(
        MemberMobility.member_name == member_name)).first()
    if not row:
        row = MemberMobility(member_name=member_name)
    _map = {"team": "team", "targetTeam": "target_team", "targetRole": "target_role",
            "currentLevel": "current_level", "potential": "potential",
            "appetence": "appetence", "risk": "risk", "plan": "plan",
            "transitionDuration": "transition_duration", "mentor": "mentor"}
    for k, attr in _map.items():
        if k in body:
            setattr(row, attr, body[k])
    if "stage" in body:
        if body["stage"] not in _STAGES:
            raise HTTPException(400, "stage : souhait | plan | en_cours | bilan")
        row.stage = body["stage"]
    if "steps" in body:
        if not isinstance(body["steps"], list):
            raise HTTPException(400, "steps : liste attendue")
        row.steps = json.dumps(body["steps"], ensure_ascii=False)
    row.updated_at = _now()
    session.add(row); session.commit(); session.refresh(row)
    return _mobility_dict(row)


@router.delete("/api/mobility/{mobility_id}")
def delete_mobility(mobility_id: str, session: Session = Depends(get_session)):
    m = session.get(MemberMobility, mobility_id)
    if not m:
        raise HTTPException(404, "Ligne non trouvée")
    session.delete(m); session.commit()
    return {"ok": True}


# ── Compétences requises par équipe (3.262.0) ────────────────────────────────
@router.get("/api/team-skill-requirements")
def list_team_skill_requirements(session: Session = Depends(get_session)):
    return [_team_skill_req_dict(r) for r in session.exec(select(TeamSkillRequirement)).all()]


@router.put("/api/team-skill-requirements")
async def set_team_skill_requirement(request: Request, session: Session = Depends(get_session)):
    """Pose ou retire une exigence : {team, skillId, required: bool}. Idempotent."""
    body = await request.json()
    team = (body.get("team") or "").strip()
    skill_id = body.get("skillId") or ""
    if not team or not skill_id:
        raise HTTPException(400, "team et skillId requis")
    if not session.get(Skill, skill_id):
        raise HTTPException(404, "Compétence non trouvée")
    rows = session.exec(select(TeamSkillRequirement).where(
        TeamSkillRequirement.team == team, TeamSkillRequirement.skill_id == skill_id)).all()
    if body.get("required", True):
        if not rows:
            session.add(TeamSkillRequirement(team=team, skill_id=skill_id))
    else:
        for r in rows:
            session.delete(r)
    session.commit()
    return {"ok": True, "team": team, "skillId": skill_id, "required": bool(body.get("required", True))}
