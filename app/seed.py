"""Seed du catalogue Atlas (compétences / appétences) si la base est vide.

Séparé de migrations.py car dépendant des modèles ORM.
"""
from sqlmodel import Session, select

from app.models import Skill, Appetence


def seed_atlas_catalog(engine):
    """Insère un catalogue par défaut de compétences et appétences si vide."""
    default_skills = [
        ("Frontend", "#3b82f6", ["React / JS", "CSS / Design System", "Accessibilité"]),
        ("Backend",  "#8b5cf6", ["API REST", "SQL / Données", "Sécurité"]),
        ("DevOps",   "#06b6d4", ["CI/CD", "Cloud / Infra", "Observabilité"]),
        ("Agile",    "#22c55e", ["Facilitation", "Craft / Tests", "Product"]),
    ]
    default_appetences = [
        ("Technique", "#f59e0b", ["Cloud", "Craft / Qualité", "Data / IA"]),
        ("Posture",   "#ec4899", ["Management", "Coaching / Mentorat", "Innovation"]),
    ]
    with Session(engine) as s:
        if not s.exec(select(Skill)).first():
            sort = 0
            for cat, color, names in default_skills:
                for n in names:
                    s.add(Skill(name=n, category=cat, color=color, sort=sort)); sort += 1
        if not s.exec(select(Appetence)).first():
            sort = 0
            for cat, color, names in default_appetences:
                for n in names:
                    s.add(Appetence(name=n, category=cat, color=color, sort=sort)); sort += 1
        s.commit()
