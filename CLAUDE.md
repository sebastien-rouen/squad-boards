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
  (`dom`, `wiki`, `modals`, `support`, `pi-config`, `sprint-scope`, `capacity-base`) et `utils.js` les ré-exporte — importer
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
  (`extractSprintLabel`). La teinte de la ligne de total suit le **Mood** seul. La colonne
  ✊ de la **matrice** moyenne le PI entier et reste cliquable même sans vote (`has-val` suit
  l'existence de sprints, pas de votes) — le handler de clic vise
  `.health-metric-cell.has-val, .health-fist-cell.has-val`.
- **Engagement non tenu** (3.141.13) : un ticket non-`done` n'est marqué (`--missed`, +
  `--missed-final` barré si le sprint est `closed`) que sur les métriques d'engagement
  `planned`/`bufplanned` — jamais sur `velocity`/`buffer`, où un non-done n'a pas de sens.
- **Périmètre d'un sprint ≠ `sprintName`** (3.141.14/15) — footgun majeur, source unique
  [utils/sprint-scope.js](static/js/utils/sprint-scope.js) (ré-exporté par `utils.js`) :
  JIRA **déplace** les tickets non finis à la clôture, donc un sprint passé ne « contient »
  plus que ses réussites (54 % du périmètre engagé manquant sur le PI 30). Le périmètre réel
  vient de `belongedToSprint()` (union des `to` des changements de champ `Sprint` dans
  `recentChanges`, mémoïsée par WeakMap).
  **RÈGLE À NE JAMAIS INVERSER** : l'**engagement** (`all`, `planTk`, `planPts`, `bufPlan*`,
  cartes du Dashboard, `_ticketsOfSprint`) utilise `belongedToSprint()` ; le **réalisé**
  (`done`, `bufDone`, vélocité, `_sprintStats`) exige `isInSprint()` **en plus** du statut
  `done` — sinon un sprint est crédité de travail fini après sa clôture.
  3ᵉ argument `spk` : `null` = nom exact, **obligatoire** dès que les tickets comparés
  peuvent venir de plusieurs équipes (la clé `NN.N` ne distingue pas les équipes entre elles).
  Partir de `allTickets`, jamais de `piTickets` : un reporté porte le sprint d'arrivée,
  souvent d'un autre PI. `carriedOverTo()` donne la destination (chip `↪ 30.2`).
  ⚠️ **`t.allSprints` n'est produit NULLE PART** (ni base, ni sync) : tout
  `Array.isArray(t.allSprints) && …` est mort. Restent tels quels dans `infopanel.js`,
  `retro.js`, `dashboard.js` (`_scopeTickets`) et `stage_flow_card.js` — ils visent le sprint
  actif, sans report possible.
- **Base capacité PI à venir** (3.141.16) : [utils/capacity-base.js](static/js/utils/capacity-base.js)
  — `vélocité moyenne/sprint des 2 derniers PI × nb sprints × (1 − taux d'absence)`. Calculée
  **une seule fois** dans `metaObj` (`capBase` + `capBySprint`), relue par la matrice ET la
  modale : deux calculs divergeraient. La base du PI est la **somme des bases par sprint**,
  jamais un ratio global — sinon le total contredit son propre détail. Colonne visible
  uniquement si `targetPiNum > currentPiNum`. Dans « Charge prévue » : saisie > `estimated > 0`
  > base suggérée (jamais persistée, classe `--suggested`).
  ⚠️ Si la fenêtre dépasse `lastKnownAbsenceDate(absences)`, le ratio est un plancher et la
  base un plafond → `capped` (cellule orange + ⚠). Ne jamais présenter le chiffre sans cette
  réserve.
  ⚠️ **L'effectif se compte en ETP, jamais en têtes** : `teamEtp()` pondère par
  `piInfo.roleCapacity` (Paramètres → « Capacité dev — % de travail par rôle »,
  `/#settings/cap-roles` — Dev 100 %, Tech Lead 70 %, PO/SM 0 %). Les **absences sont
  pondérées de la même façon** : les congés d'un rôle à 0 % ne retirent rien à la capacité.
  `roleCapacityPct()` est la source unique de cette règle — `_capRolePct` (pi.js) y pointe.
  Rôle inconnu → 100 % **et signalé** dans l'infobulle, jamais écarté en silence.
  ⚠️ **L'effectif vient du ROSTER du PI** (`effectiveRosterForPi` → `piInfo.piMembers[<PI>]`),
  jamais des absences seules : les congés d'une personne **sortie de l'équipe** y restent et
  la feraient peser sur un PI où elle n'est plus. Les absences hors roster sont ignorées
  (`pctOf` → 0). Apparier les équipes avec `teamNameMatches` (le snapshot porte « Team X »).
  ⚠️ **Le sprint de RESPIRATION (🍃, dernier du PI) ne compte nulle part** : ni dans la
  moyenne de vélocité des PI passés, ni dans le décompte des sprints du PI visé, ni comme
  charge suggérée. `breathIdxOf()` = `max(sprintsPerPI, plus grand index observé)` — ce `max`
  évite de promouvoir le dernier sprint CONNU d'un PI encore incomplet.
  `breathIdxByPi()` est la source unique, y compris pour `_capAvgVelocity` (page Capacité de
  pi.js) — l'ancien `_isIpSprint` (« si ≥ 6 sprints », comparé au `sprintsPerPI` configuré)
  ne détectait jamais rien avec 5 sprints/PI, et excluait le 5ᵉ d'un PI qui en compte 6.
- **Temps par colonne — périmètre vs durée** (3.143.1) : la card mesure des DURÉES, donc son
  périmètre est `belongedToPi()` / `belongedToSprint()` (reports compris) — **jamais** le
  `sprintName` courant, qui perd les tickets déplacés à la clôture, soit 43 % du PI29 et
  justement les plus longs. Ce périmètre vit dans une variable à part (`_flowScopeTickets`,
  `flowTickets`) : la règle engagement/réalisé ci-dessus reste intacte pour les compteurs.
  `stageFlowCardHtml(tickets, opts)` et `bindStageFlowCard(container, tickets, opts)` prennent
  le **même** `opts` (le re-rendu après exclusion repasse par là).
  ⚠️ `STAGE_FLOW_GROUPS` teste le **libellé JIRA brut** (minuscules, cf sync.js) : un statut non
  matchré disparaît en silence (« a livrer en qual » sans le « if » = 156 tickets perdus).
  Vérifier contre les libellés réellement en base avant de toucher aux regex.
  ⚠️ Les durées ne sont **pas bornées au PI** : `stageDurations` cumule toute la vie du ticket,
  donc un ticket multi-PI compte sa durée entière dans chacun. Limite assumée, écrite dans l'aide.
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
  - **Mode « Congés seuls »** (3.141.22) : classe `rot-hide-support` sur `#rot-panels`
    (clé `rot-hide-support`), **purement CSS** — rien n'est écrit en base, et la grille passe
    `pointer-events:none` (un clic sur une case dont l'état n'est plus visible affecterait un
    membre à l'aveugle). Les variantes `.rot-day.on.rot-day-abs-*` portent un `!important` :
    toute surcharge doit être explicite, sinon un jour support+congé ne rend pas comme un
    congé seul. `_rotToolbarHtml`/`_rotWireToolbar` vivent hors de `#rot-panels` → **câblés
    une seule fois** par `wireSettings`, jamais par `_rotRenderPanels`.
  - **Cibler une équipe depuis Support** (3.141.22) : `#settings/rotation/<équipe>` →
    `store.settingsTeam` (jamais `store.team` : le filtre du topbar ne doit pas basculer).
    Le segment doit survivre aux alias de section, à `pushHash` ET à `_settingsApplyTabs`.
    Déplier un panneau exige un **`_rotRenderPanels`** : `_rotSetCollapsed` seul n'agit qu'à
    la visite suivante et le `scrollIntoView` vise alors un panneau fermé. Ciblage à usage
    unique (libéré après le scroll).
  - **Générer une rotation = réécriture** : toujours derrière `confirmDanger` — jamais de
    tirage sur simple clic. Le bouton « PI suivant » de la page Support ne s'affiche que si
    `_base.nextPiNum !== displayPiNum` (sinon doublon dès que le PI+1 est épinglé).
- **Scroller dans Paramètres** (3.141.22) : `.settings-tabs` est sticky en haut du scrollport
  et masquerait toute cible de `scrollIntoView`. Le décalage est porté **une seule fois** par
  `scroll-padding-top` sur `.content:has(.settings-tabs)` ([settings.css](static/css/views/settings.css)) —
  ⚠️ ne JAMAIS y ajouter un `scroll-margin-top` sur une cible, les deux s'additionnent.
  `--stg-tabs-h` est mesurée (`_publishTabsHeight` + `ResizeObserver`, la nav wrappe selon la
  largeur) et posée sur `container`, qui **est** `#content` (`renderer(content)` dans app.js) :
  sur un descendant, le scrollport n'en hériterait pas.
- **Navigation** : `NAV_ITEMS` ([config.js](static/js/config.js)) = source unique (sidebar, Ctrl+K, titres).
  Sections : `main` (Pilotage, raccourcis 1-8), `team` (repliable), `footer` (Paramètres, raccourci `,`).
- **Blocs de la palette Ctrl+K** (3.142.0) : catalogue unique
  [cmd_sections.js](static/js/components/cmd_sections.js) — un bloc s'ancre sur son **libellé
  visible** (`anchor`), pas sur un id : renommer un titre de card casse le lien, le corriger se
  fait **là et nulle part ailleurs**. Mots-clés **sans accents** obligatoires (`_score()` compare
  des chaînes brutes : « velocite » ne matche pas « Vélocité »). Vues à onglets : `tab` → hash
  **avec l'équipe courante**, routé par `applyHash`, puis `rerenderView()` à la main (changer
  `piTab` seul ne notifie personne).
- **Clés localStorage piégeuses** : `sb-boardMode` = Scrum/Kanban (store) ≠ `sb-board-mode` = layout
  interne du board (columns|swimlanes|list). `sb-piOffset` = PI épinglé (persistant, plus de reset au
  changement de vue).
- **Modales** : toujours `role="dialog" aria-modal="true"` + `trapFocus(el)` de [utils.js](static/js/utils.js)
  (retourne un release à appeler à la fermeture). Confirmations : `confirmDanger()` — jamais `confirm()` natif.
- **Erreurs du proxy JIRA** (3.141.19/20) : `request()` (api.js) porte `e.status` ; formater
  avec `api.jiraErrorMessage(e, quoi)` — un 401/403 est une panne d'AUTHENTIFICATION, jamais
  une absence de données (un `catch` muet le racontait en « Aucun board scrum pour … »).
  ⚠️ Dans `sync.js`, **ne jamais avaler un échec** : `incidents.add('<opération>', e)`
  (`makeIncidents`) le collecte sans interrompre l'import. Sans ça, un jeton expiré rend un
  import « réussi » mais creux. Seule exception admise : un 404 sur le rapport de vélocité
  (board sans estimation = cas nominal). Restitution (3.141.21) : toast `warning` dans
  `app.js` **et** carte de sync qui reste ouverte sur le détail (`store.syncIncidents` →
  `topbar.js`), fermée par `dismissSyncReport()` — jamais automatiquement.
- **Convention JIRA sprint** (mémoire `project_jira_sprint_conventions`) : `Cadrage_PIXX` = cadrage, `PI#XX` = features, `PIXX` = tickets standalone.
- **Profondeur d'historique JIRA** (3.143.0) : deux réglages DISTINCTS, source unique
  `SYNC_DEFAULTS` + `syncSetting()` dans [config.js](static/js/config.js) — jamais un défaut
  recopié ailleurs. `closedKeep` (60) porte les **métadonnées** de sprint : 1 appel par board,
  et la passe pagine de toute façon tout le board avant de trancher, donc **l'élargir ne coûte
  aucun appel**. `closedTicketSprints` (26 ≈ 1 an) porte le **détail des tickets** : 1 appel par sprint
  ET par board, changelog compris — c'est lui qui fait la durée d'un import et le poids de la
  base ; `0` le désactive et est une saisie légitime (d'où le paramètre `min` de `_saveCap`).
  ⚠️ Cette profondeur n'est soutenable QUE grâce à `archiveClosed` : sans lui, le mode
  `replace` la fait repayer intégralement à chaque sync complète.
  ⚠️ `app.js` garde sa lecture propre de `quickDays` : il charge `sync.js` en import
  **dynamique**, y importer la constante depuis la vue casserait ce lazy.
- **Dates JIRA à l'import** (3.143.0) : `_jira_dates()` / `_iso_utc()` dans
  [data.py](app/routers/data.py) posent `created_at`/`updated_at` sur Ticket, Feature et Epic.
  Avant, aucune n'était transmise et `default_factory=_now` datait TOUT l'import de la même
  seconde — ce qui faisait se déclencher l'anomalie « ajouté en cours de sprint »
  ([business_rules.js](static/js/business_rules.js), `infopanel.js`, `sprint_tickets_modal.js`)
  sur tout ticket non terminé. ⚠️ **Toute passe JQL qui produit un ticket DOIT demander le
  champ `created`** : sans lui la date repart à l'heure de la sync. Et les dates s'écrivent
  normalisées en ISO UTC — `roadmap.js` trie `createdAt` par comparaison de CHAÎNES, deux
  formats mêlés y donnent un ordre faux sans la moindre erreur.
- **Mode archive des sprints clos** (3.144.0, `_buildClosedArchive` dans
  [sync.js](static/js/sync.js), réglage `sb-sync-archiveClosed`, actif par défaut) : une sync
  complète ne redemande pas à JIRA les sprints **clos déjà en base** — leur contenu est figé —
  et réinjecte leurs tickets dans le payload. Sans ça, le mode `replace` faisait repayer toute
  la fenêtre à chaque sync (442 appels à 26 sprints/board ; ~17 avec l'archive).
  ⚠️ Repose sur l'aller-retour EXACT `_ticket_dict` ([serializers.py](app/serializers.py)) ↔
  contrat d'`import_all` ([data.py](app/routers/data.py)) : toute clé ajoutée d'un côté doit
  l'être de l'autre, sinon l'archivage l'efface silencieusement. `seenTicketIds` fait foi à la
  réinjection (un reporté rapatrié frais garde sa version à jour), les équipes retirées sont
  écartées, features et epics jamais archivés (passes JQL dédiées).
  ⚠️ Une correction faite dans JIRA sur un sprint déjà clos ne redescend plus — c'est le prix,
  et la raison du réglage. `overwrite: true` (« Tout réimporter depuis JIRA ») le contourne.
  ⚠️ `app.js` relit la clé localStorage à la main : y importer `syncSetting` ferait de
  `handleJiraImport` un point d'entrée STATIQUE vers `sync.js`, chargé en dynamique.
- **Mémoire des sprints clos vides** (3.145.0, `sb-sync-emptyClosed`) : complément
  indispensable de l'archive, qui ne peut retenir qu'un sprint ayant laissé des tickets. Un
  sprint clos vide se faisait réinterroger à chaque sync — 33 % des appels restants.
  ⚠️ **N'inscrire QUE sur un appel réussi renvoyant zéro issue** (compteur `recus` dans le
  `try`, jamais dans le `catch`) : un 401 ou un timeout rend aussi « aucun ticket », et le
  confondre avec un sprint vide graverait la panne — le sprint ne serait plus jamais redemandé.
  Purgée par « Tout réimporter depuis JIRA » (`clearEmptyClosedMemory`).
- **Bandeau de couverture** (3.143.0, [health-coverage.js](static/js/views/health-coverage.js)) :
  il compte la **présence actuelle** (`sprintName`), PAS le périmètre engagé — inversion
  assumée de la règle de [sprint-scope.js](static/js/utils/sprint-scope.js). La question posée
  est « ce sprint a-t-il été rapatrié ? », et l'import interroge `/sprint/{id}/issue`, qui ne
  rend que les tickets s'y trouvant : `sprintNamesOf()` créditait des sprints que rien n'avait
  importés (101 annoncés contre 60 réels, 19 contre 6 sur Initiale). Ne pas « corriger » ce
  choix vers `belongedToSprint()`.

## Tests (`npm test`)

Suites `node:test` dans [tests/](tests/) — 161 tests, aucune dépendance, ~1 s. Détail :
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
