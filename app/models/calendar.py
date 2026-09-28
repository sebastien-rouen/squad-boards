"""Modèle calendrier : TeamCalendar (lien ICS public par équipe)."""
from typing import Optional

from sqlmodel import SQLModel, Field

from app.common import _gen_id, _now, _TA


class TeamCalendar(SQLModel, table=True):
    """Lien vers un calendrier public ICS (Google Calendar) par equipe."""
    __tablename__ = "team_calendar"
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    team: str = Field(default="")
    name: str = Field(default="Calendrier")
    ical_url: str = Field(default="")
    last_fetched: Optional[str] = None
    events_json: Optional[str] = None   # JSON: list[dict] events mis en cache
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)

class CalendarRule(SQLModel, table=True):
    """Nature d'évènement d'agenda POSITIONNÉE À LA MAIN (« Classer comme… » de la carte Agenda).

    Une règle par TITRE normalisé (minuscules, sans accents ni emoji — `calNorm` côté front), partagée
    par toutes les équipes : un titre a la même nature partout. Elle prime sur le détecteur
    (`utils/cal-classify.js`) et survit aux imports ICS, qui ne réécrivent que `events_json`.
    """
    __tablename__ = "calendar_rule"
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title_norm: str = Field(index=True, unique=True)
    nature: str = Field(default="other")
    title_example: str = Field(default="")     # un titre d'origine, pour l'affichage
    updated_at: str = Field(default_factory=_now)
