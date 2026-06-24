"""Modèles SQLModel — ré-exporte tout pour un import unique (`from app.models import X`).

L'import de ce package enregistre toutes les tables sur `SQLModel.metadata`,
ce qui doit avoir lieu avant `create_all`/`run_migrations`.
"""
from app.models.core import Team, Member, Ticket, Feature, Epic
from app.models.planning import SprintConfig, PIConfig, TeamGroup
from app.models.people import Absence, SupportRotation
from app.models.agile import Event, MoodVote, RetroItem, Risk, PokerVote
from app.models.atlas import (
    Skill, Appetence, MemberSkill, MemberAppetence, MemberMobility,
)
from app.models.calendar import TeamCalendar
from app.models.team_identity import TeamIdentity, WorkshopTemplate, TeamWorkshop, Attachment

__all__ = [
    "Team", "Member", "Ticket", "Feature", "Epic",
    "SprintConfig", "PIConfig", "TeamGroup",
    "Absence", "SupportRotation",
    "Event", "MoodVote", "RetroItem", "Risk", "PokerVote",
    "Skill", "Appetence", "MemberSkill", "MemberAppetence", "MemberMobility",
    "TeamCalendar",
    "TeamIdentity", "WorkshopTemplate", "TeamWorkshop", "Attachment",
]
