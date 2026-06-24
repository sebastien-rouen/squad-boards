"""Helpers partagés — sans dépendance aux modèles ni à la base.

Isolés ici pour être importables par les modèles (default_factory) sans cycle.
"""
import re as _re
import uuid
from datetime import datetime, timezone

# `extend_existing` sur tous les modèles → hot reload safe (cf. CLAUDE.md).
_TA = {"extend_existing": True}


def _gen_id() -> str:
    return uuid.uuid4().hex[:12].upper()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(s: str) -> str:
    """Clé technique stable (utilisée comme id DOM / sélecteur CSS côté front, ex: ateliers
    d'équipe) — pas d'espaces ni de caractères spéciaux, même si la valeur d'origine est un
    libellé humain ou vient d'un import (JSON/CSV potentiellement mal formé)."""
    s = _re.sub(r"[^a-z0-9]+", "-", (s or "").strip().lower())
    return s.strip("-")


def clean_workshop_fields(raw_fields: list) -> list:
    """Slugifie la clé de chaque question d'un WorkshopTemplate.fields — appliqué à la
    création/édition (workshop_templates.py) ET à l'import JSON/CSV (data.py) pour que
    les deux chemins d'écriture restent cohérents."""
    out = []
    for f in (raw_fields or []):
        key = slugify(f.get("key", ""))
        if not key:
            continue
        out.append({**f, "key": key})
    return out


def _normalize_team(name: str) -> str:
    """Strip CSV prefixes like 'Team Fuego' → 'Fuego', 'Equipe Alpha' → 'Alpha'.
    Mirrors extractTeam() in utils.js so member.team aligns with JIRA board names."""
    if not name:
        return name
    return _re.sub(r'^(?:Sprint|Équipe|Equipe|Team|Board|Kanban)\s+', '', name, flags=_re.IGNORECASE).strip() or name
