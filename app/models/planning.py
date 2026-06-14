"""Modèles planification : SprintConfig, PIConfig, TeamGroup."""
from typing import Optional

from sqlmodel import SQLModel, Field, JSON, Column

from app.common import _gen_id, _now, _TA


class SprintConfig(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default="sprint-1", primary_key=True)
    name: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    goal: str = ""
    jira_id: Optional[str] = None        # ID JIRA pour PUT vers /rest/agile/1.0/sprint/{id}
    jira_board_id: Optional[str] = None  # ID board d'origine pour construire le lien UI
    # Sprints actifs par équipe — {team, name, startDate, endDate, goal, jiraId, jiraBoardId}
    team_sprints: list[dict] = Field(default=[], sa_column=Column(JSON))
    updated_at: str = Field(default_factory=_now)


class PIConfig(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default="pi-1", primary_key=True)
    number: int = 0
    name: str = ""
    sprints_per_pi: int = 5
    sprint_duration: int = 14
    # Date ISO du 1er jour du PI courant (ex: 2026-04-03 si PI 29 commence le ven. 3 avril).
    # Source de vérité absolue pour le calendrier rotation support — évite la dérivation
    # fragile depuis sprintInfo.startDate.
    start_date: Optional[str] = None
    velocity_target: Optional[int] = None
    objectives: list[dict] = Field(default=[], sa_column=Column(JSON))
    sprint_velocities: list[dict] = Field(default=[], sa_column=Column(JSON))
    role_capacity: dict = Field(default={}, sa_column=Column(JSON))
    # Snapshot des membres par PI au moment de l'import CSV (gère le turnover PI à PI).
    # Forme : { "29": [{name, team, role, entity}, …], "30": […] }
    pi_members: dict = Field(default={}, sa_column=Column(JSON))
    # Snapshot des objectifs par PI (historisation — `objectives` ne contient que le PI courant).
    # Forme : { "29": [{text, team, status, bv, committed}, …], "30": […] }
    # Permet d'afficher les objectifs d'un PI passé/futur sur le dashboard via le sélecteur PI.
    pi_objectives: dict = Field(default={}, sa_column=Column(JSON))
    updated_at: str = Field(default_factory=_now)


class TeamGroup(SQLModel, table=True):
    """Ligne produit / groupe d'equipes."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    color: str = "#6366f1"
    teams: list[str] = Field(default=[], sa_column=Column(JSON))
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
