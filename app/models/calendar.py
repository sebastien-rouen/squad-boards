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
