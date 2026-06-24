"""Migrations SQLite (ALTER TABLE / CREATE INDEX idempotents).

Pas de classe de modèle ici : uniquement du SQL brut via SQLAlchemy, pour
rester importable sans cycle. Le seed du catalogue Atlas (dépendant des modèles)
vit dans app.models.seed.
"""
from sqlalchemy import inspect as sa_inspect, text


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
        ("piconfig", "pi_members",        "ALTER TABLE piconfig ADD COLUMN pi_members JSON DEFAULT '{}'"),
        ("piconfig", "pi_objectives",     "ALTER TABLE piconfig ADD COLUMN pi_objectives JSON DEFAULT '{}'"),
        ("piconfig", "pi_baselines",      "ALTER TABLE piconfig ADD COLUMN pi_baselines JSON DEFAULT '{}'"),
        ("workshoptemplate", "icon",       "ALTER TABLE workshoptemplate ADD COLUMN icon TEXT DEFAULT '📋'"),
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
