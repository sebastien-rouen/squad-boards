"""Réglages de PROJET partagés (3.266.0) — clé → valeur texte, comme le localStorage qu'ils remplacent.

Avant : propres à chaque navigateur (`sb-sync-*`, seuils météo, SLA…), donc un comportement par poste.
La liste des clés « projet » vit côté client (static/js/project-settings.js) ; le serveur ne valide
que la forme de la clé et la taille de la valeur.
"""
from sqlmodel import SQLModel, Field

from app.common import _now, _TA


class ProjectSetting(SQLModel, table=True):
    __tablename__ = "project_setting"
    __table_args__ = _TA
    key: str = Field(primary_key=True)
    value: str = ""
    updated_at: str = Field(default_factory=_now)
