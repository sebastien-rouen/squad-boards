"""Modèles personnes : Absence, SupportRotation."""
from sqlmodel import SQLModel, Field, JSON, Column

from app.common import _gen_id, _now, _TA


class Absence(SQLModel, table=True):
    """Absence / conge d'un membre."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    member_name: str = Field(index=True)
    team: str = ""
    start_date: str = ""
    end_date: str = ""
    type: str = "conge"          # conge, maladie, formation, autre
    days: float = 1.0            # nb jours (0.5 = demi-journee)
    note: str = ""
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class SupportRotation(SQLModel, table=True):
    """Rotation support par equipe et semaine."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    team: str = Field(index=True)
    week_label: str = ""
    week_start: str = ""
    week_end: str = ""
    members: list[str] = Field(default=[], sa_column=Column(JSON))
    # Raffinement jour (variante mini-strip) : { "Nom Membre": [0..4] } où l'index = position
    # du jour ouvré dans la fenêtre [week_start, week_end]. Absent ⇒ membre en semaine pleine.
    member_days: dict = Field(default={}, sa_column=Column(JSON))
    locked: bool = False          # verrou manuel (futur) — préservé lors d'un shuffle
    unlocked: bool = False        # déverrou exceptionnel d'une semaine passée — la rend modifiable
    members_per_week: int = 2
    week_mode: str = "monday"    # monday | tuesday | wednesday | thursday | friday
    updated_at: str = Field(default_factory=_now)
