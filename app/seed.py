"""Seed du catalogue Atlas (compétences / appétences) si la base est vide.

Séparé de migrations.py car dépendant des modèles ORM.
"""
from sqlmodel import Session, select

from app.models import Skill, Appetence, WorkshopTemplate


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


def _ws_field(key, label, type_="textarea", help_="", options=None):
    f = {"key": key, "label": label, "type": type_, "help": help_}
    if options:
        f["options"] = options
    return f


# Catalogue par défaut des ateliers de démarrage/diagnostic d'équipe — modifiable
# librement depuis l'admin des ateliers une fois créé (clé `key` = identifiant stable).
DEFAULT_WORKSHOP_TEMPLATES = [
    {
        "key": "team-canvas-basique", "name": "Team Canvas (FR) — Basique",
        "icon": "🧩", "category": "canvas", "sort": 0,
        "description": "Démarrage rapide d'équipe : mission, activités, parties prenantes.",
        "fields": [
            _ws_field("mission", "Mission — pourquoi existons-nous ?"),
            _ws_field("objectifs", "Objectifs"),
            _ws_field("activites", "Activités principales"),
            _ws_field("parties_prenantes", "Avec qui travaillons-nous ?"),
            _ws_field("ressources", "Ressources disponibles"),
            _ws_field("limites", "Limites — ce qui n'est pas notre rôle"),
        ],
    },
    {
        "key": "team-canvas-avance", "name": "Team Canvas (FR) — Avancé",
        "icon": "🧩", "category": "canvas", "sort": 1,
        "description": "Version complète du Team Canvas pour un cadrage approfondi.",
        "fields": [
            _ws_field("mission", "Mission — pourquoi existons-nous ?"),
            _ws_field("valeurs", "Valeurs"),
            _ws_field("objectifs_court_terme", "Objectifs court terme"),
            _ws_field("objectifs_long_terme", "Objectifs long terme"),
            _ws_field("activites", "Activités principales"),
            _ws_field("parties_prenantes", "Parties prenantes / Avec qui travaillons-nous ?"),
            _ws_field("ressources", "Ressources disponibles"),
            _ws_field("competences", "Compétences clés de l'équipe"),
            _ws_field("regles_fonctionnement", "Règles de fonctionnement"),
            _ws_field("limites", "Limites — ce qui n'est pas notre rôle"),
            _ws_field("risques", "Risques identifiés"),
        ],
    },
    {
        "key": "place-dans-art", "name": "Notre place dans l'ART",
        "icon": "🚂", "category": "art", "sort": 2,
        "description": "Situer l'équipe dans le train (Agile Release Train) et son flux de valeur.",
        "fields": [
            _ws_field("nom_art", "Train / ART de rattachement", "text"),
            _ws_field("contribution_valeur", "Notre contribution au flux de valeur"),
            _ws_field("dependances_amont", "Équipes en amont (qui nous alimente)"),
            _ws_field("dependances_aval", "Équipes en aval (qui dépend de nous)"),
            _ws_field("objectif_pi_courant", "Objectif du PI en cours"),
        ],
    },
    {
        "key": "interfaces-dependances", "name": "Interfaces & dépendances",
        "icon": "🔗", "category": "interfaces", "sort": 3,
        "description": "Rendre visibles les interactions avec les autres équipes.",
        "fields": [
            _ws_field("equipes_partenaires", "Équipes partenaires régulières"),
            _ws_field("flux_entrants", "Ce que l'on reçoit (infos, livrables, décisions)"),
            _ws_field("flux_sortants", "Ce que l'on fournit aux autres"),
            _ws_field("points_de_friction", "Points de friction actuels"),
            _ws_field("contacts_referents", "Contacts référents par équipe"),
        ],
    },
    {
        "key": "rituels-fonctionnement", "name": "Rituels & fonctionnement",
        "icon": "🗓️", "category": "rituals", "sort": 4,
        "description": "Documenter le quotidien réel de l'équipe : rituels, outils, règles.",
        "fields": [
            _ws_field("ceremonies", "Cérémonies (nom, fréquence, horaire)"),
            _ws_field("outils_utilises", "Outils utilisés au quotidien"),
            _ws_field("regles_collaboration", "Règles de collaboration (charte d'équipe)"),
            _ws_field("horaires_cles", "Horaires clés / plages de disponibilité commune"),
        ],
    },
    {
        "key": "dor-dod", "name": "DoR / DoD",
        "icon": "✅", "category": "dor-dod", "sort": 5,
        "description": "Clarifier les standards : Definition of Ready et Definition of Done.",
        "fields": [
            _ws_field("dor", "Definition of Ready — un ticket est prêt quand…"),
            _ws_field("dod", "Definition of Done — un ticket est terminé quand…"),
            _ws_field("criteres_qualite", "Critères de qualité non négociables"),
        ],
    },
    {
        "key": "competences-responsabilites", "name": "Compétences & responsabilités",
        "icon": "🎯", "category": "skills", "sort": 6,
        "description": "Identifier les forces de l'équipe et ses fragilités (bus factor).",
        "fields": [
            _ws_field("competences_cles", "Compétences clés couvertes par l'équipe"),
            _ws_field("fragilites", "Fragilités / points de dépendance à une seule personne"),
            _ws_field("plan_montee_competences", "Plan de montée en compétences"),
            _ws_field("backup_responsabilites", "Qui assure le backup sur quoi ?"),
        ],
    },
    {
        "key": "sante-equipe", "name": "Santé d'équipe",
        "icon": "💚", "category": "health", "sort": 7,
        "description": "Suivre l'amélioration continue : indicateurs et actions en cours.",
        "fields": [
            _ws_field("indicateurs_suivis", "Indicateurs suivis (vélocité, satisfaction, charge…)"),
            _ws_field("dernieres_actions", "Dernières actions d'amélioration menées"),
            _ws_field("freins_actuels", "Freins actuels"),
            _ws_field("prochaine_revue", "Date de la prochaine revue de santé"),
        ],
    },
    {
        "key": "faq-equipe", "name": "FAQ équipe",
        "icon": "💬", "category": "faq", "sort": 8,
        "description": "Aider les autres équipes à bien collaborer avec nous.",
        "fields": [
            _ws_field("questions_frequentes", "Questions fréquentes (Q / R)", "textarea",
                      "Une question par ligne, au format \"Q: … / R: …\""),
            _ws_field("bonnes_pratiques", "Bonnes pratiques pour collaborer avec nous"),
            _ws_field("contacts_utiles", "Contacts utiles selon le sujet"),
        ],
    },
    {
        "key": "modele-tuckman", "name": "Modèle de Tuckman",
        "icon": "🌀", "category": "tuckman", "sort": 9,
        "description": "Diagnostic du stade de développement de l'équipe.",
        "fields": [
            _ws_field("stade", "Stade actuel de l'équipe", "select", "", [
                "Formation (Forming)", "Tension (Storming)",
                "Normalisation (Norming)", "Performance (Performing)",
                "Dissolution (Adjourning)",
            ]),
            _ws_field("signes_observes", "Signes observés"),
            _ws_field("actions_a_mener", "Actions à mener pour progresser"),
        ],
    },
    {
        "key": "maturite-agile", "name": "Maturité Agile",
        "icon": "📈", "category": "maturity", "sort": 10,
        "description": "Auto-évaluation rapide de la maturité agile de l'équipe.",
        "fields": [
            _ws_field("cadrage_produit", "Cadrage produit", "scale"),
            _ws_field("ceremonies_agiles", "Cérémonies agiles", "scale"),
            _ws_field("autonomie_equipe", "Autonomie de l'équipe", "scale"),
            _ws_field("qualite_livraison", "Qualité de livraison", "scale"),
            _ws_field("amelioration_continue", "Amélioration continue", "scale"),
            _ws_field("notes", "Notes"),
        ],
    },
]


def seed_workshop_templates(engine):
    """Insère le catalogue par défaut d'ateliers (Team Canvas, ART, Interfaces, Rituels,
    DoR/DoD, Compétences, Santé d'équipe, FAQ, Tuckman, Maturité Agile) — par clé, donc
    une réexécution après ajout de nouveaux ateliers par défaut ne duplique pas les
    existants. Librement modifiable ensuite depuis l'admin des ateliers."""
    with Session(engine) as s:
        existing_keys = {w.key for w in s.exec(select(WorkshopTemplate)).all()}
        for tpl in DEFAULT_WORKSHOP_TEMPLATES:
            if tpl["key"] not in existing_keys:
                s.add(WorkshopTemplate(**tpl))
        s.commit()
