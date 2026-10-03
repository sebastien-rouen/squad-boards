"""Routeur Config — bundle de configuration CURÉE, sauvegarde `.local` (3.198.0).

≠ `/api/export` (snapshot complet) : le bundle exclut ce que la synchro JIRA rapatrie — tickets,
features, epics et sprints — pour rester léger et réimportable après un reset de base ou un changement
de poste. Il ajoute les règles d'agenda (`calendar_rule`), absentes de l'export complet.

`CONFIG_DOMAINS` est la SOURCE UNIQUE des domaines, pour l'export ET l'import : une nouvelle table de
configuration s'ajoute ici, et nulle part ailleurs (sinon elle manquerait à la restauration).
L'import réutilise `import_body` (data.py) en mode `merge` par défaut : rien n'est effacé.

⚠️ Le fichier contient des données personnelles (absences RH) et des URL d'agenda parfois tokenisées :
nommé `*.local.json` (ignoré par git), jamais versionné ni partagé.
"""
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlmodel import Session, select

from app.common import _gen_id, _now
from app.db import get_session
from app.models import CalendarRule, MoodVote, PIConfig, SkillLevelHistory
from app.routers.calendar_rules import _rule_dict
from app.routers.data import _EXPORT_SPEC, import_body
from app.serializers import _pi_dict, _mood_dict, _skill_history_dict

router = APIRouter(tags=["config"])

# Clés de /api/export reprises par le bundle (et acceptées à l'import), dans l'ordre d'import.
CONFIG_DOMAINS = [
    "teams", "groups", "members", "pi",
    "absences", "support", "events", "calendars",
    "skills", "appetences", "memberSkills", "memberAppetences", "mobility",
    "teamIdentities", "workshopTemplates", "teamWorkshops",
    "moodVotes", "fistVotes", "confidenceVotes", "retroItems", "risks",
]
BUNDLE_VERSION = "1"


@router.get("/api/config/export")
def export_config(session: Session = Depends(get_session)):
    # Lecture des seuls domaines du bundle (export_all sérialiserait aussi ~15 Mo de tickets).
    spec = {k: (model, ser) for k, model, ser in _EXPORT_SPEC}
    votes = {"moodVotes": "mood", "fistVotes": "fist", "confidenceVotes": "confidence"}
    db = {}
    for k in CONFIG_DOMAINS:
        if k in spec:
            model, ser = spec[k]
            db[k] = [ser(x) for x in session.exec(select(model)).all()]
        elif k in votes:
            db[k] = [_mood_dict(m) for m in session.exec(select(MoodVote).where(MoodVote.type == votes[k])).all()]
        elif k == "pi":
            db[k] = _pi_dict(session.get(PIConfig, "pi-1"))
    db["calendarRules"] = [_rule_dict(r) for r in session.exec(select(CalendarRule)).all()]
    db["skillHistory"] = [_skill_history_dict(h) for h in session.exec(select(SkillLevelHistory)).all()]
    return {
        "_meta": {"app": "squad-board", "version": BUNDLE_VERSION, "exportedAt": _now(), "domains": list(db)},
        "db": db,
    }


@router.post("/api/config/import")
async def import_config(request: Request, session: Session = Depends(get_session)):
    """Body = le bundle entier ({_meta, db}) ou le seul bloc `db`. `mode` : merge (défaut) | replace."""
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(400, "Bundle invalide : objet JSON attendu")
    meta = body.get("_meta") or {}
    if meta and meta.get("app") not in (None, "squad-board"):
        raise HTTPException(400, "Ce fichier ne vient pas de Squad Board")
    db = body.get("db") if isinstance(body.get("db"), dict) else body
    mode = "replace" if body.get("mode") == "replace" else "merge"
    payload = {k: db[k] for k in CONFIG_DOMAINS if isinstance(db.get(k), (list, dict))}
    payload["mode"] = mode
    res = import_body(payload, session)
    counts = dict(res.get("counts") or {})
    if "pi" in payload:
        counts["pi"] = 1

    # Règles d'agenda : clé logique = titre normalisé (unique) — upsert, jamais de doublon.
    rules = db.get("calendarRules")
    if isinstance(rules, list):
        n = 0
        for d in rules:
            key = str((d or {}).get("titleNorm") or "").strip()[:200]
            if not key:
                continue
            r = session.exec(select(CalendarRule).where(CalendarRule.title_norm == key)).first()
            if not r:
                r = CalendarRule(id=d.get("id") or _gen_id(), title_norm=key)
            r.nature = str(d.get("nature") or "other")[:40]
            r.title_example = str(d.get("titleExample") or "")[:200]
            if hasattr(r, "updated_at"):
                r.updated_at = _now()
            session.add(r)
            n += 1
        session.commit()
        counts["calendarRules"] = n
    # Historique des niveaux Atlas : ajout par id (une ligne d'historique ne se réécrit pas).
    hist = db.get("skillHistory")
    if isinstance(hist, list):
        n = 0
        for d in hist:
            if not isinstance(d, dict) or not d.get("id") or session.get(SkillLevelHistory, d["id"]):
                continue
            session.add(SkillLevelHistory(
                id=d["id"], scope=d.get("scope", "member"), scope_key=d.get("scopeKey", ""),
                team=d.get("team", ""), skill_id=d.get("skillId", ""),
                prev_level=int(d.get("prevLevel") or 0), level=int(d.get("level") or 0),
                changed_at=d.get("changedAt") or _now(),
            ))
            n += 1
        session.commit()
        counts["skillHistory"] = n
    return {"ok": True, "mode": mode, "counts": counts}
