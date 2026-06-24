"""Modèles fiche d'identité d'équipe + ateliers (Team Canvas, Tuckman, maturité Agile)."""
from sqlmodel import SQLModel, Field, JSON, Column
from sqlalchemy import UniqueConstraint as _SAUnique

from app.common import _gen_id, _now, _TA


class TeamIdentity(SQLModel, table=True):
    """Fiche d'identité d'une équipe — 1 ligne par équipe (clé logique = team)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    team: str = Field(index=True, unique=True)
    vision: str = ""
    perimeter: str = ""
    qui_sommes_nous: str = ""
    que_faisons_nous: str = ""
    avec_qui: str = ""
    comment_fonctionnons: str = ""
    besoins_reussite: str = ""
    updated_at: str = Field(default_factory=_now)


class WorkshopTemplate(SQLModel, table=True):
    """Modèle d'atelier (catalogue admin) — Team Canvas, Tuckman, maturité Agile, etc.
    `fields` = liste de questions [{key, label, type, help, options}] (type: text|textarea|select|scale)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    key: str = Field(index=True, unique=True)
    name: str = ""
    description: str = ""
    icon: str = "📋"
    category: str = "custom"   # canvas | art | interfaces | rituals | dor-dod | skills | health | faq | tuckman | maturity | custom
    fields: list[dict] = Field(default=[], sa_column=Column(JSON))
    sort: int = 0
    active: bool = True
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class TeamWorkshop(SQLModel, table=True):
    """Réponses d'une équipe à un atelier — 1 ligne par (team, template_key)."""
    __table_args__ = (
        _SAUnique("team", "template_key", name="ux_teamworkshop_team_template"),
        _TA,
    )
    id: str = Field(default_factory=_gen_id, primary_key=True)
    team: str = Field(index=True)
    template_key: str = Field(index=True)
    data: dict = Field(default={}, sa_column=Column(JSON))
    status: str = "draft"   # draft | completed
    updated_at: str = Field(default_factory=_now)


class Attachment(SQLModel, table=True):
    """Pièce jointe d'un atelier (image, PDF, XLS, Doc) — fichier sur disque, métadonnées en DB."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    team_workshop_id: str = Field(index=True)
    filename: str = ""          # nom d'origine (affiché)
    stored_name: str = ""       # nom sur disque (data/uploads/), unique
    content_type: str = ""
    size: int = 0
    created_at: str = Field(default_factory=_now)
