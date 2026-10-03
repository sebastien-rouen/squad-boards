"""Modèles Atlas : compétences, appétences, mobilité (coaching/RH)."""
from sqlmodel import SQLModel, Field

from app.common import _gen_id, _now, _TA


class Skill(SQLModel, table=True):
    """Compétence du catalogue (ex: React, Python, Cloud, Agile)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    category: str = ""           # Frontend | Backend | DevOps | Agile | Data | Soft...
    color: str = "#6366f1"
    sort: int = 0
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Appetence(SQLModel, table=True):
    """Domaine d'appétence / d'intérêt (ex: Cloud, Management, Craft)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    category: str = ""
    color: str = "#f59e0b"
    sort: int = 0
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class MemberSkill(SQLModel, table=True):
    """Niveau d'une compétence — pour un membre OU une équipe.
    Clé logique = scope|scope_key|skill_id. Niveau 1-4 (référentiel métier)."""
    __tablename__ = "member_skill"
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    scope: str = "member"        # "member" | "team"
    scope_key: str = Field(default="", index=True)  # nom du membre OU nom de l'équipe
    team: str = ""               # équipe de rattachement (pour filtrage)
    skill_id: str = Field(default="", index=True)
    level: int = 0               # 0=aucun, 1=exécutant, 2=opérationnel, 3=cloud ready, 4=référent
    updated_at: str = Field(default_factory=_now)


class SkillLevelHistory(SQLModel, table=True):
    """Historique des niveaux (3.198.0) — une ligne par CHANGEMENT de niveau d'une compétence, pour un
    membre ou une équipe (`level` = 0 : niveau retiré). Écrit par PUT /api/member-skills, jamais
    réécrit : c'est ce qui permet de tracer l'évolution d'une compétence dans le temps. Pas de ligne
    « de départ » pour les niveaux saisis avant la création de la table (date inconnue)."""
    __tablename__ = "skill_level_history"
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    scope: str = "member"
    scope_key: str = Field(default="", index=True)
    team: str = ""
    skill_id: str = Field(default="", index=True)
    prev_level: int = 0
    level: int = 0
    changed_at: str = Field(default_factory=_now)


class MemberAppetence(SQLModel, table=True):
    """Appétence — pour un membre OU une équipe. Valeur faible/neutre/forte."""
    __tablename__ = "member_appetence"
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    scope: str = "member"        # "member" | "team"
    scope_key: str = Field(default="", index=True)
    team: str = ""
    appetence_id: str = Field(default="", index=True)
    value: str = "neutre"        # faible | neutre | forte
    updated_at: str = Field(default_factory=_now)


class MemberMobility(SQLModel, table=True):
    """Ligne de suivi de mobilité / trajectoire d'un membre (tableau coaching)."""
    __tablename__ = "member_mobility"
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    member_name: str = Field(default="", index=True)
    team: str = ""                       # équipe actuelle
    target_team: str = ""                # équipe cible
    target_role: str = ""                # rôle cible
    current_level: int = 0               # niveau actuel 1-4
    potential: str = "moyen"             # faible | moyen | fort
    appetence: str = "neutre"            # faible | neutre | forte
    risk: str = "aucun"                  # aucun | moyen | critique
    plan: str = ""                       # plan d'accompagnement
    transition_duration: str = ""        # durée de transition (ex: "3 mois")
    updated_at: str = Field(default_factory=_now)
