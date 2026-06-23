"""Modèles agile : Event, MoodVote, RetroItem, Risk."""
from typing import Optional

from sqlmodel import SQLModel, Field, JSON, Column

from app.common import _gen_id, _now, _TA


class Event(SQLModel, table=True):
    """Fait marquant (incident, gel, jalon, periode)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    type: str = "other"
    title: str = ""
    description: str = ""
    start_date: str = ""
    end_date: str = ""
    teams: list[str] = Field(default=[], sa_column=Column(JSON))
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class MoodVote(SQLModel, table=True):
    """Vote mood/ROTI ou Fist of Five par equipe."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    type: str = "mood"           # mood | fist
    team: str = ""
    value: int = 3               # 1-5
    pi_sprint: Optional[str] = None
    author: Optional[str] = None
    note: str = ""
    created_at: str = Field(default_factory=_now)


class PokerVote(SQLModel, table=True):
    """Vote de Planning Poker (ré-estimation collaborative d'un ticket).

    Un vote par (ticket_id, voter) — upsert côté routeur. `value` est une chaîne
    pour accepter la carte '?' en plus des nombres Fibonacci.
    """
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    ticket_id: str = ""
    voter: str = ""
    value: str = ""              # "1".."21" ou "?"
    revealed: bool = False
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class RetroItem(SQLModel, table=True):
    """Action d'amelioration continue (retro, post-mortem, CoP, adapt)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str = ""
    source: str = "retro"        # retro | postmortem | cop | adapt
    status: str = "todo"         # todo | inprog | done
    team: str = ""
    owner: Optional[str] = None
    pi_sprint: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Risk(SQLModel, table=True):
    """Risque ROAM (Resolved/Owned/Accepted/Mitigated)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    description: str = ""
    quadrant: str = "open"       # open | resolved | owned | accepted | mitigated
    team: str = ""
    owner: Optional[str] = None
    impact: str = "medium"       # low | medium | high
    probability: str = "medium"  # low | medium | high
    mitigation: str = ""
    pi_sprint: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
