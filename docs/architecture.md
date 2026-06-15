# Architecture technique

## Vue d'ensemble

Squad Board est un board de projet **autoporteur** avec SQLite, API CRUD completes, et JIRA en option.

```
Navigateur (SPA)          FastAPI (port 3000)          SQLite
┌─────────────────┐       ┌───────────────────┐       ┌──────────┐
│  ES Modules     │──────>│  CRUD REST API     │──────>│ board.db │
│  Store reactif  │       │  /api/tickets      │       │ 10 tables│
│  Chart.js       │       │  /api/groups       │       └──────────┘
└─────────────────┘       │  /api/absences     │
                          │  /api/support      │       ┌──────────┐
                          │  /jira/* (opt.)    │──────>│ JIRA     │
                          └───────────────────┘       └──────────┘
```

## Base de donnees

SQLite via SQLModel (ORM du createur de FastAPI). Fichier unique `data/board.db`.

### Tables

| Table | Champs cles |
|-------|-------------|
| `ticket` | id, title, type, status, team, **leader**, **contributors[]**, points, priority, epic_id, labels[], comments[], recent_changes[] |
| `feature` | id, title, status, team, leader, priority, pi_sprint |
| `epic` | id, title, status, team, feature_id, pi_sprint |
| `member` | id, name, team, role |
| `team` | id, name, color |
| `teamgroup` | id, name, color, **teams[]** (liste de noms d'equipes) |
| `absence` | id, member_name, team, start_date, end_date, type, days |
| `supportrotation` | id, team, week_label, week_start, week_end, **members[]** |
| `sprintconfig` | name, start_date, end_date, goal |
| `piconfig` | number, name, objectives[] |

Les champs `[]` sont stockes en JSON dans SQLite.

### Relations

```
TeamGroup (ligne produit)
  └── teams[] → Team.name (N:M par noms)

Feature
  └── Epic (via epic.feature_id)
       └── Ticket (via ticket.epic_id)

Ticket
  ├── leader → Member.name
  ├── contributors[] → Member.name[]
  └── comments[] (embedded JSON)

Absence → member_name + team
SupportRotation → team + members[]
```

## Filtre par groupe

Le selecteur topbar permet de choisir une equipe ou un groupe :
- `all` → tous les tickets
- `group:<id>` → filtre sur les equipes du groupe
- `<team>` → filtre sur une equipe

Le filtre est applique dans `utils.js:filterByTeam()` qui lit `store.group` et resout les equipes du groupe.

## Backend

### Modules (`app/`)

`main.py` ne contient que la composition (bootstrap DB, lifespan, `include_router`, static).
Toute la logique est dans le package `app/`. Lancement : `python main.py`.

```
main.py              Composition : create_all + migrations + seed, lifespan, routers, static
app/
├── common.py        _gen_id, _now, _normalize_team, _TA
├── config.py        env JIRA_*, chemins (DATA_DIR, STATIC_DIR, DB_PATH)
├── db.py            engine SQLite, get_session
├── migrations.py    run_migrations(engine) (ALTER TABLE / CREATE INDEX idempotents)
├── seed.py          seed_atlas_catalog(engine)
├── http_client.py   client httpx partagé (calendriers ICS + proxy JIRA)
├── serializers.py   _xxx_dict — SOURCE UNIQUE du contrat camelCase
├── crud.py          make_crud_router() : list/get/update/delete génériques
├── models/          core, planning, people, agile, atlas, calendar (19 modèles SQLModel)
├── services/
│   └── ics.py       parser ICS/RRULE (DST-safe) + expand_calendar_events
└── routers/         1 module par domaine (CRUD via factory + logique propre)
    ├── teams, groups, epics, members, absences, support
    ├── agile        events / retro / risks / mood
    ├── tickets, features, planning (sprint + pi), atlas
    └── calendars, jira (proxy), data (export / all / import / config)
```

Garde-fou de refactor : `GET /api/export` et `GET /api/all` servent de test de
non-régression (golden) — leur sortie doit rester stable.

## Frontend

### Modules

```
app.js           Bootstrap, loadAllData, renderView
├── state.js     Store reactif (teams, groups, absences, support, ...)
├── api.js       Client CRUD (30+ fonctions)
├── sync.js      Plugin import JIRA
├── demo.js      Seed donnees demo
├── config.js    Constantes
├── utils.js     Helpers + filterByTeam (group-aware)
├── components/
│   ├── sidebar.js   Navigation
│   ├── topbar.js    Filtre equipe/groupe + recherche + Nouveau
│   ├── card.js      Carte ticket (leader + contributors avatars)
│   ├── modal.js     Detail + formulaires CRUD + commentaires
│   └── charts.js    Chart.js wrappers
└── views/
    ├── dashboard.js
    ├── sprint.js
    ├── kanban.js
    ├── pi.js
    ├── reports.js
    └── settings.js  (groupes, equipes, membres, absences, support, sprint, data)
```

## Import CSV des absences

Format attendu (separateur `;` ou tabulation) :

```
Nom;Equipe;Debut;Fin;Type;Jours
Alice Martin;Alpha;2026-04-14;2026-04-18;conge;5
```

L'import appelle `POST /api/absences/bulk` avec `replace: false` (ajout) ou `true` (remplacement).
