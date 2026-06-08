"""Squad Board - Self-contained project board with SQLite + optional JIRA sync."""
import json
import os
import uuid
from datetime import datetime, timezone, date as _date, timedelta, time as _time

try:
    from icalendar import Calendar as _ICalendar
    from dateutil import rrule as _drule
    from dateutil.relativedelta import relativedelta as _relativedelta
    _ICAL_OK = True
except ImportError:
    _ICAL_OK = False
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import httpx
from dotenv import load_dotenv
from sqlmodel import SQLModel, Field, Session, create_engine, select, JSON, Column
from sqlalchemy import Index as _SAIndex

load_dotenv()

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
STATIC_DIR = Path(__file__).parent / "static"
DB_PATH = DATA_DIR / "board.db"

JIRA_URL = os.getenv("JIRA_URL", "").rstrip("/")
JIRA_USER = os.getenv("JIRA_USER", "")
JIRA_TOKEN = os.getenv("JIRA_TOKEN", "")
JIRA_PROJECT = os.getenv("JIRA_PROJECT", "")

_client: httpx.AsyncClient | None = None


def _gen_id() -> str:
    return uuid.uuid4().hex[:12].upper()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


import re as _re
def _normalize_team(name: str) -> str:
    """Strip CSV prefixes like 'Team Fuego' → 'Fuego', 'Equipe Alpha' → 'Alpha'.
    Mirrors extractTeam() in utils.js so member.team aligns with JIRA board names."""
    if not name:
        return name
    return _re.sub(r'^(?:Sprint|Équipe|Equipe|Team|Board|Kanban)\s+', '', name, flags=_re.IGNORECASE).strip() or name


# ══════════════════════════════════════════════════════════════════════════════
# Models
# ══════════════════════════════════════════════════════════════════════════════
_TA = {"extend_existing": True}


class Team(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    color: str = "#3b82f6"
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Member(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    team: str = ""
    role: str = ""
    entity: str = ""   # société / organisation d'appartenance
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Ticket(SQLModel, table=True):
    __table_args__ = (
        _SAIndex('ix_ticket_team_status', 'team', 'status'),
        _SAIndex('ix_ticket_team_pi', 'team', 'pi_sprint'),
        _TA,
    )
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    type: str = "story"
    status: str = Field(default="todo", index=True)
    # Statut JIRA brut (label de colonne d'origine, ex: "En cours de développement") — préservé pour l'affichage UI
    jira_status: str = ""
    team: str = Field(default="", index=True)
    leader: Optional[str] = None
    reporter: Optional[str] = None
    contributors: list[str] = Field(default=[], sa_column=Column(JSON))
    points: int = 0
    priority: str = "medium"
    sprint: Optional[str] = None
    sprint_name: Optional[str] = None
    pi_sprint: Optional[str] = None
    flagged: bool = False
    labels: list[str] = Field(default=[], sa_column=Column(JSON))
    epic_id: Optional[str] = Field(default=None, index=True)
    description: str = ""
    links: list[dict] = Field(default=[], sa_column=Column(JSON))
    comments: list[dict] = Field(default=[], sa_column=Column(JSON))
    recent_changes: list[dict] = Field(default=[], sa_column=Column(JSON))
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
    started_date: Optional[str] = None
    resolved_date: Optional[str] = None
    cycle_time_days: int = 0
    lead_time_days: int = 0


class Feature(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    status: str = Field(default="todo", index=True)
    team: str = ""
    leader: Optional[str] = None
    priority: str = "high"
    pi_sprint: Optional[str] = None
    rank: int = 0
    points: int = 0
    dependencies: list[str] = Field(default=[], sa_column=Column(JSON))
    labels: list[str] = Field(default=[], sa_column=Column(JSON))
    description: str = ""
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Epic(SQLModel, table=True):
    __table_args__ = (
        _SAIndex('ix_epic_feature_team', 'feature_id', 'team'),
        _TA,
    )
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    status: str = Field(default="todo", index=True)
    team: str = ""
    feature_id: Optional[str] = None
    pi_sprint: Optional[str] = None
    labels: list[str] = Field(default=[], sa_column=Column(JSON))
    description: str = ""
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class SprintConfig(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default="sprint-1", primary_key=True)
    name: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    goal: str = ""
    jira_id: Optional[str] = None        # ID JIRA pour PUT vers /rest/agile/1.0/sprint/{id}
    jira_board_id: Optional[str] = None  # ID board d'origine pour construire le lien UI
    # Sprints actifs par équipe — {team, name, startDate, endDate, goal, jiraId, jiraBoardId}
    team_sprints: list[dict] = Field(default=[], sa_column=Column(JSON))
    updated_at: str = Field(default_factory=_now)


class PIConfig(SQLModel, table=True):
    __table_args__ = _TA
    id: str = Field(default="pi-1", primary_key=True)
    number: int = 0
    name: str = ""
    sprints_per_pi: int = 5
    sprint_duration: int = 14
    # Date ISO du 1er jour du PI courant (ex: 2026-04-03 si PI 29 commence le ven. 3 avril).
    # Source de vérité absolue pour le calendrier rotation support — évite la dérivation
    # fragile depuis sprintInfo.startDate.
    start_date: Optional[str] = None
    velocity_target: Optional[int] = None
    objectives: list[dict] = Field(default=[], sa_column=Column(JSON))
    sprint_velocities: list[dict] = Field(default=[], sa_column=Column(JSON))
    role_capacity: dict = Field(default={}, sa_column=Column(JSON))
    # Snapshot des membres par PI au moment de l'import CSV (gère le turnover PI à PI).
    # Forme : { "29": [{name, team, role, entity}, …], "30": […] }
    pi_members: dict = Field(default={}, sa_column=Column(JSON))
    # Snapshot des objectifs par PI (historisation — `objectives` ne contient que le PI courant).
    # Forme : { "29": [{text, team, status, bv, committed}, …], "30": […] }
    # Permet d'afficher les objectifs d'un PI passé/futur sur le dashboard via le sélecteur PI.
    pi_objectives: dict = Field(default={}, sa_column=Column(JSON))
    updated_at: str = Field(default_factory=_now)


class TeamGroup(SQLModel, table=True):
    """Ligne produit / groupe d'equipes."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    name: str = Field(index=True)
    color: str = "#6366f1"
    teams: list[str] = Field(default=[], sa_column=Column(JSON))
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


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
    locked: bool = False          # verrou manuel (futur) — préservé lors d'un shuffle
    unlocked: bool = False        # déverrou exceptionnel d'une semaine passée — la rend modifiable
    members_per_week: int = 2
    week_mode: str = "monday"    # monday | friday | wednesday
    updated_at: str = Field(default_factory=_now)


class Event(SQLModel, table=True):
    """Fait marquant (incident, gel, jalon, periode)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    type: str = "other"
    title: str = ""
    description: str = ""
    start_date: str = ""
    end_date: str = ""
    teams: list[str] = Field(default=[], sa_column=Column(JSON))
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class MoodVote(SQLModel, table=True):
    """Vote mood/ROTI ou Fist of Five par equipe."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    type: str = "mood"           # mood | fist
    team: str = ""
    value: int = 3               # 1-5
    pi_sprint: Optional[str] = None
    author: Optional[str] = None
    note: str = ""
    created_at: str = Field(default_factory=_now)


class RetroItem(SQLModel, table=True):
    """Action d'amelioration continue (retro, post-mortem, CoP, adapt)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str = ""
    source: str = "retro"        # retro | postmortem | cop | adapt
    status: str = "todo"         # todo | inprog | done
    team: str = ""
    owner: Optional[str] = None
    pi_sprint: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Risk(SQLModel, table=True):
    """Risque ROAM (Resolved/Owned/Accepted/Mitigated)."""
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    title: str
    description: str = ""
    quadrant: str = "open"       # open | resolved | owned | accepted | mitigated
    team: str = ""
    owner: Optional[str] = None
    impact: str = "medium"       # low | medium | high
    probability: str = "medium"  # low | medium | high
    mitigation: str = ""
    pi_sprint: Optional[str] = None
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


# ── Atlas : compétences, appétences, mobilité (coaching/RH) ──────────────────
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


class TeamCalendar(SQLModel, table=True):
    """Lien vers un calendrier public ICS (Google Calendar) par equipe."""
    __tablename__ = "team_calendar"
    __table_args__ = _TA
    id: str = Field(default_factory=_gen_id, primary_key=True)
    team: str = Field(default="")
    name: str = Field(default="Calendrier")
    ical_url: str = Field(default="")
    last_fetched: Optional[str] = None
    events_json: Optional[str] = None   # JSON: list[dict] events mis en cache
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


# ══════════════════════════════════════════════════════════════════════════════
# Database engine
# ══════════════════════════════════════════════════════════════════════════════
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
)
SQLModel.metadata.create_all(engine)


def _run_migrations():
    """Add new columns to existing tables (SQLite ALTER TABLE)."""
    from sqlalchemy import text
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
    ]
    with engine.connect() as conn:
        from sqlalchemy import inspect as sa_inspect
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
        ]:
            try:
                conn.execute(text(idx_sql))
                conn.commit()
            except Exception:
                pass


_run_migrations()


def _seed_atlas_catalog():
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


_seed_atlas_catalog()


def get_session():
    with Session(engine) as session:
        yield session


# ══════════════════════════════════════════════════════════════════════════════
# ICS / iCalendar parser
# ══════════════════════════════════════════════════════════════════════════════
def _dt_to_utc(dt) -> datetime:
    """Normalise date ou datetime en datetime UTC-aware."""
    if isinstance(dt, datetime):
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    if isinstance(dt, _date):
        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def _parse_ics_events(ics_text: str) -> list[dict]:
    """
    Parse un flux ICS et développe les événements récurrents (RRULE) dans une
    fenêtre de -1 mois à +4 mois autour d'aujourd'hui.

    Corrections fuseau horaire (DST) :
    - Les RRULE étaient générées en datetime NAÏF puis re-taggées UTC arbitrairement,
      ce qui causait un décalage de +/- 1h lors des transitions été/hiver.
    - Désormais on passe `dtstart` AWARE (avec sa tzinfo originelle) à `rrulestr`,
      et dateutil gère correctement les transitions DST. Les occurrences sont
      converties en UTC pour le payload JSON (le navigateur fait le rendu local).

    Dédoublonnage RECURRENCE-ID :
    - Un VEVENT avec `RECURRENCE-ID` est une instance MODIFIÉE d'une récurrence,
      elle doit remplacer l'occurrence générée par la RRULE master pour cette date.
    - On fait un 1er passage pour collecter les overrides par (uid, date),
      puis on les exclut des occurrences RRULE générées et on les ajoute en standalone.
    """
    if not _ICAL_OK:
        raise RuntimeError("icalendar non installé — lancez : pip install icalendar python-dateutil")
    try:
        cal = _ICalendar.from_ical(ics_text)
    except Exception as e:
        raise ValueError(f"ICS invalide : {e}")

    now = datetime.now(timezone.utc)
    win_start = now - _relativedelta(months=1)
    win_end   = now + _relativedelta(months=4)

    vevents = [c for c in cal.walk() if c.name == "VEVENT"]

    # ── Pass 1 : collecte des overrides RECURRENCE-ID par UID ──────────────────
    # Pour chaque UID, on note les dates des instances modifiées → à exclure
    # lors de la génération des occurrences RRULE master.
    overrides_by_uid: dict[str, set] = {}
    for comp in vevents:
        recid = comp.get("RECURRENCE-ID")
        if not recid:
            continue
        uid = str(comp.get("UID", "") or "")
        if not uid:
            continue
        try:
            rec_utc = _dt_to_utc(recid.dt)
            overrides_by_uid.setdefault(uid, set()).add(rec_utc)
        except Exception:
            continue

    events: list[dict] = []
    seen_keys: set = set()  # (uid, start_iso) — dernière barrière anti-doublons

    def _push(ev: dict):
        k = (ev["uid"], ev["start"])
        if k in seen_keys:
            return
        seen_keys.add(k)
        events.append(ev)

    for comp in vevents:
        try:
            uid   = str(comp.get("UID",         "") or "")
            title = str(comp.get("SUMMARY",     "") or "").strip() or "(Sans titre)"
            desc  = str(comp.get("DESCRIPTION", "") or "")[:500]
            loc   = str(comp.get("LOCATION",    "") or "")
            url   = str(comp.get("URL",         "") or "")

            dtstart = comp.get("DTSTART")
            if not dtstart:
                continue
            raw_s = dtstart.dt
            is_all_day = isinstance(raw_s, _date) and not isinstance(raw_s, datetime)
            start = _dt_to_utc(raw_s)

            dtend = comp.get("DTEND")
            dur_p = comp.get("DURATION")
            if dtend:
                end = _dt_to_utc(dtend.dt)
            elif dur_p:
                end = start + dur_p.dt
            else:
                end = start + (timedelta(days=1) if is_all_day else timedelta(hours=1))
            if end <= start:
                end = start + timedelta(hours=1)
            duration = end - start

            # EXDATEs (exceptions de récurrence) — gardées AWARE pour matcher dtstart
            exdates_aware: list[datetime] = []
            exdate_prop = comp.get("EXDATE")
            if exdate_prop:
                if not isinstance(exdate_prop, list):
                    exdate_prop = [exdate_prop]
                for ex_item in exdate_prop:
                    ex_dts = ex_item.dts if hasattr(ex_item, "dts") else [ex_item]
                    for exdt in ex_dts:
                        exdates_aware.append(_dt_to_utc(exdt.dt))

            # Instance modifiée (RECURRENCE-ID) — ajoutée standalone (= override).
            # Pas de RRULE expansion sur ce comp.
            is_override = comp.get("RECURRENCE-ID") is not None

            def _ev(s: datetime, r: bool) -> dict:
                # s doit être aware (UTC) — isoformat produit ".../+00:00" parsable JS
                return {
                    "uid": uid, "title": title, "description": desc, "location": loc,
                    "url": url,
                    "start": s.isoformat(), "end": (s + duration).isoformat(),
                    "allDay": is_all_day, "recurring": r,
                }

            rrule_prop = comp.get("RRULE")
            if rrule_prop and not is_override:
                rule_str = rrule_prop.to_ical().decode("utf-8")
                # Préserve la tz source pour respecter DST : si dtstart a une tzinfo,
                # on l'utilise telle quelle ; sinon on assume UTC (RFC 5545 "Z"-less
                # est interprété "floating" mais on choisit UTC par défaut).
                dtstart_for_rule = raw_s if (isinstance(raw_s, datetime) and raw_s.tzinfo) else start
                try:
                    rset = _drule.rruleset()
                    rset.rrule(_drule.rrulestr(f"RRULE:{rule_str}", dtstart=dtstart_for_rule))
                    for exdt in exdates_aware:
                        # Les exdates doivent être convertibles à la tz de dtstart_for_rule
                        rset.exdate(exdt.astimezone(dtstart_for_rule.tzinfo) if dtstart_for_rule.tzinfo else exdt.replace(tzinfo=None))
                    # Les RECURRENCE-ID overrides sont aussi à exclure des occurrences générées
                    for ov in overrides_by_uid.get(uid, ()):
                        rset.exdate(ov.astimezone(dtstart_for_rule.tzinfo) if dtstart_for_rule.tzinfo else ov.replace(tzinfo=None))
                    for occ in rset.between(win_start, win_end, inc=True):
                        _push(_ev(occ.astimezone(timezone.utc), True))
                except Exception:
                    if win_start <= start <= win_end:
                        _push(_ev(start, True))
            else:
                if start <= win_end and end >= win_start:
                    # Pour un override, on le marque recurring=True (visible dans l'UI)
                    _push(_ev(start, bool(rrule_prop) or is_override))
        except Exception:
            continue

    events.sort(key=lambda e: e["start"])
    return events


# ══════════════════════════════════════════════════════════════════════════════
# Serialization helpers
# ══════════════════════════════════════════════════════════════════════════════
def _ticket_dict(t: Ticket) -> dict:
    return {
        "id": t.id, "title": t.title, "type": t.type, "status": t.status,
        "jiraStatus": t.jira_status or "",
        "team": t.team, "leader": t.leader, "reporter": t.reporter,
        "contributors": t.contributors or [],
        "assignee": t.leader,
        "points": t.points, "priority": t.priority,
        "sprint": t.sprint, "sprintName": t.sprint_name, "piSprint": t.pi_sprint,
        "flagged": t.flagged, "labels": t.labels or [],
        "epic": t.epic_id, "description": t.description,
        "links": t.links or [],
        "comments": t.comments or [], "recentChanges": t.recent_changes or [],
        "createdAt": t.created_at, "updatedAt": t.updated_at,
        "startedDate": t.started_date,
        "resolvedDate": t.resolved_date,
        "cycleTimeDays": t.cycle_time_days or 0,
        "leadTimeDays": t.lead_time_days or 0,
    }


def _feature_dict(f: Feature) -> dict:
    return {
        "id": f.id, "title": f.title, "type": "feature", "status": f.status,
        "team": f.team, "leader": f.leader, "assignee": f.leader,
        "priority": f.priority, "piSprint": f.pi_sprint,
        "rank": f.rank or 0,
        "points": f.points or 0,
        "dependencies": f.dependencies or [],
        "labels": f.labels or [], "description": f.description,
        "createdAt": f.created_at, "updatedAt": f.updated_at,
    }


def _risk_dict(r: Risk) -> dict:
    return {
        "id": r.id, "title": r.title, "description": r.description,
        "quadrant": r.quadrant, "team": r.team, "owner": r.owner,
        "impact": r.impact, "probability": r.probability,
        "mitigation": r.mitigation, "piSprint": r.pi_sprint,
        "createdAt": r.created_at, "updatedAt": r.updated_at,
    }


def _epic_dict(e: Epic) -> dict:
    return {
        "id": e.id, "title": e.title, "type": "epic", "status": e.status,
        "team": e.team, "feature": e.feature_id, "piSprint": e.pi_sprint,
        "labels": e.labels or [], "description": e.description,
        "createdAt": e.created_at, "updatedAt": e.updated_at,
    }


def _member_dict(m: Member) -> dict:
    return {
        "id": m.id, "name": m.name, "team": m.team, "role": m.role,
        "entity": m.entity,
        "createdAt": m.created_at, "updatedAt": m.updated_at,
    }


def _team_dict(t: Team) -> dict:
    return {
        "id": t.id, "name": t.name, "color": t.color,
        "createdAt": t.created_at, "updatedAt": t.updated_at,
    }


def _skill_dict(s: Skill) -> dict:
    return {"id": s.id, "name": s.name, "category": s.category, "color": s.color, "sort": s.sort}


def _appetence_dict(a: Appetence) -> dict:
    return {"id": a.id, "name": a.name, "category": a.category, "color": a.color, "sort": a.sort}


def _member_skill_dict(ms: MemberSkill) -> dict:
    return {"id": ms.id, "scope": ms.scope, "scopeKey": ms.scope_key, "team": ms.team,
            "skillId": ms.skill_id, "level": ms.level, "updatedAt": ms.updated_at}


def _member_appetence_dict(ma: MemberAppetence) -> dict:
    return {"id": ma.id, "scope": ma.scope, "scopeKey": ma.scope_key, "team": ma.team,
            "appetenceId": ma.appetence_id, "value": ma.value, "updatedAt": ma.updated_at}


def _mobility_dict(m: MemberMobility) -> dict:
    return {"id": m.id, "memberName": m.member_name, "team": m.team,
            "targetTeam": m.target_team, "targetRole": m.target_role,
            "currentLevel": m.current_level, "potential": m.potential,
            "appetence": m.appetence, "risk": m.risk, "plan": m.plan,
            "transitionDuration": m.transition_duration, "updatedAt": m.updated_at}


def _sprint_dict(s: SprintConfig) -> dict | None:
    if not s:
        return None
    return {
        "name": s.name, "startDate": s.start_date, "endDate": s.end_date,
        "goal": s.goal, "updatedAt": s.updated_at,
        "jiraId": s.jira_id, "jiraBoardId": s.jira_board_id,
        "teamSprints": s.team_sprints or [],
    }


def _pi_dict(p: PIConfig) -> dict | None:
    if not p:
        return None
    return {
        "number": p.number, "name": p.name,
        "sprintsPerPI": p.sprints_per_pi, "sprintDuration": p.sprint_duration,
        "startDate": p.start_date,
        "velocityTarget": p.velocity_target,
        "objectives": p.objectives or [],
        "sprintVelocities": p.sprint_velocities or [],
        "roleCapacity": p.role_capacity or {},
        "piMembers": p.pi_members or {},
        "piObjectives": p.pi_objectives or {},
        "updatedAt": p.updated_at,
    }


def _group_dict(g: TeamGroup) -> dict:
    return {
        "id": g.id, "name": g.name, "color": g.color,
        "teams": g.teams or [],
        "createdAt": g.created_at, "updatedAt": g.updated_at,
    }


def _absence_dict(a: Absence) -> dict:
    return {
        "id": a.id, "memberName": a.member_name, "team": a.team,
        "startDate": a.start_date, "endDate": a.end_date,
        "type": a.type, "days": a.days, "note": a.note,
        "createdAt": a.created_at, "updatedAt": a.updated_at,
    }


def _support_dict(s: SupportRotation) -> dict:
    return {
        "id": s.id, "team": s.team, "weekLabel": s.week_label,
        "weekStart": s.week_start, "weekEnd": s.week_end,
        "members": s.members or [],
        "locked": s.locked, "unlocked": s.unlocked, "membersPerWeek": s.members_per_week,
        "weekMode": s.week_mode,
        "updatedAt": s.updated_at,
    }


def _event_dict(e: Event) -> dict:
    return {
        "id": e.id, "type": e.type, "title": e.title,
        "description": e.description,
        "startDate": e.start_date, "endDate": e.end_date,
        "teams": e.teams or [],
        "createdAt": e.created_at, "updatedAt": e.updated_at,
    }


def _mood_dict(m: MoodVote) -> dict:
    return {
        "id": m.id, "type": m.type, "team": m.team,
        "value": m.value, "piSprint": m.pi_sprint,
        "author": m.author, "note": m.note,
        "createdAt": m.created_at,
    }


def _retro_dict(r: RetroItem) -> dict:
    return {
        "id": r.id, "title": r.title, "source": r.source,
        "status": r.status, "team": r.team, "owner": r.owner,
        "piSprint": r.pi_sprint,
        "createdAt": r.created_at, "updatedAt": r.updated_at,
    }


# ══════════════════════════════════════════════════════════════════════════════
# App
# ══════════════════════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client
    _client = httpx.AsyncClient(timeout=30.0)
    yield
    await _client.aclose()


app = FastAPI(title="Squad Board", version="3.0.0", lifespan=lifespan)


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Tickets
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/tickets")
def list_tickets(team: Optional[str] = None, status: Optional[str] = None,
                 epic: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(Ticket)
    if team and team != "all":
        q = q.where(Ticket.team == team)
    if status:
        q = q.where(Ticket.status == status)
    if epic:
        q = q.where(Ticket.epic_id == epic)
    return [_ticket_dict(t) for t in session.exec(q).all()]


@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: str, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    return _ticket_dict(t)


@app.post("/api/tickets")
async def create_ticket(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    t = Ticket(
        id=body.get("id") or _gen_id(),
        title=body["title"],
        type=body.get("type", "story"),
        status=body.get("status", "todo"),
        jira_status=body.get("jiraStatus", ""),
        team=body.get("team", ""),
        leader=body.get("leader") or body.get("assignee"),
        reporter=body.get("reporter"),
        contributors=body.get("contributors", []),
        points=body.get("points", 0),
        priority=body.get("priority", "medium"),
        sprint=body.get("sprint"),
        sprint_name=body.get("sprintName"),
        pi_sprint=body.get("piSprint"),
        flagged=body.get("flagged", False),
        labels=body.get("labels", []),
        epic_id=body.get("epic") or body.get("epic_id"),
        description=body.get("description", ""),
        links=body.get("links", []),
        comments=body.get("comments", []),
        recent_changes=body.get("recentChanges", []),
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return _ticket_dict(t)


@app.put("/api/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, request: Request, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    body = await request.json()
    # Track status change
    if "status" in body and body["status"] != t.status:
        changes = list(t.recent_changes or [])
        changes.append({
            "date": _now(),
            "author": body.pop("_author", "Utilisateur"),
            "field": "status",
            "from": t.status,
            "to": body["status"],
        })
        t.recent_changes = changes
    body.pop("_author", None)
    # Map JSON field names to model attrs
    field_map = {
        "sprintName": "sprint_name", "piSprint": "pi_sprint",
        "epic": "epic_id", "recentChanges": "recent_changes",
        "assignee": "leader", "jiraStatus": "jira_status",
    }
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(t, attr):
            setattr(t, attr, val)
    t.updated_at = _now()
    session.add(t)
    session.commit()
    session.refresh(t)
    return _ticket_dict(t)


@app.delete("/api/tickets/{ticket_id}")
def delete_ticket(ticket_id: str, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    session.delete(t)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Comments (sub-resource of tickets)
# ══════════════════════════════════════════════════════════════════════════════
@app.post("/api/tickets/{ticket_id}/comments")
async def add_comment(ticket_id: str, request: Request, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    body = await request.json()
    comment = {
        "id": _gen_id(),
        "author": body.get("author", "Utilisateur"),
        "body": body.get("body", ""),
        "date": _now(),
    }
    comments = list(t.comments or [])
    comments.append(comment)
    t.comments = comments
    t.updated_at = _now()
    session.add(t)
    session.commit()
    return comment


@app.delete("/api/tickets/{ticket_id}/comments/{comment_id}")
def delete_comment(ticket_id: str, comment_id: str, session: Session = Depends(get_session)):
    t = session.get(Ticket, ticket_id)
    if not t:
        raise HTTPException(404, "Ticket non trouve")
    t.comments = [c for c in (t.comments or []) if c.get("id") != comment_id]
    t.updated_at = _now()
    session.add(t)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Features
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/features")
def list_features(session: Session = Depends(get_session)):
    return [_feature_dict(f) for f in session.exec(select(Feature)).all()]


@app.get("/api/features/{feature_id}")
def get_feature(feature_id: str, session: Session = Depends(get_session)):
    f = session.get(Feature, feature_id)
    if not f:
        raise HTTPException(404, "Feature non trouvee")
    return _feature_dict(f)


@app.post("/api/features")
async def create_feature(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    f = Feature(
        id=body.get("id") or _gen_id(),
        title=body["title"],
        status=body.get("status", "todo"),
        team=body.get("team", ""),
        leader=body.get("leader") or body.get("assignee"),
        priority=body.get("priority", "high"),
        pi_sprint=body.get("piSprint"),
        labels=body.get("labels", []),
        description=body.get("description", ""),
    )
    session.add(f)
    session.commit()
    session.refresh(f)
    return _feature_dict(f)


@app.put("/api/features/{feature_id}")
async def update_feature(feature_id: str, request: Request, session: Session = Depends(get_session)):
    f = session.get(Feature, feature_id)
    if not f:
        raise HTTPException(404, "Feature non trouvee")
    body = await request.json()
    field_map = {"piSprint": "pi_sprint", "assignee": "leader"}
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(f, attr):
            setattr(f, attr, val)
    f.updated_at = _now()
    session.add(f)
    session.commit()
    session.refresh(f)
    return _feature_dict(f)


@app.post("/api/features/rank")
async def bulk_rank_features(request: Request, session: Session = Depends(get_session)):
    """Update rank for a list of features: [{id, rank}, ...]"""
    body = await request.json()
    for item in body:
        f = session.get(Feature, item.get("id", ""))
        if f:
            f.rank = item.get("rank", 0)
            f.updated_at = _now()
            session.add(f)
    session.commit()
    return {"ok": True}


@app.delete("/api/features/{feature_id}")
def delete_feature(feature_id: str, session: Session = Depends(get_session)):
    f = session.get(Feature, feature_id)
    if not f:
        raise HTTPException(404, "Feature non trouvee")
    session.delete(f)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Epics
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/epics")
def list_epics(session: Session = Depends(get_session)):
    return [_epic_dict(e) for e in session.exec(select(Epic)).all()]


@app.post("/api/epics")
async def create_epic(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    e = Epic(
        id=body.get("id") or _gen_id(),
        title=body["title"],
        status=body.get("status", "todo"),
        team=body.get("team", ""),
        feature_id=body.get("feature") or body.get("feature_id"),
        pi_sprint=body.get("piSprint"),
        labels=body.get("labels", []),
        description=body.get("description", ""),
    )
    session.add(e)
    session.commit()
    session.refresh(e)
    return _epic_dict(e)


@app.put("/api/epics/{epic_id}")
async def update_epic(epic_id: str, request: Request, session: Session = Depends(get_session)):
    e = session.get(Epic, epic_id)
    if not e:
        raise HTTPException(404, "Epic non trouve")
    body = await request.json()
    field_map = {"piSprint": "pi_sprint", "feature": "feature_id"}
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(e, attr):
            setattr(e, attr, val)
    e.updated_at = _now()
    session.add(e)
    session.commit()
    session.refresh(e)
    return _epic_dict(e)


@app.delete("/api/epics/{epic_id}")
def delete_epic(epic_id: str, session: Session = Depends(get_session)):
    e = session.get(Epic, epic_id)
    if not e:
        raise HTTPException(404, "Epic non trouve")
    session.delete(e)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Members
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/members")
def list_members(session: Session = Depends(get_session)):
    return [_member_dict(m) for m in session.exec(select(Member)).all()]


@app.post("/api/members")
async def create_member(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    m = Member(
        id=body.get("id") or _gen_id(),
        name=body["name"],
        team=body.get("team", ""),
        role=body.get("role", ""),
        entity=body.get("entity", ""),
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return _member_dict(m)


@app.put("/api/members/{member_id}")
async def update_member(member_id: str, request: Request, session: Session = Depends(get_session)):
    m = session.get(Member, member_id)
    if not m:
        raise HTTPException(404, "Membre non trouve")
    body = await request.json()
    for key, val in body.items():
        if hasattr(m, key):
            setattr(m, key, val)
    m.updated_at = _now()
    session.add(m)
    session.commit()
    session.refresh(m)
    return _member_dict(m)


@app.delete("/api/members/{member_id}")
def delete_member(member_id: str, session: Session = Depends(get_session)):
    m = session.get(Member, member_id)
    if not m:
        raise HTTPException(404, "Membre non trouve")
    session.delete(m)
    session.commit()
    return {"ok": True}


@app.post("/api/members/bulk")
async def bulk_merge_members(request: Request, session: Session = Depends(get_session)):
    """Upsert members by name (CSV import = source of truth).
    replace=False → si name existe : enrichit team/role/entity avec les valeurs CSV
                    non-vides (préserve les valeurs existantes si CSV vide).
                    Sinon → insert.
    replace=True  → clear all members first, then insert.

    Dédup par name.lower() — gère "Alain Lenom" ↔ "alain lenom" comme la même
    personne. Pour deux graphies vraiment différentes (ex: "Alain Lenom" vs
    "LENOM, Alain"), c'est l'utilisateur qui doit nettoyer côté Settings.
    """
    body = await request.json()
    items = body.get("members", [])
    replace = body.get("replace", False)

    if replace:
        for row in session.exec(select(Member)).all():
            session.delete(row)
        session.flush()

    # Map nom_lower → row existant pour upsert
    existing_by_name = {
        m.name.lower(): m
        for m in session.exec(select(Member)).all()
    }
    created = 0
    updated = 0
    for d in items:
        name = (d.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        new_team   = _normalize_team((d.get("team")   or "").strip())
        new_role   = (d.get("role")   or "").strip()
        new_entity = (d.get("entity") or "").strip()

        if key in existing_by_name:
            m = existing_by_name[key]
            changed = False
            # On enrichit : on n'écrase pas une valeur existante par une valeur vide,
            # mais on remplit une valeur vide avec celle du CSV.
            if new_team and m.team != new_team:
                m.team = new_team
                changed = True
            if new_role and m.role != new_role:
                m.role = new_role
                changed = True
            if new_entity and m.entity != new_entity:
                m.entity = new_entity
                changed = True
            if changed:
                m.updated_at = _now()
                session.add(m)
                updated += 1
        else:
            m = Member(
                id=_gen_id(),
                name=name,
                team=new_team,
                role=new_role,
                entity=new_entity,
            )
            session.add(m)
            existing_by_name[key] = m
            created += 1

    session.commit()
    return {"ok": True, "created": created, "updated": updated}


# ══════════════════════════════════════════════════════════════════════════════
# Atlas: Skills, Appetences, MemberSkills, MemberAppetences, Mobility
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/skills")
def list_skills(session: Session = Depends(get_session)):
    rows = session.exec(select(Skill)).all()
    return [_skill_dict(s) for s in sorted(rows, key=lambda x: (x.sort, x.name))]


@app.post("/api/skills")
async def create_skill(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    s = Skill(id=body.get("id") or _gen_id(), name=body["name"],
              category=body.get("category", ""), color=body.get("color", "#6366f1"),
              sort=body.get("sort", 0))
    session.add(s); session.commit(); session.refresh(s)
    return _skill_dict(s)


@app.put("/api/skills/{skill_id}")
async def update_skill(skill_id: str, request: Request, session: Session = Depends(get_session)):
    s = session.get(Skill, skill_id)
    if not s:
        raise HTTPException(404, "Compétence non trouvée")
    body = await request.json()
    for k, v in body.items():
        if hasattr(s, k):
            setattr(s, k, v)
    s.updated_at = _now()
    session.add(s); session.commit(); session.refresh(s)
    return _skill_dict(s)


@app.delete("/api/skills/{skill_id}")
def delete_skill(skill_id: str, session: Session = Depends(get_session)):
    s = session.get(Skill, skill_id)
    if not s:
        raise HTTPException(404, "Compétence non trouvée")
    session.delete(s)
    # Nettoie les niveaux associés
    for ms in session.exec(select(MemberSkill).where(MemberSkill.skill_id == skill_id)).all():
        session.delete(ms)
    session.commit()
    return {"ok": True}


@app.get("/api/appetences")
def list_appetences(session: Session = Depends(get_session)):
    rows = session.exec(select(Appetence)).all()
    return [_appetence_dict(a) for a in sorted(rows, key=lambda x: (x.sort, x.name))]


@app.post("/api/appetences")
async def create_appetence(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    a = Appetence(id=body.get("id") or _gen_id(), name=body["name"],
                  category=body.get("category", ""), color=body.get("color", "#f59e0b"),
                  sort=body.get("sort", 0))
    session.add(a); session.commit(); session.refresh(a)
    return _appetence_dict(a)


@app.put("/api/appetences/{appetence_id}")
async def update_appetence(appetence_id: str, request: Request, session: Session = Depends(get_session)):
    a = session.get(Appetence, appetence_id)
    if not a:
        raise HTTPException(404, "Appétence non trouvée")
    body = await request.json()
    for k, v in body.items():
        if hasattr(a, k):
            setattr(a, k, v)
    a.updated_at = _now()
    session.add(a); session.commit(); session.refresh(a)
    return _appetence_dict(a)


@app.delete("/api/appetences/{appetence_id}")
def delete_appetence(appetence_id: str, session: Session = Depends(get_session)):
    a = session.get(Appetence, appetence_id)
    if not a:
        raise HTTPException(404, "Appétence non trouvée")
    session.delete(a)
    for ma in session.exec(select(MemberAppetence).where(MemberAppetence.appetence_id == appetence_id)).all():
        session.delete(ma)
    session.commit()
    return {"ok": True}


@app.get("/api/member-skills")
def list_member_skills(session: Session = Depends(get_session)):
    return [_member_skill_dict(ms) for ms in session.exec(select(MemberSkill)).all()]


@app.put("/api/member-skills")
async def upsert_member_skill(request: Request, session: Session = Depends(get_session)):
    """Upsert par clé logique scope|scope_key|skill_id. level=0 supprime l'entrée."""
    body = await request.json()
    scope = body.get("scope", "member")
    scope_key = (body.get("scopeKey") or "").strip()
    skill_id = body.get("skillId") or ""
    level = int(body.get("level", 0))
    if not scope_key or not skill_id:
        raise HTTPException(400, "scopeKey et skillId requis")
    row = session.exec(select(MemberSkill).where(
        MemberSkill.scope == scope, MemberSkill.scope_key == scope_key,
        MemberSkill.skill_id == skill_id)).first()
    if level <= 0:
        if row:
            session.delete(row); session.commit()
        return {"ok": True, "deleted": True}
    if row:
        row.level = level; row.team = body.get("team", row.team); row.updated_at = _now()
    else:
        row = MemberSkill(scope=scope, scope_key=scope_key, team=body.get("team", ""),
                          skill_id=skill_id, level=level)
    session.add(row); session.commit(); session.refresh(row)
    return _member_skill_dict(row)


@app.get("/api/member-appetences")
def list_member_appetences(session: Session = Depends(get_session)):
    return [_member_appetence_dict(ma) for ma in session.exec(select(MemberAppetence)).all()]


@app.put("/api/member-appetences")
async def upsert_member_appetence(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    scope = body.get("scope", "member")
    scope_key = (body.get("scopeKey") or "").strip()
    appetence_id = body.get("appetenceId") or ""
    value = body.get("value", "neutre")
    if not scope_key or not appetence_id:
        raise HTTPException(400, "scopeKey et appetenceId requis")
    row = session.exec(select(MemberAppetence).where(
        MemberAppetence.scope == scope, MemberAppetence.scope_key == scope_key,
        MemberAppetence.appetence_id == appetence_id)).first()
    if value == "neutre" and not body.get("keepNeutre"):
        if row:
            session.delete(row); session.commit()
        return {"ok": True, "deleted": True}
    if row:
        row.value = value; row.team = body.get("team", row.team); row.updated_at = _now()
    else:
        row = MemberAppetence(scope=scope, scope_key=scope_key, team=body.get("team", ""),
                              appetence_id=appetence_id, value=value)
    session.add(row); session.commit(); session.refresh(row)
    return _member_appetence_dict(row)


@app.get("/api/mobility")
def list_mobility(session: Session = Depends(get_session)):
    return [_mobility_dict(m) for m in session.exec(select(MemberMobility)).all()]


@app.put("/api/mobility")
async def upsert_mobility(request: Request, session: Session = Depends(get_session)):
    """Upsert une ligne de mobilité par memberName (1 ligne par membre)."""
    body = await request.json()
    member_name = (body.get("memberName") or "").strip()
    if not member_name:
        raise HTTPException(400, "memberName requis")
    row = session.exec(select(MemberMobility).where(
        MemberMobility.member_name == member_name)).first()
    if not row:
        row = MemberMobility(member_name=member_name)
    _map = {"team": "team", "targetTeam": "target_team", "targetRole": "target_role",
            "currentLevel": "current_level", "potential": "potential",
            "appetence": "appetence", "risk": "risk", "plan": "plan",
            "transitionDuration": "transition_duration"}
    for k, attr in _map.items():
        if k in body:
            setattr(row, attr, body[k])
    row.updated_at = _now()
    session.add(row); session.commit(); session.refresh(row)
    return _mobility_dict(row)


@app.delete("/api/mobility/{mobility_id}")
def delete_mobility(mobility_id: str, session: Session = Depends(get_session)):
    m = session.get(MemberMobility, mobility_id)
    if not m:
        raise HTTPException(404, "Ligne non trouvée")
    session.delete(m); session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Teams
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/teams")
def list_teams(session: Session = Depends(get_session)):
    return [_team_dict(t) for t in session.exec(select(Team)).all()]


@app.post("/api/teams")
async def create_team(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    t = Team(
        id=body.get("id") or _gen_id(),
        name=body["name"],
        color=body.get("color", "#3b82f6"),
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return _team_dict(t)


@app.put("/api/teams/{team_id}")
async def update_team(team_id: str, request: Request, session: Session = Depends(get_session)):
    t = session.get(Team, team_id)
    if not t:
        raise HTTPException(404, "Equipe non trouvee")
    body = await request.json()
    for key, val in body.items():
        if hasattr(t, key):
            setattr(t, key, val)
    t.updated_at = _now()
    session.add(t)
    session.commit()
    session.refresh(t)
    return _team_dict(t)


@app.delete("/api/teams/{team_id}")
def delete_team(team_id: str, session: Session = Depends(get_session)):
    t = session.get(Team, team_id)
    if not t:
        raise HTTPException(404, "Equipe non trouvee")
    session.delete(t)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Sprint config
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/sprint")
def get_sprint(session: Session = Depends(get_session)):
    s = session.get(SprintConfig, "sprint-1")
    return _sprint_dict(s)


@app.put("/api/sprint")
async def update_sprint(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    s = session.get(SprintConfig, "sprint-1")
    if not s:
        s = SprintConfig(id="sprint-1")
    s.name = body.get("name", s.name)
    s.start_date = body.get("startDate", s.start_date)
    s.end_date = body.get("endDate", s.end_date)
    s.goal = body.get("goal", s.goal)
    if "jiraId" in body:       s.jira_id = body.get("jiraId")
    if "jiraBoardId" in body:  s.jira_board_id = body.get("jiraBoardId")
    if "teamSprints" in body:  s.team_sprints = body.get("teamSprints") or []
    s.updated_at = _now()
    session.add(s)
    session.commit()
    session.refresh(s)
    return _sprint_dict(s)


# ══════════════════════════════════════════════════════════════════════════════
# PI config
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/pi")
def get_pi(session: Session = Depends(get_session)):
    p = session.get(PIConfig, "pi-1")
    return _pi_dict(p)


@app.put("/api/pi")
async def update_pi(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    p.number = body.get("number", p.number)
    p.name = body.get("name", p.name)
    p.sprints_per_pi = body.get("sprintsPerPI", p.sprints_per_pi)
    p.sprint_duration = body.get("sprintDuration", p.sprint_duration)
    if "startDate" in body:
        p.start_date = body.get("startDate") or None
    p.velocity_target    = body.get("velocityTarget", p.velocity_target)
    p.objectives         = body.get("objectives", p.objectives)
    p.sprint_velocities  = body.get("sprintVelocities", p.sprint_velocities)
    if "roleCapacity" in body:
        p.role_capacity  = body.get("roleCapacity") or {}
    if "piMembers" in body:
        p.pi_members     = body.get("piMembers") or {}
    if "piObjectives" in body:
        p.pi_objectives  = body.get("piObjectives") or {}
    # Historisation auto : à chaque save des objectifs du PI courant, on snapshot dans
    # pi_objectives[number] pour que les PI passés restent consultables (dashboard / sélecteur).
    # Le snapshot ne s'écrase qu'à la clé du PI courant — les autres PI sont préservés.
    if "objectives" in body and p.number:
        snap = dict(p.pi_objectives or {})
        snap[str(p.number)] = p.objectives or []
        p.pi_objectives = snap
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return _pi_dict(p)


@app.put("/api/pi/members/{pi_number}")
async def set_pi_members(pi_number: int, request: Request, session: Session = Depends(get_session)):
    """Enregistre le snapshot des membres d'UN PI (fusion — n'écrase pas les autres PI)."""
    body = await request.json()
    members = body.get("members", [])
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    current = dict(p.pi_members or {})
    current[str(pi_number)] = members
    p.pi_members = current
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "piNumber": pi_number, "count": len(members)}


@app.put("/api/pi/objectives/{pi_number}")
async def set_pi_objectives(pi_number: int, request: Request, session: Session = Depends(get_session)):
    """Enregistre le snapshot des objectifs d'UN PI (fusion — n'écrase pas les autres PI).

    Si pi_number == PI courant, met aussi à jour `objectives` (le jeu vivant) pour rester cohérent.
    """
    body = await request.json()
    objectives = body.get("objectives", [])
    p = session.get(PIConfig, "pi-1")
    if not p:
        p = PIConfig(id="pi-1")
    current = dict(p.pi_objectives or {})
    current[str(pi_number)] = objectives
    p.pi_objectives = current
    if p.number and pi_number == p.number:
        p.objectives = objectives
    p.updated_at = _now()
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"ok": True, "piNumber": pi_number, "count": len(objectives)}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Team Groups (lignes produit)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/groups")
def list_groups(session: Session = Depends(get_session)):
    return [_group_dict(g) for g in session.exec(select(TeamGroup)).all()]


@app.post("/api/groups")
async def create_group(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "Le nom est requis")
    g = TeamGroup(
        id=body.get("id") or _gen_id(),
        name=body["name"],
        color=body.get("color", "#6366f1"),
        teams=body.get("teams", []),
    )
    session.add(g)
    session.commit()
    session.refresh(g)
    return _group_dict(g)


@app.put("/api/groups/{group_id}")
async def update_group(group_id: str, request: Request, session: Session = Depends(get_session)):
    g = session.get(TeamGroup, group_id)
    if not g:
        raise HTTPException(404, "Groupe non trouve")
    body = await request.json()
    for key, val in body.items():
        if hasattr(g, key):
            setattr(g, key, val)
    g.updated_at = _now()
    session.add(g)
    session.commit()
    session.refresh(g)
    return _group_dict(g)


@app.delete("/api/groups/{group_id}")
def delete_group(group_id: str, session: Session = Depends(get_session)):
    g = session.get(TeamGroup, group_id)
    if not g:
        raise HTTPException(404, "Groupe non trouve")
    session.delete(g)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Absences
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/absences")
def list_absences(team: Optional[str] = None, member: Optional[str] = None,
                  session: Session = Depends(get_session)):
    q = select(Absence)
    if team:
        q = q.where(Absence.team == team)
    if member:
        q = q.where(Absence.member_name == member)
    return [_absence_dict(a) for a in session.exec(q).all()]


@app.post("/api/absences")
async def create_absence(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("memberName"):
        raise HTTPException(400, "Le nom du membre est requis")
    a = Absence(
        member_name=body["memberName"],
        team=_normalize_team(body.get("team", "")),
        start_date=body.get("startDate", ""),
        end_date=body.get("endDate", ""),
        type=body.get("type", "conge"),
        days=body.get("days", 1.0),
        note=body.get("note", ""),
    )
    session.add(a)
    session.commit()
    session.refresh(a)
    return _absence_dict(a)


@app.post("/api/absences/repair-encoding")
async def repair_absence_encoding(session: Session = Depends(get_session)):
    """Corrige les noms d'équipe et de membre encodés en mojibake (Windows-1252 lu comme UTF-8).
    Ex: 'CamÃ©lÃ©on' -> 'Caméléon'. Idempotent : ne modifie que les lignes effectivement corrompues."""
    def _fix(s: str) -> str:
        if not s:
            return s
        try:
            fixed = s.encode('latin-1').decode('utf-8')
            return fixed if fixed != s else s
        except (UnicodeEncodeError, UnicodeDecodeError):
            return s

    fixed_count = 0
    for a in session.exec(select(Absence)).all():
        new_team = _normalize_team(_fix(a.team or ""))
        new_name = _fix(a.member_name or "")
        if new_team != a.team or new_name != a.member_name:
            a.team = new_team
            a.member_name = new_name
            session.add(a)
            fixed_count += 1
    session.commit()
    return {"ok": True, "fixed": fixed_count}

@app.post("/api/absences/bulk")
async def bulk_create_absences(request: Request, session: Session = Depends(get_session)):
    """Import multiple absences. Deduplicates by (member_name, start_date, end_date).
    replace=True clears the table first; replace=False appends without duplicates."""
    body = await request.json()
    items = body.get("absences", [])
    replace = body.get("replace", False)
    if replace:
        for row in session.exec(select(Absence)).all():
            session.delete(row)
        session.flush()

    # Build a set of existing (member_name, start_date, end_date) to deduplicate
    existing = {
        (a.member_name, a.start_date, a.end_date)
        for a in session.exec(select(Absence)).all()
    }
    created = 0
    skipped = 0
    for d in items:
        key = (d.get("memberName", ""), d.get("startDate", ""), d.get("endDate", d.get("startDate", "")))
        if key in existing:
            skipped += 1
            continue
        a = Absence(
            member_name=d.get("memberName", ""),
            team=_normalize_team(d.get("team", "")),
            start_date=d.get("startDate", ""),
            end_date=d.get("endDate", d.get("startDate", "")),
            type=d.get("type", "conge"),
            days=d.get("days", 1.0),
            note=d.get("note", ""),
        )
        session.add(a)
        existing.add(key)
        created += 1
    session.commit()
    return {"ok": True, "created": created, "skipped": skipped}


@app.put("/api/absences/{absence_id}")
async def update_absence(absence_id: str, request: Request, session: Session = Depends(get_session)):
    a = session.get(Absence, absence_id)
    if not a:
        raise HTTPException(404, "Absence non trouvee")
    body = await request.json()
    field_map = {"memberName": "member_name", "startDate": "start_date", "endDate": "end_date"}
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(a, attr):
            setattr(a, attr, val)
    a.updated_at = _now()
    session.add(a)
    session.commit()
    session.refresh(a)
    return _absence_dict(a)


@app.delete("/api/absences/{absence_id}")
def delete_absence(absence_id: str, session: Session = Depends(get_session)):
    a = session.get(Absence, absence_id)
    if not a:
        raise HTTPException(404, "Absence non trouvee")
    session.delete(a)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Support Rotation
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/support")
def list_support(team: Optional[str] = None, session: Session = Depends(get_session)):
    q = select(SupportRotation)
    if team:
        q = q.where(SupportRotation.team == team)
    return [_support_dict(s) for s in session.exec(q.order_by(SupportRotation.week_start)).all()]


@app.post("/api/support")
async def create_support(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    s = SupportRotation(
        team=body.get("team", ""),
        week_label=body.get("weekLabel", ""),
        week_start=body.get("weekStart", ""),
        week_end=body.get("weekEnd", ""),
        members=body.get("members", []),
        locked=body.get("locked", False),
        unlocked=body.get("unlocked", False),
        members_per_week=body.get("membersPerWeek", 2),
        week_mode=body.get("weekMode", "monday"),
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    return _support_dict(s)


@app.post("/api/support/bulk")
async def bulk_create_support(request: Request, session: Session = Depends(get_session)):
    """Import full rotation grid at once."""
    body = await request.json()
    items = body.get("rotations", [])
    team = body.get("team")
    if team:
        for row in session.exec(select(SupportRotation).where(SupportRotation.team == team)).all():
            session.delete(row)
    for d in items:
        s = SupportRotation(
            team=d.get("team", team or ""),
            week_label=d.get("weekLabel", ""),
            week_start=d.get("weekStart", ""),
            week_end=d.get("weekEnd", ""),
            members=d.get("members", []),
            locked=d.get("locked", False),
            unlocked=d.get("unlocked", False),
            members_per_week=d.get("membersPerWeek", 2),
            week_mode=d.get("weekMode", "monday"),
        )
        session.add(s)
    session.commit()
    return {"ok": True, "count": len(items)}


@app.put("/api/support/{rotation_id}")
async def update_support(rotation_id: str, request: Request, session: Session = Depends(get_session)):
    s = session.get(SupportRotation, rotation_id)
    if not s:
        raise HTTPException(404, "Rotation non trouvee")
    body = await request.json()
    field_map = {"weekLabel": "week_label", "weekStart": "week_start", "weekEnd": "week_end", "membersPerWeek": "members_per_week", "weekMode": "week_mode"}
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(s, attr):
            setattr(s, attr, val)
    s.updated_at = _now()
    session.add(s)
    session.commit()
    session.refresh(s)
    return _support_dict(s)


@app.delete("/api/support/{rotation_id}")
def delete_support(rotation_id: str, session: Session = Depends(get_session)):
    s = session.get(SupportRotation, rotation_id)
    if not s:
        raise HTTPException(404, "Rotation non trouvee")
    session.delete(s)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Events (Faits marquants)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/events")
def list_events(session: Session = Depends(get_session)):
    return [_event_dict(e) for e in session.exec(select(Event)).all()]


@app.post("/api/events")
async def create_event(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    e = Event(
        type=body.get("type", "other"),
        title=body["title"],
        description=body.get("description", ""),
        start_date=body.get("startDate", ""),
        end_date=body.get("endDate") or body.get("startDate", ""),
        teams=body.get("teams", []),
    )
    session.add(e)
    session.commit()
    session.refresh(e)
    return _event_dict(e)


@app.put("/api/events/{event_id}")
async def update_event(event_id: str, request: Request, session: Session = Depends(get_session)):
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Evenement non trouve")
    body = await request.json()
    field_map = {"startDate": "start_date", "endDate": "end_date"}
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(e, attr):
            setattr(e, attr, val)
    e.updated_at = _now()
    session.add(e)
    session.commit()
    session.refresh(e)
    return _event_dict(e)


@app.delete("/api/events/{event_id}")
def delete_event(event_id: str, session: Session = Depends(get_session)):
    e = session.get(Event, event_id)
    if not e:
        raise HTTPException(404, "Evenement non trouve")
    session.delete(e)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Retro Items (Amelioration continue)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/retro")
def list_retro(team: Optional[str] = None, source: Optional[str] = None,
               session: Session = Depends(get_session)):
    q = select(RetroItem)
    if team: q = q.where(RetroItem.team == team)
    if source: q = q.where(RetroItem.source == source)
    return [_retro_dict(r) for r in session.exec(q).all()]


@app.post("/api/retro")
async def create_retro(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    r = RetroItem(
        title=body["title"],
        source=body.get("source", "retro"),
        status=body.get("status", "todo"),
        team=body.get("team", ""),
        owner=body.get("owner"),
        pi_sprint=body.get("piSprint"),
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return _retro_dict(r)


@app.put("/api/retro/{retro_id}")
async def update_retro(retro_id: str, request: Request, session: Session = Depends(get_session)):
    r = session.get(RetroItem, retro_id)
    if not r:
        raise HTTPException(404, "Action non trouvee")
    body = await request.json()
    field_map = {"piSprint": "pi_sprint"}
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(r, attr): setattr(r, attr, val)
    r.updated_at = _now()
    session.add(r)
    session.commit()
    session.refresh(r)
    return _retro_dict(r)


@app.delete("/api/retro/{retro_id}")
def delete_retro(retro_id: str, session: Session = Depends(get_session)):
    r = session.get(RetroItem, retro_id)
    if not r:
        raise HTTPException(404, "Action non trouvee")
    session.delete(r)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Risks (ROAM board)
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/risks")
def list_risks(team: Optional[str] = None, quadrant: Optional[str] = None,
               session: Session = Depends(get_session)):
    q = select(Risk)
    if team: q = q.where(Risk.team == team)
    if quadrant: q = q.where(Risk.quadrant == quadrant)
    return [_risk_dict(r) for r in session.exec(q.order_by(Risk.created_at)).all()]


@app.post("/api/risks")
async def create_risk(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("title"):
        raise HTTPException(400, "Le titre est requis")
    r = Risk(
        title=body["title"],
        description=body.get("description", ""),
        quadrant=body.get("quadrant", "open"),
        team=body.get("team", ""),
        owner=body.get("owner"),
        impact=body.get("impact", "medium"),
        probability=body.get("probability", "medium"),
        mitigation=body.get("mitigation", ""),
        pi_sprint=body.get("piSprint"),
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    return _risk_dict(r)


@app.put("/api/risks/{risk_id}")
async def update_risk(risk_id: str, request: Request, session: Session = Depends(get_session)):
    r = session.get(Risk, risk_id)
    if not r:
        raise HTTPException(404, "Risque non trouve")
    body = await request.json()
    field_map = {"piSprint": "pi_sprint"}
    for key, val in body.items():
        attr = field_map.get(key, key)
        if hasattr(r, attr):
            setattr(r, attr, val)
    r.updated_at = _now()
    session.add(r)
    session.commit()
    session.refresh(r)
    return _risk_dict(r)


@app.delete("/api/risks/{risk_id}")
def delete_risk(risk_id: str, session: Session = Depends(get_session)):
    r = session.get(Risk, risk_id)
    if not r:
        raise HTTPException(404, "Risque non trouve")
    session.delete(r)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# CRUD: Mood / Fist of Five votes
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/mood")
def list_mood(type: Optional[str] = None, team: Optional[str] = None,
              session: Session = Depends(get_session)):
    q = select(MoodVote)
    if type: q = q.where(MoodVote.type == type)
    if team: q = q.where(MoodVote.team == team)
    return [_mood_dict(m) for m in session.exec(q.order_by(MoodVote.created_at)).all()]


@app.post("/api/mood")
async def create_mood(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    try:
        _val = int(body.get("value", 3))
    except (TypeError, ValueError):
        _val = 3
    m = MoodVote(
        type=body.get("type", "mood"),
        team=body.get("team", ""),
        value=max(1, min(5, _val)),
        pi_sprint=body.get("piSprint"),
        author=body.get("author"),
        note=body.get("note", ""),
    )
    session.add(m)
    session.commit()
    session.refresh(m)
    return _mood_dict(m)


@app.delete("/api/mood/{mood_id}")
def delete_mood(mood_id: str, session: Session = Depends(get_session)):
    m = session.get(MoodVote, mood_id)
    if not m:
        raise HTTPException(404, "Vote non trouve")
    session.delete(m)
    session.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# Bulk import / export
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/export")
def export_all(session: Session = Depends(get_session)):
    return {
        "tickets": [_ticket_dict(t) for t in session.exec(select(Ticket)).all()],
        "features": [_feature_dict(f) for f in session.exec(select(Feature)).all()],
        "epics": [_epic_dict(e) for e in session.exec(select(Epic)).all()],
        "members": [_member_dict(m) for m in session.exec(select(Member)).all()],
        "teams": [_team_dict(t) for t in session.exec(select(Team)).all()],
        "groups": [_group_dict(g) for g in session.exec(select(TeamGroup)).all()],
        "absences": [_absence_dict(a) for a in session.exec(select(Absence)).all()],
        "support": [_support_dict(s) for s in session.exec(select(SupportRotation)).all()],
        "events": [_event_dict(e) for e in session.exec(select(Event)).all()],
        "risks": [_risk_dict(r) for r in session.exec(select(Risk)).all()],
        "skills": [_skill_dict(s) for s in session.exec(select(Skill)).all()],
        "appetences": [_appetence_dict(a) for a in session.exec(select(Appetence)).all()],
        "memberSkills": [_member_skill_dict(ms) for ms in session.exec(select(MemberSkill)).all()],
        "memberAppetences": [_member_appetence_dict(ma) for ma in session.exec(select(MemberAppetence)).all()],
        "mobility": [_mobility_dict(m) for m in session.exec(select(MemberMobility)).all()],
        "sprint": _sprint_dict(session.get(SprintConfig, "sprint-1")),
        "pi": _pi_dict(session.get(PIConfig, "pi-1")),
        "exportedAt": _now(),
    }


@app.get("/api/all")
def get_all_data(session: Session = Depends(get_session)):
    """Single endpoint for boot load — replaces 17 parallel HTTP calls in loadAllData().
    Atlas data (skills/appetences/memberSkills/memberAppetences/mobility) is excluded
    and still loaded lazily in the background."""
    cal_events: list[dict] = []
    for cal in session.exec(select(TeamCalendar)).all():
        if not cal.events_json:
            continue
        try:
            for ev in json.loads(cal.events_json):
                ev["calendarId"] = cal.id; ev["calendarName"] = cal.name; ev["team"] = cal.team
                cal_events.append(ev)
        except Exception:
            pass
    cal_events.sort(key=lambda e: e.get("start", ""))
    return {
        "tickets":       [_ticket_dict(t) for t in session.exec(select(Ticket)).all()],
        "features":      [_feature_dict(f) for f in session.exec(select(Feature)).all()],
        "epics":         [_epic_dict(e) for e in session.exec(select(Epic)).all()],
        "members":       [_member_dict(m) for m in session.exec(select(Member)).all()],
        "teams":         [_team_dict(t) for t in session.exec(select(Team)).all()],
        "groups":        [_group_dict(g) for g in session.exec(select(TeamGroup)).all()],
        "absences":      [_absence_dict(a) for a in session.exec(select(Absence)).all()],
        "support":       [_support_dict(s) for s in session.exec(select(SupportRotation)).all()],
        "events":        [_event_dict(e) for e in session.exec(select(Event)).all()],
        "retroItems":    [_retro_dict(r) for r in session.exec(select(RetroItem)).all()],
        "risks":         [_risk_dict(r) for r in session.exec(select(Risk)).all()],
        "moodVotes":     [_mood_dict(m) for m in session.exec(select(MoodVote).where(MoodVote.type == "mood")).all()],
        "fistVotes":     [_mood_dict(m) for m in session.exec(select(MoodVote).where(MoodVote.type == "fist")).all()],
        "calendars":     [_cal_dict(c) for c in session.exec(select(TeamCalendar)).all()],
        "calendarEvents": cal_events,
        "sprint":        _sprint_dict(session.get(SprintConfig, "sprint-1")),
        "pi":            _pi_dict(session.get(PIConfig, "pi-1")),
    }


@app.post("/api/import")
async def import_all(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    mode = body.get("mode", "replace")
    counts = {}

    if "teams" in body and body["teams"] is not None:
        items = body["teams"]
        if mode == "replace":
            for row in session.exec(select(Team)).all():
                session.delete(row)
        elif mode == "merge":
            # Dédoublonnage : artefact des anciennes syncs rapides qui créaient un nouveau Team
            # à chaque sync au lieu de réutiliser l'existant. On garde le plus ancien par nom.
            existing = session.exec(select(Team)).all()
            kept_by_name = {}
            for t in existing:
                prev = kept_by_name.get(t.name)
                if prev is None:
                    kept_by_name[t.name] = t
                elif (t.created_at or '') < (prev.created_at or ''):
                    session.delete(prev); kept_by_name[t.name] = t
                else:
                    session.delete(t)
        for d in items:
            t = None
            if mode == "merge":
                # Lookup par id si fourni, sinon par nom (sync JIRA n'envoie pas d'id, mais le nom est la clé logique)
                if d.get("id"):
                    t = session.get(Team, d["id"])
                if not t and d.get("name"):
                    t = session.exec(select(Team).where(Team.name == d["name"])).first()
            if t:
                t.color = d.get("color", t.color)
                t.updated_at = _now()
            else:
                t = Team(id=d.get("id") or _gen_id(), name=d["name"], color=d.get("color", "#3b82f6"))
            session.add(t)
        counts["teams"] = len(items)

    if "members" in body and body["members"] is not None:
        items = body["members"]
        if mode == "replace":
            for row in session.exec(select(Member)).all():
                session.delete(row)
        for d in items:
            m = session.get(Member, d.get("id", "")) if mode == "merge" else None
            if m:
                m.name = d.get("name", m.name)
                m.team = d.get("team", m.team)
                m.role = d.get("role", m.role)
                m.updated_at = _now()
            else:
                m = Member(id=d.get("id") or _gen_id(), name=d["name"], team=d.get("team", ""), role=d.get("role", ""))
            session.add(m)
        counts["members"] = len(items)

    if "epics" in body and body["epics"] is not None:
        items = body["epics"]
        if mode == "replace":
            for row in session.exec(select(Epic)).all():
                session.delete(row)
        for d in items:
            e = Epic(
                id=d.get("id") or _gen_id(), title=d.get("title", ""),
                status=d.get("status", "todo"), team=d.get("team", ""),
                feature_id=d.get("feature") or d.get("feature_id"),
                pi_sprint=d.get("piSprint"), labels=d.get("labels", []),
                description=d.get("description", ""),
            )
            session.merge(e)
        counts["epics"] = len(items)

    if "features" in body and body["features"] is not None:
        items = body["features"]
        if mode == "replace":
            for row in session.exec(select(Feature)).all():
                session.delete(row)
        for d in items:
            # Préserver rank/points existants si non fournis (sync.js les envoie, test page Synchro non)
            fid = d.get("id") or _gen_id()
            existing = session.get(Feature, fid) if d.get("id") else None
            f = Feature(
                id=fid, title=d.get("title", ""),
                status=d.get("status", "todo"), team=d.get("team", ""),
                leader=d.get("leader") or d.get("assignee"),
                priority=d.get("priority", "high"),
                pi_sprint=d.get("piSprint"), labels=d.get("labels", []),
                description=d.get("description", ""),
                rank=d.get("rank", existing.rank if existing else 0),
                points=d.get("points", existing.points if existing else 0),
            )
            session.merge(f)
        counts["features"] = len(items)

    if "tickets" in body and body["tickets"] is not None:
        items = body["tickets"]
        if mode == "replace":
            for row in session.exec(select(Ticket)).all():
                session.delete(row)
        for d in items:
            t = Ticket(
                id=d.get("id") or _gen_id(), title=d.get("title", ""),
                type=d.get("type", "story"), status=d.get("status", "todo"),
                jira_status=d.get("jiraStatus", ""),
                team=d.get("team", ""),
                leader=d.get("leader") or d.get("assignee"),
                reporter=d.get("reporter"),
                contributors=d.get("contributors", []),
                points=d.get("points", 0), priority=d.get("priority", "medium"),
                sprint=d.get("sprint"), sprint_name=d.get("sprintName"),
                pi_sprint=d.get("piSprint"), flagged=d.get("flagged", False),
                labels=d.get("labels", []),
                epic_id=d.get("epic") or d.get("epic_id"),
                description=d.get("description", ""),
                links=d.get("links", []),
                comments=d.get("comments", []),
                recent_changes=d.get("recentChanges", []),
                started_date=d.get("startedDate"),
                resolved_date=d.get("resolvedDate"),
                cycle_time_days=d.get("cycleTimeDays") or 0,
                lead_time_days=d.get("leadTimeDays") or 0,
            )
            session.merge(t)
        counts["tickets"] = len(items)

    if "sprint" in body and body["sprint"] is not None:
        sd = body["sprint"]
        if isinstance(sd, list):
            sd = sd[0] if sd else {}
        s = session.get(SprintConfig, "sprint-1") or SprintConfig(id="sprint-1")
        s.name = sd.get("name", "")
        s.start_date = sd.get("startDate")
        s.end_date = sd.get("endDate")
        s.goal = sd.get("goal", "")
        if sd.get("jiraId") is not None:       s.jira_id = sd.get("jiraId")
        if sd.get("jiraBoardId") is not None:  s.jira_board_id = sd.get("jiraBoardId")
        if sd.get("teamSprints") is not None:  s.team_sprints = sd.get("teamSprints") or []
        s.updated_at = _now()
        session.add(s)

    if "pi" in body and body["pi"] is not None:
        pd = body["pi"]
        if isinstance(pd, list):
            pd = pd[0] if pd else {}
        p = session.get(PIConfig, "pi-1") or PIConfig(id="pi-1")
        p.number = pd.get("number", 0)
        p.name = pd.get("name", "")
        p.sprints_per_pi   = pd.get("sprintsPerPI", p.sprints_per_pi)
        p.sprint_duration  = pd.get("sprintDuration", p.sprint_duration)
        p.start_date       = pd.get("startDate", p.start_date)
        p.velocity_target  = pd.get("velocityTarget", p.velocity_target)
        p.objectives       = pd.get("objectives", [])
        p.sprint_velocities = pd.get("sprintVelocities", p.sprint_velocities or [])
        p.role_capacity    = pd.get("roleCapacity", p.role_capacity or {})
        p.pi_members       = pd.get("piMembers", p.pi_members or {})
        p.pi_objectives    = pd.get("piObjectives", p.pi_objectives or {})
        # Historise les objectifs importés sous la clé du PI courant si pas déjà couverts.
        if p.number and str(p.number) not in (p.pi_objectives or {}):
            snap = dict(p.pi_objectives or {})
            snap[str(p.number)] = p.objectives or []
            p.pi_objectives = snap
        p.updated_at = _now()
        session.add(p)

    if "groups" in body and body["groups"] is not None:
        items = body["groups"]
        if mode == "replace":
            for row in session.exec(select(TeamGroup)).all():
                session.delete(row)
        for d in items:
            g = TeamGroup(
                id=d.get("id") or _gen_id(), name=d.get("name", ""),
                color=d.get("color", "#6366f1"), teams=d.get("teams", []),
            )
            session.merge(g)
        counts["groups"] = len(items)

    if "absences" in body and body["absences"] is not None:
        items = body["absences"]
        if mode == "replace":
            for row in session.exec(select(Absence)).all():
                session.delete(row)
        for d in items:
            a = Absence(
                id=d.get("id") or _gen_id(),
                member_name=d.get("memberName", ""),
                team=d.get("team", ""),
                start_date=d.get("startDate", ""),
                end_date=d.get("endDate", ""),
                type=d.get("type", "conge"),
                days=d.get("days", 1.0),
                note=d.get("note", ""),
            )
            session.merge(a)
        counts["absences"] = len(items)

    if "support" in body and body["support"] is not None:
        items = body["support"]
        if mode == "replace":
            for row in session.exec(select(SupportRotation)).all():
                session.delete(row)
        for d in items:
            s = SupportRotation(
                id=d.get("id") or _gen_id(),
                team=d.get("team", ""),
                week_label=d.get("weekLabel", ""),
                week_start=d.get("weekStart", ""),
                week_end=d.get("weekEnd", ""),
                members=d.get("members", []),
            )
            session.merge(s)
        counts["support"] = len(items)

    if "events" in body and body["events"] is not None:
        items = body["events"]
        if mode == "replace":
            for row in session.exec(select(Event)).all():
                session.delete(row)
        for d in items:
            e = Event(
                id=d.get("id") or _gen_id(),
                type=d.get("type", "other"),
                title=d.get("title", ""),
                description=d.get("description", ""),
                start_date=d.get("startDate", ""),
                end_date=d.get("endDate", ""),
                teams=d.get("teams", []),
            )
            session.merge(e)
        counts["events"] = len(items)

    # ── Atlas : compétences / appétences / niveaux / mobilité ──────────────────
    if "skills" in body and body["skills"] is not None:
        items = body["skills"]
        if mode == "replace":
            for row in session.exec(select(Skill)).all():
                session.delete(row)
        for d in items:
            session.merge(Skill(
                id=d.get("id") or _gen_id(), name=d.get("name", ""),
                category=d.get("category", ""), color=d.get("color", "#6366f1"),
                sort=d.get("sort", 0),
            ))
        counts["skills"] = len(items)

    if "appetences" in body and body["appetences"] is not None:
        items = body["appetences"]
        if mode == "replace":
            for row in session.exec(select(Appetence)).all():
                session.delete(row)
        for d in items:
            session.merge(Appetence(
                id=d.get("id") or _gen_id(), name=d.get("name", ""),
                category=d.get("category", ""), color=d.get("color", "#f59e0b"),
                sort=d.get("sort", 0),
            ))
        counts["appetences"] = len(items)

    if "memberSkills" in body and body["memberSkills"] is not None:
        items = body["memberSkills"]
        if mode == "replace":
            for row in session.exec(select(MemberSkill)).all():
                session.delete(row)
        for d in items:
            session.merge(MemberSkill(
                id=d.get("id") or _gen_id(),
                scope=d.get("scope", "member"), scope_key=d.get("scopeKey", ""),
                team=d.get("team", ""), skill_id=d.get("skillId", ""),
                level=d.get("level", 0),
            ))
        counts["memberSkills"] = len(items)

    if "memberAppetences" in body and body["memberAppetences"] is not None:
        items = body["memberAppetences"]
        if mode == "replace":
            for row in session.exec(select(MemberAppetence)).all():
                session.delete(row)
        for d in items:
            session.merge(MemberAppetence(
                id=d.get("id") or _gen_id(),
                scope=d.get("scope", "member"), scope_key=d.get("scopeKey", ""),
                team=d.get("team", ""), appetence_id=d.get("appetenceId", ""),
                value=d.get("value", "neutre"),
            ))
        counts["memberAppetences"] = len(items)

    if "mobility" in body and body["mobility"] is not None:
        items = body["mobility"]
        if mode == "replace":
            for row in session.exec(select(MemberMobility)).all():
                session.delete(row)
        for d in items:
            session.merge(MemberMobility(
                id=d.get("id") or _gen_id(), member_name=d.get("memberName", ""),
                team=d.get("team", ""), target_team=d.get("targetTeam", ""),
                target_role=d.get("targetRole", ""), current_level=d.get("currentLevel", 0),
                potential=d.get("potential", "moyen"), appetence=d.get("appetence", "neutre"),
                risk=d.get("risk", "aucun"), plan=d.get("plan", ""),
                transition_duration=d.get("transitionDuration", ""),
            ))
        counts["mobility"] = len(items)

    session.commit()
    return {"ok": True, "mode": mode, "counts": counts}


# ══════════════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════════════
# Calendriers ICS
# ══════════════════════════════════════════════════════════════════════════════
def _cal_dict(c: TeamCalendar) -> dict:
    return {
        "id": c.id, "team": c.team, "name": c.name,
        "icalUrl": c.ical_url, "lastFetched": c.last_fetched,
        "createdAt": c.created_at,
    }


@app.get("/api/calendars")
def list_calendars(session: Session = Depends(get_session)):
    return [_cal_dict(c) for c in session.exec(select(TeamCalendar)).all()]


@app.post("/api/calendars")
async def create_calendar(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    if not body.get("icalUrl"):
        raise HTTPException(400, "icalUrl est requis")
    c = TeamCalendar(
        team=body.get("team", ""),
        name=body.get("name", "Calendrier"),
        ical_url=body["icalUrl"],
    )
    session.add(c); session.commit(); session.refresh(c)
    return _cal_dict(c)


@app.put("/api/calendars/{cal_id}")
async def update_calendar(cal_id: str, request: Request, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    body = await request.json()
    if "team" in body: c.team = body["team"]
    if "name" in body: c.name = body["name"]
    if "icalUrl" in body: c.ical_url = body["icalUrl"]
    c.updated_at = _now()
    session.add(c); session.commit(); session.refresh(c)
    return _cal_dict(c)


@app.delete("/api/calendars/{cal_id}")
def delete_calendar(cal_id: str, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    session.delete(c); session.commit()
    return {"ok": True}


@app.post("/api/calendars/{cal_id}/refresh")
async def refresh_calendar(cal_id: str, session: Session = Depends(get_session)):
    c = session.get(TeamCalendar, cal_id)
    if not c:
        raise HTTPException(404, "Calendrier introuvable")
    if not c.ical_url:
        raise HTTPException(400, "Aucune URL configurée")
    try:
        resp = await _client.get(c.ical_url, follow_redirects=True, timeout=30)
        resp.raise_for_status()
    except httpx.RequestError as e:
        raise HTTPException(502, f"Erreur réseau : {e}")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"Erreur HTTP {e.response.status_code}")
    try:
        evs = _parse_ics_events(resp.text)
    except Exception as e:
        raise HTTPException(422, str(e))
    c.events_json = json.dumps(evs, ensure_ascii=False)
    c.last_fetched = _now()
    c.updated_at = _now()
    session.add(c); session.commit(); session.refresh(c)
    return {"ok": True, "count": len(evs), "lastFetched": c.last_fetched}


@app.get("/api/calendars/events")
def get_calendar_events(team: Optional[str] = None, session: Session = Depends(get_session)):
    all_events: list[dict] = []
    for cal in session.exec(select(TeamCalendar)).all():
        # cal.team peut être vide (toutes équipes) ou CSV "Fuego,Caméléon"
        if team and cal.team:
            cal_teams = [t.strip() for t in cal.team.split(',') if t.strip()]
            if cal_teams and team not in cal_teams:
                continue
        if not cal.events_json:
            continue
        try:
            for ev in json.loads(cal.events_json):
                ev["calendarId"]   = cal.id
                ev["calendarName"] = cal.name
                ev["team"]         = cal.team
                all_events.append(ev)
        except Exception:
            pass
    all_events.sort(key=lambda e: e.get("start", ""))
    return all_events


# ══════════════════════════════════════════════════════════════════════════════
# Config
# ══════════════════════════════════════════════════════════════════════════════
@app.get("/api/config")
def get_config():
    return {
        "jiraConfigured": bool(JIRA_URL and JIRA_USER and JIRA_TOKEN),
        "project": JIRA_PROJECT,
        "jiraUrl": JIRA_URL if JIRA_URL else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# JIRA Proxy (optional plugin)
# ══════════════════════════════════════════════════════════════════════════════
@app.api_route("/jira/{path:path}", methods=["GET", "POST", "PUT"])
async def jira_proxy(path: str, request: Request):
    if not all([JIRA_URL, JIRA_USER, JIRA_TOKEN]):
        raise HTTPException(503, "JIRA non configure")
    allowed = ("rest/api/", "rest/agile/", "rest/greenhopper/")
    if not path.startswith(allowed) or ".." in path:
        raise HTTPException(403, "Chemin interdit")

    url = f"{JIRA_URL}/{path}"
    params = dict(request.query_params)
    auth = (JIRA_USER, JIRA_TOKEN)
    headers = {"Accept": "application/json"}
    body = await request.body() if request.method != "GET" else None
    if body:
        headers["Content-Type"] = "application/json"

    try:
        resp = await _client.request(
            request.method, url, params=params, auth=auth, headers=headers, content=body
        )
    except httpx.RequestError as e:
        raise HTTPException(502, f"Connexion JIRA: {e}")

    # 204 No Content / corps vide = réponse OK sans payload (cas PUT sprint update)
    if not resp.content:
        return JSONResponse(content=None, status_code=resp.status_code)
    try:
        data = resp.json()
    except Exception:
        # JIRA peut renvoyer du texte d'erreur HTML/plain — propage le code + message brut
        if resp.is_success:
            return JSONResponse(content=None, status_code=resp.status_code)
        raise HTTPException(resp.status_code, resp.text[:300] or "Reponse JIRA invalide")

    return JSONResponse(content=data, status_code=resp.status_code)


# ── Static Files ──────────────────────────────────────────────────────────────
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
