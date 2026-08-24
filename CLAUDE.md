# Squad Board — Contexte développeur

Board de projet **autoporteur** (fonctionne sans JIRA). Stack :
- **Backend** : FastAPI + SQLModel/SQLite — package `app/` (routeurs par domaine), `main.py` = composition seule.
- **Frontend** : Vanilla JS (ES modules), CSS custom properties, Chart.js. **Pas de build, pas de framework.**
- **Stockage** : `data/board.db` (SQLite). JIRA = plugin d'import optionnel (`sync.js` + proxy `/jira/*`).

## Lancer
```bash
pip install -r requirements.txt
python main.py          # http://localhost:3001  — Swagger /docs
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
- **Lazy loading des vues** (3.139.0) : les vues sont chargées via `VIEW_LOADERS` ([app.js](static/js/app.js)) —
  **ne jamais importer statiquement un module de `views/` depuis un composant** (ça casse le lazy) ;
  utiliser `import()` dynamique au point d'usage. Les rappels de cérémonies vivent dans
  [reminders.js](static/js/reminders.js) (PAS dans settings.js).
- **utils.js est un barrel** (3.141.5) : les briques vivent dans `static/js/utils/`
  (`dom`, `wiki`, `modals`, `support`, `pi-config`) et `utils.js` les ré-exporte — importer
  **toujours** depuis `../utils.js`, jamais depuis un sous-module, sauf `utils/pi-config.js`
  (accès à `pi-cfg-<N>`) qui s'importe directement.
- **Config PI `pi-cfg-<N>`** : `savePiCfg()` FUSIONNE (ne jamais faire `setItem` à la main).
  La saisie « Sprint & PI » pose `manual.<champ>` et prime ; l'import Congés n'écrit que
  `startDateFromCsv` / `sprintsPerPIFromCsv` et ne remplit les clés effectives que si elles
  sont vides.
- **settings.js éclaté** (3.141.8) : `settings-rotation.js` (grille/shuffle),
  `settings-io.js` (import/export de données), `settings-absences-csv.js` (parser du CSV
  Congés, sans aucune dépendance donc testable) et `settings-jira.js` (section Plugin JIRA :
  `jiraSectionHtml()` + `wireJiraSection()`). `settings.js` ne garde que le rendu et le
  câblage de la vue. `_openImportModal` reçoit son rafraîchissement par injection — importer
  `reloadAndRender` y créerait un cycle.
- **Votes d'équipe Health** (3.141.12) : les colonnes 🎭 Mood et ✊ Confiance du tableau
  « Sprints du PI » sont rendues par [health-votes.js](static/js/views/health-votes.js)
  (`VOTE_KINDS` = échelle + libellés + clé de store). Même mécanique 1→5 pour les deux,
  même table backend `mood` distinguée par `type` (`mood` | `fist`) — n'écrire un calcul
  de moyenne/distribution QUE là. Les votes s'apparient sur `piSprint` = clé `NN.N`
  (`extractSprintLabel`). La teinte de la ligne de total suit le **Mood** seul.
- **Écart PI ↔ Congés** : `piCongesDiff()` (utils/pi-weeks.js) est la source unique du bandeau
  de recalage (Rotation) ET du récapitulatif multi-PI (Sprint & PI).
- **Semaines d'un PI** (3.141.6) : source unique `utils/pi-weeks.js` (`buildPiWeeks`) —
  consommée par « Paramètres → Rotation » ET la page Support. Ne JAMAIS recalculer des
  semaines ailleurs. `weekStart` est la clé d'appariement des rotations en base : le changer
  les rend invisibles, d'où le recalage explicite par bouton (`manual.startDate`). Agenda et
  info-panel apparient par recouvrement de dates et n'ont pas besoin de ce module.
- **Rotation Support** (3.141.4) : grille, shuffle et calcul des semaines d'un PI vivent dans
  [settings-rotation.js](static/js/views/settings-rotation.js) — **PAS dans settings.js**.
  Le nombre d'itérations d'un PI suit `pi-cfg-<N>` (Sprint & PI) > indices JIRA **de ce PI**
  > repli ; ne JAMAIS retomber sur le compte du PI courant. L'en-tête de colonne affiche le
  premier jour **ouvré** ; `weekStart` reste la clé d'appariement en base.
- **Navigation** : `NAV_ITEMS` ([config.js](static/js/config.js)) = source unique (sidebar, Ctrl+K, titres).
  Sections : `main` (Pilotage, raccourcis 1-8), `team` (repliable), `footer` (Paramètres, raccourci `,`).
- **Clés localStorage piégeuses** : `sb-boardMode` = Scrum/Kanban (store) ≠ `sb-board-mode` = layout
  interne du board (columns|swimlanes|list). `sb-piOffset` = PI épinglé (persistant, plus de reset au
  changement de vue).
- **Modales** : toujours `role="dialog" aria-modal="true"` + `trapFocus(el)` de [utils.js](static/js/utils.js)
  (retourne un release à appeler à la fermeture). Confirmations : `confirmDanger()` — jamais `confirm()` natif.
- **Convention JIRA sprint** (mémoire `project_jira_sprint_conventions`) : `Cadrage_PIXX` = cadrage, `PI#XX` = features, `PIXX` = tickets standalone.

## Tests (`npm test`)

Suites `node:test` dans [tests/](tests/) — 68 tests, aucune dépendance, ~1 s. Détail :
[tests/README.md](tests/README.md).
- `node --test tests/` **échoue** sur Node 22 → toujours un motif : `node --test "tests/*.test.mjs"`.
- Importer `tests/helpers/env.mjs` AVANT tout module applicatif (`state.js` lit `localStorage`
  au chargement) — d'où les `await import()` dans un `before()`.
- Le faux DOM doit **échapper réellement** : `esc()` passe par `createElement` + `textContent`,
  un stub naïf lui fait renvoyer `''` et vide silencieusement les rendus testés.
- Fixtures **synthétiques** (aucun nom réel) mais calquées sur les pièges de prod — ne pas les
  « simplifier », chaque particularité correspond à une régression passée.

## Documentation détaillée (lire à la demande)
- **[docs/regles-metier.md](docs/regles-metier.md)** — tables SQLite, conventions, PI/matching, filtrage équipe, import CSV absences, modes & rotation support, team mapping, exclusions tickets, raccourcis clavier, liste des vues.
- **[docs/plugin-jira.md](docs/plugin-jira.md)** — 5 passes de sync, pagination, champs custom, normalisation équipes, héritage features, settings localStorage, pages de debug `/tests/`.
- **[docs/architecture.md](docs/architecture.md)** — arborescence back/front, relations, filtre groupe.
- **[docs/api.md](docs/api.md)** — endpoints REST.

## Agent de debug local
`squad-board-debugger` ([.claude/agents/squad-board-debugger.md](.claude/agents/squad-board-debugger.md)) connaît les pièges récurrents
(mapping snake/camel, filtres dupliqués health/alert_modal, sources de vérité absences vs members, lazy-fetch JIRA) et fournit
des recettes `curl + node`. **À invoquer dès qu'un compteur, une liste ou une autocomplete semble incohérent.**
