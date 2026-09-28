"""Routeur Règles d'agenda — natures positionnées à la main (carte « Agenda de l'équipe »).

Une règle = un titre normalisé → une nature, partagée par toutes les équipes. Le titre est
normalisé CÔTÉ FRONT (`calNorm`, utils/cal-classify.js) : c'est la même fonction qui l'applique
ensuite aux évènements, deux normalisations divergeraient et la règle ne s'appliquerait plus.
"""
from fastapi import APIRouter, Request, HTTPException, Depends
from sqlmodel import Session, select

from app.common import _now
from app.db import get_session
from app.models import CalendarRule

router = APIRouter(prefix="/api/calendar-rules", tags=["calendar-rules"])

# Miroir de CAL_NATURES (utils/cal-classify.js) — une nature inconnue serait ignorée à l'affichage
NATURES = {
    "daily", "planning", "affinage", "demo", "retro", "train", "community", "sync",
    "release", "support", "off", "busy", "focus", "other",
}


def _rule_dict(r: CalendarRule) -> dict:
    return {"id": r.id, "titleNorm": r.title_norm, "nature": r.nature,
            "titleExample": r.title_example, "updatedAt": r.updated_at}


@router.get("")
def list_rules(session: Session = Depends(get_session)):
    return [_rule_dict(r) for r in session.exec(select(CalendarRule)).all()]


@router.put("")
async def upsert_rule(request: Request, session: Session = Depends(get_session)):
    """Crée ou remplace la règle d'un titre. Body : { titleNorm, nature, titleExample? }."""
    body = await request.json()
    norm = (body.get("titleNorm") or "").strip()
    nature = body.get("nature")
    if not norm or nature not in NATURES:
        raise HTTPException(400, "titleNorm et nature valide requis")
    r = session.exec(select(CalendarRule).where(CalendarRule.title_norm == norm)).first()
    if r is None:
        r = CalendarRule(title_norm=norm)
    r.nature = nature
    r.title_example = (body.get("titleExample") or r.title_example or "")[:200]
    r.updated_at = _now()
    session.add(r)
    session.commit()
    session.refresh(r)
    return _rule_dict(r)


@router.delete("/{rule_id}")
def delete_rule(rule_id: str, session: Session = Depends(get_session)):
    """« Revenir à la détection » : la règle disparaît, le détecteur reprend la main."""
    r = session.get(CalendarRule, rule_id)
    if not r:
        raise HTTPException(404, "Règle non trouvée")
    session.delete(r)
    session.commit()
    return {"ok": True}
