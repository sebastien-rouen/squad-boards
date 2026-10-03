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
- **`base.css` n'est plus qu'un agrégateur** (3.178.0) : le CSS de base vit dans 6 feuilles consécutives
  `css/base-{shell,components,overlays,utilities,palette,misc}.css`, liées DANS CET ORDRE par `index.html`.
  Ajouter une règle dans le morceau de sa section (en-tête de chaque fichier) ; ne rien écrire dans
  `base.css`, ne pas réordonner les liens (cascade).
- **Synchro JIRA** : `sync.js` (orchestration, `_doImport`) + `sync-parse.js` (ticket, ADF, sprint / PI /
  équipe, pagination) + `sync-report.js` (échecs partiels, équipes retirées, progression). Les tickets du
  sprint actif arrivent en WIKI MARKUP (API Agile) → `utils/wiki.js`, pas `parseADF`.
- **Mapping snake/camel** : back en `snake_case`, contrat front en `camelCase` (via `serializers.py`).
- **PI courant** : UNIQUEMENT `getCurrentPi({sprintInfo, piInfo})` ([utils.js](static/js/utils.js)) — ne jamais réimplémenter la regex (bugs historiques).
- **Rotation support EN VIGUEUR** (3.164.0) : UNIQUEMENT `currentSupportRows(support, jour)`
  ([utils/support.js](static/js/utils/support.js)) — jamais `weekStart <= jour <= weekEnd`, qui
  ramasse les lignes d'un ancien mode de semaine restées en base et les doublons (même équipe +
  même `weekStart`). Référence = la grille Paramètres → Rotation (mode actuel, premier `find`).
  Par JOUR (jours cochés compris) : `supportMembersOnDay` ; sur une période (sprint, PI) :
  `gridSupportRows`. Toutes les vues sont migrées (3.164.1).
- **Mode de semaine de support EN BASE** (3.165.0) : `piconfig.support_week_modes`
  (`piInfo.supportWeekModes`), PAS sur `team` — une synchro complète supprime et recrée les
  équipes. Lecture : `getSupportWeekMode()` (base > localStorage `rot-mode-*` > défaut).
  Écriture : UNIQUEMENT `saveSupportWeekMode()` ([support-week-mode.js](static/js/support-week-mode.js),
  `PUT /api/pi/support-week-mode`, fusion équipe par équipe) — jamais `localStorage.setItem`.
- **Absences et rotation** (3.165.2/3) : jours d'absence d'une semaine = UNIQUEMENT
  `supportAbsenceDays` (somme des jours OUVRÉS de la semaine, jamais la durée totale `a.days` d'un
  congé qui la chevauche) ; seuil « absent » = UNIQUEMENT `isSupportAbsent` (≥ 3 j, règle métier
  n°1 — la grille utilisait 2,5). Semaines d'une équipe = `buildPiWeeks` AVEC son mode, jamais
  les semaines du mode par défaut réutilisées pour toutes les équipes.
- **Évènements d'agenda (ICS)** (3.167.0) : nature et portée UNIQUEMENT via `utils/cal-classify.js`
  — ⚠️ une nature AJOUTÉE (3.199.0 : 19) se déclare à 5 endroits : `CAL_NATURES` + `RULES`, `NATURES`
  du serveur (calendar_rules.py, sinon 400), palette `--n-*` clair ET sombre + `[data-k]` + `data-hl`
  (team-calendar.css), `RANK` (team_calendar_views.js), et le miroir `static/mockups/team-calendar/`.
  La TV « La semaine » lit l'agenda par `eventsFor` (même source que la carte). Pour le reste :
  (`calNatureWithRules` = règle positionnée > détecteur ; `calScope` depuis le champ CSV
  `team_calendar.team`) — le bandeau calendrier et la carte « Agenda de l'équipe » partagent ce
  détecteur, n'en écrire aucun autre. Règles à la main : table `calendar_rule`, clé `calNorm(titre)`
  calculée CÔTÉ FRONT (une 2ᵉ normalisation divergerait). RÈGLES ORDONNÉES : relire les commentaires
  avant d'en déplacer une (PI Planning avant planning, démo avant rétro, « Review des découpages »).
  Carte : `components/team_calendar.js` (+ `_views.js`) ; `--tc-hour` du CSS et `HOUR_PX` du JS
  doivent rester égaux. Toute retouche visuelle se reporte dans `static/mockups/team-calendar/` (miroir).
- **Faits marquants (frise A → B, page Équipe)** (3.169.0) : `components/team_timeline_model.js`
  (données du store, AUCUNE saisie par défaut), `_lanes.js` (couloirs + mini-carte), `team_timeline.js`
  (coquille). Incident de prod = bug/support avec « prod » / « production » / « incident » en MOT
  ENTIER, ou label `incident-prod` — PAS le label `désynchro` (campagnes de comparaison GDD/SPD).
  Présence : vert 0 % d'absence, orange ≤ 25 %, rouge > 25 % (= seuil des périodes creuses).
  1v1 = agendas de l'équipe via `eventsFor` (portée `team`). Faits saisis = table `event`, `teams`
  vide = tout le train, `author` = nom saisi (pas de compte ; nom du poker `sb-poker-myname`).
  Bascule 📖 Récit = `team_timeline_story.js` (frise 2, défaut sur mobile). « O3 » = 1v1 partout dans
  le titre ; manager d'un 1v1 = ≥ 2 partenaires (1er chez Fuego, 2nd chez Gabbiano).
  Jours fériés : `utils/holidays.js` (SOURCE UNIQUE, aussi pour cal_banner) — exclus des congés
  (l'import RH les enregistre comme absences). Export : `team_timeline_export.js` (PNG html2canvas :
  `img { display: block }` de base.css fausse sa mesure de ligne de base → correctif le temps de
  l'export, ne pas le retirer). Opérations = portée `ops` de `calScope` (« ERPC - Opérations »),
  production = « ⚠️ » / « [PROD_ ». Filtre « Sources d'agenda » = portées (`st.sources`) passées à
  `collect()` — bulles : `team_timeline_detail.js` (gabarit `li` tête / texte / étiquettes) — la vue passe par `collectView(st)` (portée par couloir `st.laneTrain`, champs dans
  `LANE_TRAIN_FIELDS`) ; modèle découpé en `_base.js` / `_support.js` (ré-exportés par `_model.js`). Support = tickets type `support` par semaine (+ check-lists on/offboarding distinguées)
  + ticket de suivi du PI (titre « Paillettes support… ») découpé par titres « Itération X.Y.Z » ;
  ces titres sont des blocs ADF `expand` → rendus par sync.js depuis 3.173.0 (resynchro nécessaire).
  Filtres : `team_timeline_prefs.js` (localStorage `sb-team-tl-prefs-by-team`, PAR ÉQUIPE + marqueur d'URL `~frise=`, retiré
  par `applyHash` AVANT tout autre marqueur — valeur sans « / » ni « ~ »).
  Miroir : `static/mockups/team-timeline/`.
- **Sprint d'une équipe** : `getSprintForTeam` — sprint rangé sous une fausse équipe
  (`team: 'F - itération 31.2'` pour Fuego) → sprint actif retrouvé via les tickets
  (`activeSprintFromTickets`). Sans lui : sprint de 2024 et PI courant faux (20 au lieu de 31).
  Cause corrigée à la synchro en 3.165.1 (`extractTeam` : « Itération », numéro nu, tiret collé ;
  équipe tirée du nom d'un sprint SEULEMENT s'il porte un « NN.N »). Le repli reste utile tant
  qu'une synchro n'a pas réécrit les sprints déjà en base.
- **Filtrage équipe** : tickets **ET features** via `filterByTeam(items, team)`. Un compteur "Features (N)" compte la liste **filtrée**.
- **Membres d'une équipe** : source de vérité = import Congés (CSV RH). Pour « qui est dans
  l'équipe À UN PI » (aujourd'hui = `getCurrentPi`) : `effectiveRosterForPi(piInfo, PI, …)`
  (snapshot `piMembers[<PI>]`, repli absences) + `teamNameMatches`. `deriveMembersFromAbsences()`
  seul = TOUT l'historique : il garde les partis (COLSENET, parti après le PI 29, restait dans
  `/#team/Gabbiano` jusqu'en 3.165.4). `store.get('members')` brut = autocomplete/recherche seulement.
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
- **settings.js éclaté** (3.141.8) : `settings-rotation.js` (grille/shuffle) et ses trois
  satellites (3.162.0) `settings-rotation-weeks.js` (semaines d'un PI, dates, absences),
  `-display.js` (pliage, PI épinglé, « Congés seuls » — que du localStorage) et
  `-message.js` (noms + message d'une équipe), tous **ré-exportés** par `settings-rotation.js`
  pour que tests et `settings.js` gardent leurs imports ;
  `settings-rotation-pool.js` + `settings-rotation-pool-recap.js` (rotation mutualisée et
  son récapitulatif, cf. plus bas), `settings-io.js`
  (import/export de données), `settings-absences-csv.js` (parser du CSV
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
- **Statuts JIRA — repli silencieux** (3.145.2) : `mapStatus()` est un lookup EXACT dans
  `STATUS_MAP` avec repli **muet** sur `'todo'`. Un libellé non déclaré ne lève rien et prive le
  ticket de ses dates de cycle (statut de travail → pas de `startedDate` ; statut de livraison →
  pas de `resolvedDate`, et le ticket s'affiche « à faire » alors qu'il est livré). Les files
  d'attente amont sont donc déclarées EXPLICITEMENT, même quand `'todo'` est déjà la valeur du
  repli : c'est ce qui distingue « classé » de « oublié ». Déclencheurs du cycle time :
  `CYCLE_START_STATUSES` / `CYCLE_END_STATUS` (config.js), lus par `sync.js` — ne pas les
  réinscrire en dur. Golden dataset : `tests/status-map.test.mjs`, à compléter dès qu'une équipe
  introduit un statut. ⚠️ Toute modif de `STATUS_MAP` n'agit qu'à la **prochaine sync** (status
  et dates figés en base à l'import).
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
  de recalage (Rotation) ET du récapitulatif multi-PI (Sprint & PI). L'écart de date s'évalue
  après recul sur le jour de bascule des modes passés en 4ᵉ argument (équipes affichées) : un
  jour d'écart dans la même semaine (`memeSemaine`) n'est pas un écart, recaler ne déplacerait
  aucune clé (3.162.1).
- **Semaines d'un PI** (3.141.6) : source unique `utils/pi-weeks.js` (`buildPiWeeks`) —
  consommée par « Paramètres → Rotation » ET la page Support. Ne JAMAIS recalculer des
  semaines ailleurs. `weekStart` est la clé d'appariement des rotations en base : le changer
  les rend invisibles, d'où le recalage explicite par bouton (`manual.startDate`). Agenda et
  info-panel apparient par recouvrement de dates et n'ont pas besoin de ce module.
  ⚠️ **`weekStart` tombe TOUJOURS sur le jour de bascule du mode** (`snapToWeekMode`,
  utils/support.js), PI courant ou épinglé (3.162.1) : c'est ce qui rend « Jeu → Mer »
  effectif, et ce qui garantit qu'un PI écrit depuis PI+1 se relit une fois devenu courant.
  Une branche qui ancrerait sur la date JIRA brute recréerait des rotations invisibles ;
  `app/migrations.py` recale au démarrage les lignes en base sur leur propre `week_mode`.
  **`makePiWeeks` (utils/support.js) est la SEULE fabrique de semaines** (3.163.0) : quand le
  recul laisse la fin du PI à découvert, elle ajoute la **semaine de transition**
  (`transition: true`, libellé `<PI>.<dernier sprint>.3`) — le PIP puis les premiers jours du
  PI suivant, dont c'est aussi la 1ʳᵉ semaine (même `weekStart`). Ne pas la filtrer : en
  « Jeu → Mer » elle porte trois jours de support (lun → mer) qui n'existeraient nulle part.
  `buildPiWeeks` annote la semaine partagée des deux côtés (`sharedWith` = l'autre libellé) et
  `supportWeekHead(w)` (support.js) rend l'en-tête « ↪ 31.5.3 · 32.1.1 » — le SEUL rendu
  d'en-tête de semaine, pour la grille, le pool, la page Support et l'onglet du PI. Un PI sans
  date propre prolonge la cadence depuis le PI daté le plus proche avec le nombre de sprints
  de CHAQUE PI intermédiaire (`_chainedStart`), jamais `offset × sprints du PI visé`.
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
  - **Rotation mutualisée** (3.162.0) : une astreinte assurée par PLUSIEURS équipes, composée
    par **poste** (`member.role`) — carte de `/#settings/rotation` rendue par
    [settings-rotation-pool.js](static/js/views/settings-rotation-pool.js), règles de tirage
    dans `generatePooledSupportRotation` ([utils/support.js](static/js/utils/support.js)).
    **Aucun objet « pool » en base** : le tirage est réparti dans les rotations des VRAIES
    équipes, sinon la page Support, l'agenda, l'info-panel et le message Slack ne le verraient
    pas. La config vit en localStorage `rot-pools`, indexée par **groupe** (topbar).
    ⚠️ Les équipes d'un pool DOIVENT partager le même mode de semaine : `weekStart` est la
    clé d'appariement et deux modes produisent deux séries de semaines sans date commune —
    enregistrer un pool aligne donc les modes, et la carte l'annonce avant.
    ⚠️ Un poste sous-doté est remonté en `shortfalls`, JAMAIS comblé par un autre poste ; les
    postes sont servis du vivier le plus étroit au plus large (un seul PO servi après les Dev
    se ratait). En pool, la ligne « Total » de la grille passe en `⧉ n` neutre : l'effectif
    cible est celui du pool, une équipe peut légitimement ne fournir personne une semaine.
    ⚠️ Le flux est en DEUX temps : « Aperçu du tirage » calcule et affiche sans écrire, puis
    « Enregistrer ce tirage » écrit **exactement ce brouillon** (`_preview`) — jamais un
    recalcul, le départage des ex-aequo étant aléatoire. Tout changement de réglage jette le
    brouillon (`_persist`). `pool.enabled` n'est PAS une case à cocher : il passe à vrai à
    l'enregistrement, et c'est lui qui pose le repère ⧉ et aligne les modes.
    Le message « Copier / Slack » du pool groupe les personnes **par poste** et vit dans le
    bandeau du tableau, pour coller à ce qui est affiché (brouillon compris, annoncé).
    ⚠️ Un « poste » n'est PAS un rôle : `pool.roleGroups` fusionne des rôles interchangeables
    (`DEFAULT_ROLE_GROUPS` = `Dev + Tech Lead`). Le générateur ne connaît que des postes —
    `_poolMembers` résout `member.role` en poste (`role`) et garde le rôle RH (`realRole`)
    pour l'affichage. `roleGroups` ABSENT ⇒ défaut ; `{}` ⇒ choix explicite de ne rien
    grouper : `saveSupportPool` n'écrit donc la clé que si l'appelant en fournit une, sinon
    le premier enregistrement venu effacerait le défaut. Les quotas d'un pool antérieur à une
    fusion sont reportés par `remapQuotasToPostes` (somme), sans quoi ils deviennent des
    lignes orphelines « 0 dispo » et le pool vise 0 personne.
    Le récapitulatif vit dans [settings-rotation-pool-recap.js](static/js/views/settings-rotation-pool-recap.js)
    (deux vues + message à coller) : il ne recalcule JAMAIS de tirage, l'appelant lui passe
    `weekMembers(w)` qui pointe sur le brouillon ou sur l'état en base. La vue « par poste »
    liste les personnes à **zéro passage** — c'est le vide qui se lit.
    Le focus « masquer les équipes hors pool » est un mode de LECTURE : `data-pool-member`
    sur les panneaux + classe `rot-focus-pool` sur `#rot-panels`, purement CSS, jamais
    persisté, proposé seulement en aperçu et éteint avec le brouillon (`_persist`).
    La vue « par poste » est **UNE seule table `rot-grid`** avec les mêmes `rot-strip` que la
    grille par équipe, donc modifiable : les cellules portent les mêmes `data-rot-*` et le
    câblage est celui de `_rotWireDayCells(root, onSaved)`, appelé sur le **nœud du récap** —
    lui passer le conteneur entier ajouterait un second écouteur à chaque pastille de la
    grille (un clic basculerait le jour deux fois, donc rien).
    ⚠️ Pastilles désactivées en aperçu (le brouillon n'est pas en base) et pour un membre
    sans équipe connue (pas de rotation cible). Pas de cadenas dans son en-tête : le verrou
    est un état (équipe, semaine) et une colonne y couvre plusieurs équipes.
    Elle trie par **équipe puis prénom** et porte la couleur d'équipe sur toute la colonne
    d'identité ; le badge `⚖️` y signale l'écart de charge, mais un écart de 1 est INÉVITABLE
    (les créneaux ne tombent pas juste sur l'effectif) et un 0 vient le plus souvent de
    congés — d'où un libellé factuel et trois niveaux, jamais d'alerte.
    CSS du pool dans [support-pool.css](static/css/views/support-pool.css), chargé APRÈS
    `support-rotation.css` : les surcharges de `.rot-count-pool` comptent sur cet ordre.
- **`bulk` support = purge puis insert** : `POST /api/support/bulk` supprime TOUTES les lignes
  de l'équipe avant d'insérer. Toute génération doit donc reporter les semaines hors de sa
  fenêtre via `carrySupportRowsOutside()` ([utils/support.js](static/js/utils/support.js)) —
  sans quoi shuffler le PI 31 efface la rotation du PI 30, sans aucun signe (la grille
  n'affiche qu'un PI à la fois). Appliqué au shuffle par équipe, au shuffle de groupe et à
  l'enregistrement du pool (3.162.0).
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
- **Rail de navigation** (3.146.0, [nav-rail.js](static/js/components/nav-rail.js)) : barre
  qui défile au lieu de wrapper. Trois pièges, tous constatés en mesure :
  ⚠️ `.nav-rail { flex-wrap: nowrap }` et la classe de la vue ont la **même spécificité** —
  `nav-rail.css` DOIT rester le dernier `<link>` de `css/views/`, sinon le rail wrappe.
  ⚠️ C'est le **wrapper** qui porte `position: sticky`, le fond et les marges négatives : un
  collant dans un conteneur à sa taille exacte ne colle pas. `_publishTabsHeight` mesure donc
  `.nav-rail-wrap`, pas la barre.
  ⚠️ Un `ResizeObserver` ne voit pas un changement de **contenu** : ajouter/retirer des
  onglets change `scrollWidth` sans changer la taille du rail → `MutationObserver` obligatoire,
  sinon des chevrons fantômes défilent vers du vide.
  Appliqué à `.settings-tabs`, `.activity-filters` et `.db-oncall-chips` (3.146.2).
  ⚠️ **Ne PAS l'étendre mécaniquement** aux autres `flex-wrap: wrap` : `.quick-filters`
  contient un `<input>` (le focus ferait défiler le rail), `.agenda-toolbar` / `.rot-toolbar`
  portent du texte qui doit wrapper, `.bl-flt-chips` vit dans un popover, `.jira-project-chips`
  est un aperçu. Le rail est pour une NAVIGATION à contenu variable, pas pour tout ce qui wrappe.
- **Mode « Ajouter » des absences** (3.148.0, [absences.py](app/routers/absences.py)) : la clé
  `(nom, début, fin)` NE CONTIENT PAS la durée. Une même clé dont `days`/`team`/`type` a
  changé est donc **mise à jour** (`updated`), plus ignorée — avant, réimporter pour corriger
  une demi-journée ne changeait rien, en silence. Les chevauchements PARTIELS (`09→09` vs
  `09→10`) restent créés mais sont remontés dans `overlaps` : les fusionner serait un
  arbitrage métier, les taire faussait la capacité.
  ⚠️ Comparer `days` avec une tolérance (`1e-6`) — un flottant qui a fait l'aller-retour JSON
  déclencherait sinon des mises à jour fantômes.
- **Écrasement à l'import d'absences** (3.147.1) : la fenêtre `replaceRange` couvre TOUT ce
  que le fichier décrit, **jours PIP compris** — pas `piEndDate`, qui les exclut. Sinon une
  absence PIP d'un import précédent survit, et la déduplication backend `(nom, début, fin)`
  ne la rattrape pas si la nouvelle est consolidée sur plusieurs jours.
  ⚠️ La suppression porte sur le **chevauchement** : un congé qui déborde de la fenêtre part
  en entier, part hors-PI comprise. Volontaire (le CSV pivot fait autorité sur ses jours),
  mais à dire dans l'UI — c'est fait dans le libellé du bouton « Écraser ».
- **Import CSV des absences** (3.147.0) : le parser REMONTE ce qu'il écarte
  (`ignoredCells`, `ignoredSamples`, `skippedRows`) et `diagnosePivotCsv()` explique un
  format non reconnu. ⚠️ Un export RH écrivant « CP »/« RTT » au lieu d'un nombre donnait un
  import parfaitement silencieux — membres créés, zéro absence, aucun message. Toute
  évolution du parser doit garder ce compte : la règle « seul un nombre vaut absence » est
  correcte, c'est le silence qui ne l'était pas.
- **ROAM retiré du front** (3.146.1) : plus de vue ni d'onglet PI. Le **backend est intact**
  (routes `/api/risks`, modèle `Risk`, colonne) — les helpers Risk d'`api.js` sont donc du
  code mort assumé, pas un oubli. Ne pas les « réparer » en recréant une vue.
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

- **Section PI du rapport** (3.149.0, [reports-pi.js](static/js/views/reports-pi.js)) : elle
  est DYNAMIQUE sur l'équipe (`ctx.team`) et sur le PI (`ctx.displayPiNum` / `isCurrentPi`) —
  l'ancien générateur lisait `piInfo.objectives` brut et montrait toutes les équipes du PI
  courant quel que soit le hash. Objectifs résolus par `resolvePiObjectives()` (même source
  que pi.js et dashboard.js, égalité stricte sur `o.team` : les 3 vues doivent afficher le
  même compte) ; les objectifs SANS équipe sont montrés à part comme transverses, jamais
  écartés en silence.
  ⚠️ Le détail par sprint part de `ctx.teamTickets` (tickets de l'équipe, NON réduits au PI)
  et passe par `sprintScope()` : un reporté porte le sprint d'arrivée, souvent d'un autre PI.
  Réduire au PI d'abord ferait disparaître les tickets de leur sprint d'engagement.
  ⚠️ `.rpt-ti--done.rpt-pi-ti--open` (reports-pi.css) ANNULE le grisé/barré de `.rpt-ti--done`
  (reports.css) : un ticket `done` ailleurs ne doit pas s'afficher comme tenu dans le sprint
  où il ne l'a pas été. Les helpers Slack/Confluence `B`/`E`/`SB`/`CS` vivent dans
  [reports-fmt.js](static/js/views/reports-fmt.js) — les importer depuis `reports.js` créerait
  un cycle et mettrait ces `const` fléchées en TDZ.
- **Météo des équipes** (3.152.0, [meteo_matrix.js](static/js/components/meteo_matrix.js)) :
  l'ÉCHELLE vit dans [utils/meteo.js](static/js/utils/meteo.js) (pur, via le barrel) — cinq
  niveaux ☀️ ⛅ 🌧️ ⛈️ ⚪, `weatherOf(score)` pour l'absolu, `weatherRel(pct, timePct)` pour
  le relatif au temps (tolérance de démarrage sous 15 %), `worstLevel()` pour une équipe.
  Seuils GLOBAUX (`sb-meteo-thresholds`), jamais par équipe. ⚪ = pas de donnée, jamais un
  mauvais signe. Chaque domaine relit une mesure existante — ne pas recalculer : sprint =
  `sprint-scope.js`, PI = `belongedToPi`, santé = `healthScore()` de
  [business_rules.js](static/js/business_rules.js) (**source unique**, normalisée par tickets
  actifs, utilisée aussi par `health.js`), SLA = `slaModel` de `sla_review_card.js`, mood =
  `store.moodVotes` du sprint actif. Dashboard filtré = **fiche équipe** : plan d'action
  ([meteo_plan.js](static/js/components/meteo_plan.js), ouvre `openAlertModal`), tendance des
  votes + roster ([meteo_fiche.js](static/js/components/meteo_fiche.js)). Seuils réglables dans
  Paramètres → Météo ([settings-meteo.js](static/js/views/settings-meteo.js), pattern
  settings-jira, aperçu = vraie matrice en mode `preview`). **Mode TV** ([tv.js](static/js/views/tv.js),
  `#tv`, hors `NAV_ITEMS`) : rotation météo → plans → aujourd'hui, l'alerte `oldBlockers`
  en tête de tour ; ⚠️ la vue pose `body.tv-mode` et des timers — `_cleanup()` est appelé au
  re-rendu ET via `store.on('view')`, ne pas ajouter d'écouteur hors de `_st.unsubs`.
  Direction visuelle et pages restantes : [static/mockups/refonte/](static/mockups/refonte/README.md).
- **Refresh ICS et pool SQLite** (3.149.0, [calendars.py](app/routers/calendars.py)) :
  `refresh_calendar` **rend sa connexion au pool avant le fetch réseau** (`session.close()`,
  puis un second `session.get()` recharge l'objet détaché). Tenir la session pendant l'appel
  HTTP immobilisait une connexion jusqu'à 30 s : « Rafraichir tous » lançant les 16
  calendriers de front, le pool (5 + 10 overflow) était épuisé dès le 16ᵉ
  (`QueuePool limit ... connection timed out`) — un par un, la même route passait.
  ⚠️ Ne JAMAIS refaire d'I/O réseau entre deux usages d'une session dans ce projet.
  Côté front, `_refreshPooled()` ([cal_banner.js](static/js/components/cal_banner.js)) borne
  la concurrence à 4 et sert `syncCalendars()` ET la modale semaine — ne pas revenir à un
  `Promise.allSettled(list.map(...))` nu. Le toast d'échec NOMME les calendriers fautifs.
- **Burndown / burnup réels** (3.195.0) : UNIQUEMENT `burnSeries()` ([utils/burn.js](static/js/utils/burn.js),
  via le barrel) — Board / Rapports / modale de sprint (`charts.js`, axe calendaire) ET TV
  (`tv-sprint.js`, jours ouvrés, fantôme du sprint précédent). Jamais de droite interpolée
  (`fait × i / jour courant`) : un ticket compte le jour de sa `resolvedDate`.
- **Statuts forcés, lisibilité** (3.195.0) : repère 🎯 d'une carte = `overrideReason(t)`, infobulle
  d'en-tête de colonne = `columnStatusesTip()` ([utils/status-override.js](static/js/utils/status-override.js)).
- **États vides** (3.197.0) : UNIQUEMENT `emptyStateHtml({ icon, title, text, action, size, tone })`
  ([utils/empty-state.js](static/js/utils/empty-state.js)) — plus de `tv-clear` / `tl-state` maison.
- **Sauvegarde de configuration** (3.198.0) : `/api/export` = snapshot complet ; `/api/config/*`
  ([config_bundle.py](app/routers/config_bundle.py)) = configuration curée (sans tickets / features /
  epics / sprints). ⚠️ Une nouvelle table de configuration s'ajoute à `CONFIG_DOMAINS` (sinon absente
  de la restauration). Les secrets du navigateur sont filtrés dans [settings-backup.js](static/js/views/settings-backup.js)
  (`isSecret`) à l'export ET à la restauration.
- **Historique des niveaux Atlas** (3.198.0) : table `skill_level_history`, écrite UNIQUEMENT par
  `PUT /api/member-skills` (une ligne par changement réel), lue par `components/atlas_history.js`.
- **Dernière synchro** (3.197.0) : `sprintconfig.synced_by` / `sync_kind`, posés par la synchro
  seulement (import ET `PUT /api/sprint` ne les écrivent que s'ils sont fournis) — bandeau obsolète.
- **Marqueur `~membre=<nom>`** (3.197.0, `applyHash`) : ouvre la fiche membre après le routage
  (liens de l'export de la frise). Valeur sans « / » ni « ~ ».
- **TV, thème et nuit** (3.196.0) : thème de l'écran (⚙, sombre par défaut) posé sur `<html>` le
  temps de la TV et RESTAURÉ dans `_cleanup` ; la nuit pose `data-theme="dark"` sur `#tv-root` +
  palette `.tv.is-night` (plus aucun `filter`). Série « zéro blocker » : `sb-tv-blocker-seen`
  = `{ équipe: ISO }`, PAR équipe.

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
