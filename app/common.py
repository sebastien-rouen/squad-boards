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


def _normalize_team(name: str) -> str:
    """Strip CSV prefixes like 'Team Fuego' → 'Fuego', 'Equipe Alpha' → 'Alpha'.
    Mirrors extractTeam() in utils.js so member.team aligns with JIRA board names."""
    if not name:
        return name
    return _re.sub(r'^(?:Sprint|Équipe|Equipe|Team|Board|Kanban)\s+', '', name, flags=_re.IGNORECASE).strip() or name
