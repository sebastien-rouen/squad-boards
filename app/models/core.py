"""Modèles cœur : Team, Member, Ticket, Feature, Epic."""
from typing import Optional

from sqlmodel import SQLModel, Field, JSON, Column
from sqlalchemy import Index as _SAIndex

from app.common import _gen_id, _now, _TA


class Team(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    color: str = "#3b82f6"
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Member(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    team: str = ""
    role: str = ""
    entity: str = ""   # société / organisation d'appartenance
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Ticket(SQLModel, table=True):
    __table_args__ = (
        _SAIndex('ix_ticket_team_status', 'team', 'status'),
        _SAIndex('ix_ticket_team_pi', 'team', 'pi_sprint'),
        _TA,
    )
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    type: str = "story"
    status: str = Field(default="todo", index=True)
    # Statut JIRA brut (label de colonne d'origine, ex: "En cours de développement") — préservé pour l'affichage UI
    jira_status: str = ""
    team: str = Field(default="", index=True)
    leader: Optional[str] = None
    reporter: Optional[str] = None
    contributors: list[str] = Field(default=[], sa_column=Column(JSON))
    points: int = 0
    priority: str = "medium"
    sprint: Optional[str] = None
    sprint_name: Optional[str] = None
    pi_sprint: Optional[str] = None
    flagged: bool = False
    labels: list[str] = Field(default=[], sa_column=Column(JSON))
    epic_id: Optional[str] = Field(default=None, index=True)
    description: str = ""
    links: list[dict] = Field(default=[], sa_column=Column(JSON))
    comments: list[dict] = Field(default=[], sa_column=Column(JSON))
    recent_changes: list[dict] = Field(default=[], sa_column=Column(JSON))
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
    started_date: Optional[str] = None
    resolved_date: Optional[str] = None
    cycle_time_days: int = 0
    lead_time_days: int = 0
    # Durée cumulée (jours) passée par statut JIRA brut (ex: "revue" → 2.5) — calculée
    # au sync depuis le changelog complet, clé = jiraStatus normalisé en minuscules.
    stage_durations: dict = Field(default={}, sa_column=Column(JSON))


class Feature(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    status: str = Field(default="todo", index=True)
    team: str = ""
    leader: Optional[str] = None
    priority: str = "high"
    pi_sprint: Optional[str] = None
    rank: int = 0
    points: int = 0
    dependencies: list[str] = Field(default=[], sa_column=Column(JSON))
    labels: list[str] = Field(default=[], sa_column=Column(JSON))
    description: str = ""
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Epic(SQLModel, table=True):
    __table_args__ = (
        _SAIndex('ix_epic_feature_team', 'feature_id', 'team'),
        _TA,
    )
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    status: str = Field(default="todo", index=True)
    team: str = ""
    feature_id: Optional[str] = None
    pi_sprint: Optional[str] = None
    labels: list[str] = Field(default=[], sa_column=Column(JSON))
    description: str = ""
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
