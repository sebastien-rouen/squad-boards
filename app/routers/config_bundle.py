"""Routeur Config — bundle de configuration CURÉE, sauvegarde `.local` (3.198.0).

≠ `/api/export` (snapshot complet) : le bundle exclut ce que la synchro JIRA rapatrie — tickets,
features, epics et sprints — pour rester léger et réimportable après un reset de base ou un changement
de poste. Il ajoute les règles d'agenda (`calendar_rule`), absentes de l'export complet.

`CONFIG_DOMAINS` est la SOURCE UNIQUE des domaines, pour l'export ET l'import : une nouvelle table de
configuration s'ajoute ici, et nulle part ailleurs (sinon elle manquerait à la restauration).
L'import réutilise `import_body` (data.py) en mode `merge` par défaut : rien n'est effacé.

Mode GABARIT (`?mode=template`, 3.279.0) : la seule configuration réutilisable (catalogue Atlas, ateliers,
règles d'agenda, réglages génériques, cadence) pour démarrer un AUTRE projet — sans aucune donnée.

⚠️ Le bundle complet contient des données personnelles (absences RH) et des URL d'agenda parfois tokenisées :
nommé `*.local.json` (ignoré par git), jamais versionné ni partagé.
"""
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlmodel import Session, select

from app.common import _gen_id, _now
from app.db import get_session
from app.models import CalendarRule, MoodVote, PIConfig, ProjectSetting, SkillLevelHistory
from app.routers.calendar_rules import _rule_dict
from app.routers.data import _EXPORT_SPEC, import_body
from app.serializers import _pi_dict, _mood_dict, _skill_history_dict

router = APIRouter(tags=["config"])

# Clés de /api/export reprises par le bundle (et acceptées à l'import), dans l'ordre d'import.
CONFIG_DOMAINS = [
    "teams", "groups", "members", "pi",
    "absences", "support", "events", "calendars",
    "skills", "appetences", "memberSkills", "memberAppetences", "mobility", "teamSkillRequirements", "projectSettings",
    "teamIdentities", "workshopTemplates", "teamWorkshops",
    "moodVotes", "fistVotes", "confidenceVotes", "retroItems", "risks",
]
BUNDLE_VERSION = "1"

# ── Gabarit de projet (3.279.0) : la configuration RÉUTILISABLE d'un projet, SANS aucune donnée ──
# Liste BLANCHE (jamais une liste noire : une table ou un réglage ajouté plus tard ne doit pas fuir
# par défaut). Ni équipes, ni personnes, ni absences, ni votes, ni tickets, ni secrets.
TEMPLATE_DOMAINS = ["skills", "appetences", "workshopTemplates"]
# Réglages de projet génériques. Exclus : ce qui nomme des équipes ou des personnes (alias, périmètres
# de cadrage, charges, objectifs), l'état de la synchro (boards, colonnes, sprints vides, non mappés)
# et l'identité de l'instance (nom, couleur) — le nouveau projet a la sienne.
TEMPLATE_SETTINGS = {
    "sb-sync-sprintField", "sb-sync-teamField", "sb-sync-piSprintField", "sb-sync-contributorsField",
    "sb-sync-quickDays", "sb-sync-closedKeep", "sb-sync-closedTicketSprints", "sb-sync-archiveClosed",
    "sb-sync-maxBoards", "sb-sync-maxFeatures",
    "sb-meteo-thresholds", "sb-meteo-scope", "sb-sla-target-days", "sb-backlog-stale-months",
    "sb-dash-stale-days", "sb-reminders", "sb-holidays",
    "sb-atlas-expert-min", "sb-atlas-away-days", "sb-atlas-levels", "sb-poker-scale",
    "sb-status-map", "sb-type-map", "sb-modules",
}
# Cadence seule de la config PI (pas de numéro, d'objectifs, de roster ni d'alias).
_PI_CADENCE = {"sprintsPerPI": "sprints_per_pi", "sprintDuration": "sprint_duration", "roleCapacity": "role_capacity"}


def _export_template(session: Session) -> dict:
    spec = {k: (model, ser) for k, model, ser in _EXPORT_SPEC}
    db = {}
    for k in TEMPLATE_DOMAINS:
        model, ser = spec[k]
        db[k] = [ser(x) for x in session.exec(select(model)).all()]
    db["projectSettings"] = [
        {"key": r.key, "value": r.value}
        for r in session.exec(select(ProjectSetting)).all() if r.key in TEMPLATE_SETTINGS and r.value
    ]
    pi = _pi_dict(session.get(PIConfig, "pi-1")) or {}
    db["piCadence"] = {k: pi[k] for k in _PI_CADENCE if pi.get(k) not in (None, "", {})}
    db["calendarRules"] = [_rule_dict(r) for r in session.exec(select(CalendarRule)).all()]
    return {
        "_meta": {"app": "squad-board", "kind": "template", "version": BUNDLE_VERSION, "exportedAt": _now(), "domains": list(db)},
        "db": db,
    }


@router.get("/api/config/export")
def export_config(mode: str = "", session: Session = Depends(get_session)):
    if mode == "template":
        return _export_template(session)
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
    template = meta.get("kind") == "template"
    # Un gabarit ne remplace jamais : il complète le projet (et ne lit QUE ses domaines, même édité à la main).
    mode = "replace" if body.get("mode") == "replace" and not template else "merge"
    domains = TEMPLATE_DOMAINS + ["projectSettings"] if template else CONFIG_DOMAINS
    payload = {k: db[k] for k in domains if isinstance(db.get(k), (list, dict))}
    if template and isinstance(payload.get("projectSettings"), list):
        payload["projectSettings"] = [d for d in payload["projectSettings"] if isinstance(d, dict) and d.get("key") in TEMPLATE_SETTINGS]
    payload["mode"] = mode
    res = import_body(payload, session)
    counts = dict(res.get("counts") or {})
    if "pi" in payload:
        counts["pi"] = 1
    cad = db.get("piCadence") if template else None
    if isinstance(cad, dict) and cad:
        p = session.get(PIConfig, "pi-1") or PIConfig(id="pi-1")
        for k, attr in _PI_CADENCE.items():
            v = cad.get(k)
            if k == "roleCapacity" and isinstance(v, dict):
                setattr(p, attr, {str(r): int(x) for r, x in v.items() if isinstance(x, (int, float)) and 0 <= x <= 100})
            elif k != "roleCapacity" and isinstance(v, int) and 1 <= v <= (12 if k == "sprintsPerPI" else 28):
                setattr(p, attr, v)
        p.updated_at = _now()
        session.add(p)
        session.commit()
        counts["piCadence"] = 1

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
