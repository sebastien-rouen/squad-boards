"""Migrations SQLite (ALTER TABLE / CREATE INDEX idempotents).

Pas de classe de modèle ici : uniquement du SQL brut via SQLAlchemy, pour
rester importable sans cycle. Le seed du catalogue Atlas (dépendant des modèles)
vit dans app.models.seed.
"""
from datetime import date, timedelta

from sqlalchemy import inspect as sa_inspect, text


# Jour de bascule de chaque mode de semaine — même table que SUPPORT_WEEK_MODES côté front
# (static/js/utils/support.js) : 0 = dimanche … 6 = samedi, comme `Date.getDay()`.
_WEEK_MODE_DOW = {"monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5}


def _shift_iso(iso, days):
    return (date.fromisoformat(iso[:10]) + timedelta(days=days)).isoformat()


def _resnap_support_weeks(conn):
    """Recale `week_start` de chaque rotation support sur le jour de bascule de SON `week_mode`.

    Le front apparie les rotations sur `weekStart` STRICT et calcule ces clés en reculant la
    date de début du PI jusqu'au jour du mode (`snapToWeekMode`, 6 jours max). Jusqu'en 3.162.0
    un PI épinglé (autre que le courant) n'était pas recalé : ses rotations ont été écrites sur
    des lundis/dimanches JIRA que ni le mode « Jeu → Mer » ni le même PI devenu courant ne
    réaffichent — une rotation entière rendue invisible au changement de PI.
    Idempotent : une ligne déjà sur le bon jour n'est pas touchée ; une ligne dont la clé cible
    existe déjà pour la même équipe est laissée telle quelle (jamais deux rotations sur une
    même clé). Les `member_days` (indices 0-4 dans la fenêtre) suivent la nouvelle fenêtre.
    """
    rows = conn.execute(text(
        "SELECT id, team, week_start, week_mode FROM supportrotation "
        "WHERE week_start IS NOT NULL AND week_start != ''"
    )).fetchall()
    taken = {(r[1], r[2]) for r in rows}
    for rid, team, start, mode in rows:
        target = _WEEK_MODE_DOW.get(mode or "")
        try:
            dow = date.fromisoformat(start[:10]).isoweekday() % 7
        except ValueError:
            continue
        if target is None or dow == target:
            continue
        new_start = _shift_iso(start, -((dow - target + 7) % 7))
        if (team, new_start) in taken:
            continue
        conn.execute(
            text("UPDATE supportrotation SET week_start = :s, week_end = :e WHERE id = :i"),
            {"s": new_start, "e": _shift_iso(new_start, 6), "i": rid},
        )
        taken.discard((team, start))
        taken.add((team, new_start))
    conn.commit()


def run_migrations(engine):
    """Add new columns to existing tables (SQLite ALTER TABLE)."""
    migrations = [
        ("feature", "rank",             "ALTER TABLE feature ADD COLUMN rank INTEGER DEFAULT 0"),
        ("feature", "points",           "ALTER TABLE feature ADD COLUMN points INTEGER DEFAULT 0"),
        ("feature", "dependencies",     "ALTER TABLE feature ADD COLUMN dependencies JSON DEFAULT '[]'"),
        ("ticket",  "started_date",     "ALTER TABLE ticket ADD COLUMN started_date TEXT"),
        ("ticket",  "resolved_date",    "ALTER TABLE ticket ADD COLUMN resolved_date TEXT"),
        ("ticket",  "cycle_time_days",  "ALTER TABLE ticket ADD COLUMN cycle_time_days INTEGER DEFAULT 0"),
        ("ticket",  "lead_time_days",   "ALTER TABLE ticket ADD COLUMN lead_time_days INTEGER DEFAULT 0"),
        ("ticket",  "jira_status",      "ALTER TABLE ticket ADD COLUMN jira_status TEXT DEFAULT ''"),
        ("ticket",  "stage_durations",  "ALTER TABLE ticket ADD COLUMN stage_durations JSON DEFAULT '{}'"),
        ("piconfig", "sprints_per_pi",  "ALTER TABLE piconfig ADD COLUMN sprints_per_pi INTEGER DEFAULT 5"),
        ("piconfig", "sprint_duration", "ALTER TABLE piconfig ADD COLUMN sprint_duration INTEGER DEFAULT 14"),
        ("piconfig", "velocity_target",    "ALTER TABLE piconfig ADD COLUMN velocity_target INTEGER"),
        ("piconfig", "sprint_velocities", "ALTER TABLE piconfig ADD COLUMN sprint_velocities JSON DEFAULT '[]'"),
        ("piconfig", "start_date",        "ALTER TABLE piconfig ADD COLUMN start_date TEXT"),
        ("member",   "entity",          "ALTER TABLE member ADD COLUMN entity TEXT DEFAULT ''"),
        ("sprintconfig", "jira_id",       "ALTER TABLE sprintconfig ADD COLUMN jira_id TEXT"),
        ("sprintconfig", "jira_board_id", "ALTER TABLE sprintconfig ADD COLUMN jira_board_id TEXT"),
        ("sprintconfig", "team_sprints",  "ALTER TABLE sprintconfig ADD COLUMN team_sprints JSON DEFAULT '[]'"),
        ("supportrotation", "locked",     "ALTER TABLE supportrotation ADD COLUMN locked BOOLEAN DEFAULT 0"),
        ("supportrotation", "unlocked",   "ALTER TABLE supportrotation ADD COLUMN unlocked BOOLEAN DEFAULT 0"),
        ("supportrotation", "member_days", "ALTER TABLE supportrotation ADD COLUMN member_days JSON DEFAULT '{}'"),
        ("piconfig", "pi_members",        "ALTER TABLE piconfig ADD COLUMN pi_members JSON DEFAULT '{}'"),
        ("piconfig", "pi_objectives",     "ALTER TABLE piconfig ADD COLUMN pi_objectives JSON DEFAULT '{}'"),
        ("piconfig", "pi_baselines",      "ALTER TABLE piconfig ADD COLUMN pi_baselines JSON DEFAULT '{}'"),
        # Mode de semaine de support par équipe ({ "Gabbiano": "thursday" }) — était en localStorage
        # (`rot-mode-<équipe>`), donc propre à chaque navigateur. Sur piconfig et pas sur team :
        # une synchro complète (import `replace`) supprime et recrée toutes les équipes.
        ("piconfig", "support_week_modes", "ALTER TABLE piconfig ADD COLUMN support_week_modes JSON DEFAULT '{}'"),
        ("workshoptemplate", "icon",       "ALTER TABLE workshoptemplate ADD COLUMN icon TEXT DEFAULT '📋'"),
        # Auteur d'un fait marquant (frise de la page Équipe, 3.170.0) — nom saisi, pas de compte
        ("event", "author",                "ALTER TABLE event ADD COLUMN author TEXT DEFAULT ''"),
        # Statuts JIRA comptés comme Terminé sauf équipes exemptées (Paramètres → JIRA, 3.193.0)
        ("piconfig", "done_override",      "ALTER TABLE piconfig ADD COLUMN done_override JSON DEFAULT '{}'"),
    ]
    with engine.connect() as conn:
        insp = sa_inspect(engine)
        for tbl, col, sql in migrations:
            try:
                existing = [c["name"] for c in insp.get_columns(tbl)]
                if col not in existing:
                    conn.execute(text(sql))
                    conn.commit()
            except Exception:
                pass
        # Composite indexes for existing databases (CREATE INDEX IF NOT EXISTS is idempotent)
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS ix_ticket_team_status ON ticket (team, status)",
            "CREATE INDEX IF NOT EXISTS ix_ticket_team_pi ON ticket (team, pi_sprint)",
            "CREATE INDEX IF NOT EXISTS ix_epic_feature_team ON epic (feature_id, team)",
            # Empêche deux réponses d'atelier pour la même (équipe, atelier) — garde-fou contre
            # une double sauvegarde concurrente (double-clic, deux onglets) qui dupliquerait la ligne.
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_teamworkshop_team_template ON teamworkshop (team, template_key)",
        ]:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
            except Exception:
                pass
        # Recale les rotations support sur le jour de bascule de leur mode (3.162.1) —
        # données, pas schéma : idempotent, tout ou rien.
        try:
            _resnap_support_weeks(conn)
        except Exception:
            conn.rollback()
