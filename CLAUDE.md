# Squad Board — Contexte développeur

Board de projet **autoporteur** (fonctionne sans JIRA). Stack :
- **Backend** : FastAPI + SQLModel/SQLite — package `app/` (routeurs par domaine), `main.py` = composition seule.
- **Frontend** : Vanilla JS (ES modules), CSS custom properties, Chart.js. **Pas de build, pas de framework.**
- **Stockage** : `data/board.db` (SQLite). JIRA = plugin d'import optionnel (`sync.js` + proxy `/jira/*`).

## Lancer
```bash
pip install -r requirements.txt
python main.py          # http://localhost:3000  — Swagger /docs
```

## Architecture backend (`app/`)
`main.py` ne fait que composer : bootstrap DB (`create_all` + `run_migrations` + `seed`), lifespan du client HTTP,
`include_router`. Modules : `common`, `config`, `db`, `migrations`, `seed`, `http_client`, `serializers`, `crud`
(factory), `models/`, `services/ics.py`, `routers/` (1 module par domaine).
- **Factory CRUD** (`crud.py` → `make_crud_router`) génère list/get/update/delete ; `create` et la logique
  spécifique (filtres, `field_map`, bulk, upsert) restent écrits à la main dans le routeur.
- **`serializers.py` = SOURCE UNIQUE du contrat camelCase** consommé par le front. Garde-fou de non-régression :
  `GET /api/export` & `/api/all` (golden test — sortie doit rester stable).
- Détail : [docs/architecture.md](docs/architecture.md).

## Conventions critiques (footguns — à respecter systématiquement)
- **XSS** : toujours `esc()` avant `innerHTML`.
- **Mapping snake/camel** : back en `snake_case`, contrat front en `camelCase` (via `serializers.py`).
- **PI courant** : UNIQUEMENT `getCurrentPi({sprintInfo, piInfo})` ([utils.js](static/js/utils.js)) — ne jamais réimplémenter la regex (bugs historiques).
- **Filtrage équipe** : tickets **ET features** via `filterByTeam(items, team)`. Un compteur "Features (N)" compte la liste **filtrée**.
- **Membres d'une équipe** : source de vérité = table `absence` (CSV RH) via `deriveMembersFromAbsences()`. `store.get('members')` brut = autocomplete/recherche seulement (artefacts JIRA possibles).
- **Anomalies Health** : règle dupliquée dans [health.js](static/js/views/health.js) (`ANOMALIES[].match`) ET [alert_modal.js](static/js/components/alert_modal.js) (`_ACTIONABLES[].filter`) — **modifier les 2**.
- **Statut `done`** exclu par défaut des anomalies actives ; lire le responsable via `t.leader || t.assignee` (legacy).
- **Modèles** : `__table_args__ = {"extend_existing": True}` (hot reload).
- **Convention JIRA sprint** (mémoire `project_jira_sprint_conventions`) : `Cadrage_PIXX` = cadrage, `PI#XX` = features, `PIXX` = tickets standalone.

## Documentation détaillée (lire à la demande)
- **[docs/regles-metier.md](docs/regles-metier.md)** — tables SQLite, conventions, PI/matching, filtrage équipe, import CSV absences, modes & rotation support, team mapping, exclusions tickets, raccourcis clavier, liste des vues.
- **[docs/plugin-jira.md](docs/plugin-jira.md)** — 5 passes de sync, pagination, champs custom, normalisation équipes, héritage features, settings localStorage, pages de debug `/tests/`.
- **[docs/architecture.md](docs/architecture.md)** — arborescence back/front, relations, filtre groupe.
- **[docs/api.md](docs/api.md)** — endpoints REST.

## Agent de debug local
`squad-board-debugger` ([.claude/agents/squad-board-debugger.md](.claude/agents/squad-board-debugger.md)) connaît les pièges récurrents
(mapping snake/camel, filtres dupliqués health/alert_modal, sources de vérité absences vs members, lazy-fetch JIRA) et fournit
des recettes `curl + node`. **À invoquer dès qu'un compteur, une liste ou une autocomplete semble incohérent.**
