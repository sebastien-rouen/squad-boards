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
- **Synchro JIRA** : `sync.js` (orchestration, `_doImport` : boards, sprints actif / clos, import) + `sync-parse.js` (ticket, ADF, sprint / PI /
  équipe, pagination) + `sync-report.js` (échecs partiels, équipes retirées, progression) + (3.252.0) `sync-fields.js`
  (champs JIRA), `sync-archive.js` (archive des sprints clos), `sync-passes.js` (passes JQL 3b → 6.5 sur un `ctx`
  partagé — tableaux mutés en place, ORDRE d'appel significatif) + `sync-watchers.js` (contributeurs = observateurs). Les tickets du
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
  Matrice « 🚂 Le train » des Rapports (`train_matrix.js`, 3.216.0) : `mountTrainMatrix(el, { piNum, team, teams })`
  — PI AFFICHÉ via `presets(piNum)` (sans argument = PI d'aujourd'hui, pour la frise), groupe → ses équipes.
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
  cartes du Dashboard, `_ticketsOfSprint`) utilise `engagedInSprint(t, nom, sprintStartsOf(sprintInfo))`
  (3.216.0) = `belongedToSprint()` MOINS les retraits d'avant-lancement — sans `starts`, un ticket
  planifié puis déplacé avant le démarrage compte (Fuego 31.1 : 145 pts au lieu de 20) ;
  `sprintScope(tickets, nom, starts)` idem. Périmètre d'un PI = `engagedInPi(t, PI)` (3.224.0, ALIGNÉ sur
  le rapport JIRA du train) = présent AUJOURD'HUI dans un sprint du PI (`currentSprintNames` : dernier `to`
  cumulatif, donc reports à la clôture compris ; sprint RENOMMÉ → le nom actuel fait foi), sans retirés ni
  abandonnés (`isAbandoned`, « Clos sans suite »). Source UNIQUE du Dashboard (Avancement du PI), de la
  page PI (`_ticketInPi`), de la Météo, des prévisions, du Burnup du rapport et de la TV — vérifié au point
  près contre le tableau JIRA du PI 31. ⚠️ Ne pas y remettre les retraits : ils vivent dans Health
  (`engagedInSprint`). La vélocité de la page PI garde l'ancien filtre (`_ticketInPiAll`).
  (`belongedToPi` seul = mesures de DURÉE uniquement). Le **réalisé**
  (`done`, `bufDone`, vélocité, `_sprintStats`) exige `isInSprint()` **en plus** du statut
  `done` — sinon un sprint est crédité de travail fini après sa clôture.
  Colonnes « prévu » de Health (tickets / vélocité / Buffer engagés **au lancement**, et leur
  liste) : `plannedAtSprintStart(t, nom, startDate, spk)` — historique Sprint rejoué jusqu'au
  démarrage, les ajouts en cours de sprint en sont exclus (signalés « +N ajoutés en cours »).
  Colonne voisine « nb actuel » (métriques `current` / `bufcurrent`) = `inSprintNow` (sprint
  clos = contenu À LA CLÔTURE, reportés compris — `to` JIRA cumulatif ; PAS `isInSprint`, qui
  ne garde que les restés). Les deux reposent sur `inSprintAt` (créé après T ⇒ absent). Liste
  avec chip « ➕ ajouté » pour ce qui n'était pas là au lancement (`plannedIds`), puis les
  retirés grisés HORS total (`_removedRowsHtml`). La cellule montre le TOTAL + l'écart NET
  au lancement (`.htl-delta-net` ▲ vert / ▼ rouge / ±0) ; le détail (+/−/↪/~) reste dans
  l'infobulle — des exposants +N/−N obligeaient à refaire le calcul (choix utilisateur).
  Même indicateur sur le Total PI (`_netHtml` partagé, `_moves` cumulé par les lignes).
  Son infobulle porte la STABILITÉ (`_stab`, sprints démarrés) : % d'engagés restés dans leur
  sprint + % d'ajouts. Un report à la clôture n'est PAS un retrait (engagement non tenu ≠ churn).
  Bleu = « modifié » (réestimé) partout, chips compris.
  ⚠️ Dates comparées en ms (`jiraDateMs`) : changelog en `+0200`, sprints en `Z`.
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
  Carte « 🎯 Capacité prévisionnelle » (Santé, une équipe) : MÊME calcul via `_capBaseFor(tm, PI)`
  (health.js) — PI sélectionné s'il est à venir, sinon courant + 1 ; jamais `piInfo.number`.
  PI sans sprint JIRA → `projectedPiSprints` (pi-weeks.js, cadence de la rotation), annoncé
  « dates projetées ». `computeCapacityNextPI` (utils.js) n'a plus d'appelant.
  Carte = TOUJOURS le PI sélectionné ; PI en cours/passé → + « Réalisé » ; ligne « Fiabilité de
  la base » = réalisé ÷ base des 3 PI clos précédents (✓ ≤ 10 %, ~ ≤ 25 %, ✗ au-delà).
  Détail « Par itération » : base du sprint (`sprintCapacityBase`, somme = total) ↔ j/h PRÉSENTS =
  UNIQUEMENT `iterationManDays` (meteo_fiche.js — aussi la carte roster du Dashboard, navigable ‹ › via
  `rosterSprints`, qui projette les pts par le MÊME `sprintCapacityBase`) ↔ réalisé. La base lit les
  fiches d'absence, les j/h la bande de présence (fériés déduits) : un léger écart est normal.
  Carte roster : colonne « Dispo » = `iterationManDays([membre])` + part des pts projetés AU PRORATA des j/h
  présents (la somme retombe sur le « ≈ N pts » d'en-tête) ; plus de colonne « Capacité » (% du rôle en infobulle).
  ⚠️ AFFICHAGE, PARTOUT (écran ET exports) : jamais « ETP » (choix utilisateur) — capacité en story
  points, présence en j/h (sur le sprint ; « j/h par jour ouvré » seulement dans le DÉTAIL d'un calcul) ; `teamEtp` / `.etp` / `memberEtp` restent
  les noms internes. Projection en pts hors Santé = UNIQUEMENT `sprintPointsProjection` (meteo_fiche.js :
  roster du Dashboard + section Équipe(s) du rapport). Page PI → Capacité : jours théoriques = capacité
  de rôle × jours OUVRÉS de la fenêtre (`_workdays`), jamais `× sprintDuration` (14 j calendaires face à
  des absences en jours ouvrés : +40 %) — dans `renderCapacity` ET `_computeCapByTeam`.
  ⚠️ Vélocité réalisée d'un sprint = UNIQUEMENT `sprintRealizedVelocity(tickets, sprint)`
  (capacity-base.js) — Santé (base, fiabilité) ET page PI (Capacité, cumul via
  `_withRealizedVelocity`). Ordre : Done locaux restés dans le sprint > JIRA si > 0 > 0 si des
  tickets y sont passés > `null` = aucune mesure, ÉCARTÉ des moyennes (`avgVelocityOverLastPis`
  saute un `velocityOf` null). JAMAIS `s.velocity` seul : le champ JIRA vaut 0 sur la plupart
  des sprints passés et tirait la Base capacité vers 0.
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
- **Support de la ligne produit** (3.249.0, page Support) : `views/support-line.js` — lecture seule, état EN BASE.
  Ligne = groupe contenant l'équipe filtrée, sinon groupe du topbar. Semaines = `buildPiWeeks` au mode de l'équipe
  filtrée ; une équipe sœur d'un autre mode est lue sur SES semaines (appariement exact), rattachées par le plus
  grand recouvrement. Postes = `posteOfRole` avec les `roleGroups` du pool du groupe ; quotas seulement si le pool est actif.
  Sans équipe ni groupe : toutes les lignes repliées (`<details>`, corps rendu SEULEMENT ouvert), semaines au mode de
  l'équipe la plus fournie en rotations. Copie Slack = `_slackMessage` (modèle déjà rendu, `_rendered`).
- **Champs demandés à JIRA par passe** (3.250.0) : toute passe qui PRODUIT des tickets demande
  `description,comment,issuelinks` (sprint actif, futurs, clos, PI nommés, enfants de features) — sinon le ticket
  arrive vide en base et l'import écrase la description existante par `""` (TRV-6276).
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
- **Écran d'attente** (3.231.0) : UNIQUEMENT `boardLoaderHtml({ mode: 'load'|'sync'|'full' })`
  ([board_loader.js](static/js/components/board_loader.js), CSS `css/board-loader.css` lié après les base-*) via
  `_showLoader` (app.js) — plus de skeleton. Animation 100 % CSS : n'y ajouter aucun timer JS (rien ne le libérerait).
- **Marge du contenu = `--content-pad`** (3.236.0, posée sur `.content` à chaque palier) : toute barre collée aux bords
  retranche `calc(-1 * var(--content-pad))`, JAMAIS `--sp-6` en dur (débordait sur mobile). `.content` est en
  `overflow-x: hidden` : un contenu large doit avoir SON conteneur qui défile.
- **Défilement programmé** (3.236.0 / 3.237.0) : UNIQUEMENT `scrollToEl(el, { block })` / `scrollWithin(container, el)`
  ([utils/scroll.js](static/js/utils/scroll.js), via le barrel) — jamais `scrollIntoView` (sauf `block: 'nearest'`), qui
  fait aussi défiler le document : si la page dépasse d'un pixel (élément `absolute` sans ancêtre positionné, cf.
  `.meteo-sr`), toute l'application glisse et la barre du haut disparaît.
- **Kanban borné** (3.237.0) : « Terminé » = clos depuis `DONE_DAYS` (14) jours, colonnes à `COL_PREVIEW` (40) cartes —
  affichage seulement, les compteurs restent les vrais totaux. Sections repliables : `bindCollapsibles` (collapsible.js),
  le corps reçoit `.coll-body` (sinon `[hidden]` est écrasé par un `display: grid/flex`).
- **Préfixes de classes** : vérifier qu'un préfixe est LIBRE avant de l'utiliser (`bl-` = Backlog ; l'écran
  d'attente a dû passer en `ldr-`). Cibles tactiles : liste dans base-utilities.css (`pointer: coarse`) — une classe
  ajoutée ne doit pas déjà utiliser `::after` ni `position: absolute`.
- **Graphiques par ticket** (3.239.0) : hauteur = nombre de lignes via `_fitRows(c, n, zoomed)` (charts.js) — compact
  `.chart-rows` (18 px), agrandi `.chart-rows-zoom` (24 px, la popin défile). Tout nouveau graphique « une ligne par
  ticket » doit l'appeler ; `chart_zoom._renderCurrent` retire ces classes entre deux graphiques.
- **Cartes Dashboard** : « bloqués / stagnants » = `stuckCardHtml` (stuck_card.js, lignes `.stuck-row` + `data-ticket`
  gardées pour le clic) ; prévision = forecast_card.js (`monteCarloForecast`, `deliverableBy`). Styles :
  css/views/dashboard-cards.css (après dashboard.css).
- **Sommaire de page** : `mountPageToc(container, entries)` (page_toc.js) — rappeler après CHAQUE rendu ; entrées du
  Dashboard = `_DASH_TOC` (dashboard.js), sélecteurs des blocs racines.
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
- **Année des colonnes `dd/mm` du CSV pivot** (3.248.0) : DÉDUITE par `_parsePivotAbsencesCsv(raw, ref, pipDays)` —
  1ʳᵉ colonne au plus près de `ref` (aujourd'hui), +1 an quand la date repasse en arrière (31/12 → 02/01), année
  écrite dans l'en-tête prioritaire. Plus de saisie d'année : ne pas la réintroduire (PI 32 à cheval sur deux années).
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
- **Sections Flow / Support / Roadmap / Burnup du rapport** (3.212.0) : `reports-flow.js`,
  `reports-support.js`, `reports-roadmap.js`, sur la période UNIQUE de `reports-scope.js`
  (`ctx.period` = sprint de l'équipe sur le PI courant, sinon le PI ; `ctx.piWindow`). ⚠️ Ne jamais
  compter `ctx.tickets` / `teamTickets` sans période : c'est TOUT l'historique chargé (≈ 1 an).
  ⚠️ `t.epic` porte l'id de la FEATURE parente (0 ticket ne pointe un epic du store) — d'où la fin
  de l'Epic Burndown, remplacé par le Burnup du PI (`#…/epicburn` redirigé vers `piburnup`).
  ⚠️ Bornes d'un PI = UNIQUEMENT `piBounds` ([utils/pi-weeks.js](static/js/utils/pi-weeks.js), 3.214.0) :
  dernier sprint de l'ÉQUIPE, sinon date MÉDIANE de ce sprint dans le train — une équipe crée ses
  derniers sprints JIRA en cours de PI (Initiale au PI 31 : « 97 % écoulé » à mi-PI).
  ⚠️ FIN (3.216.0) : dates réelles seulement si ce dernier sprint a DÉMARRÉ (actif / clos) ; futur →
  CADENCE projetée (`projectedPiSprints`), les dates prévisionnelles JIRA pouvant être fausses
  (Gabbiano : 31.5 au 30/11, PI fini le 13/11). Fin ramenée au dernier jour OUVRÉ. Rapport, matrice
  météo, détail TV et prévisions la partagent : jamais `sprints.map(s => s.endDate).sort().at(-1)`.
  Vélocité PI du rapport = `sprintScope` par clé « NN.N » (mêmes chiffres que la section PI Planning).
  Équipe(s) = `reports-teams.js` (présence via les helpers exportés de `meteo_fiche.js`) ; Rapport
  complet = `makeFullGenerator(GENERATORS)` (reports-full.js), posé APRÈS le littéral GENERATORS
  (TDZ) — son « En bref » relit les `build*Data` des sections, ne JAMAIS y recalculer un chiffre.
  Sommaire : scroll-spy sur une ligne de lecture SOUS `.report-controls`, verrou jusqu'à `scrollend`.
  Métriques sprint / Sprint / Équipes (3.213.0) : `ctx.tickets` = périmètre `sprintScope` du sprint
  AFFICHÉ (`reportSprint`, `ctx.sprint`) — un reporté terminé ailleurs y est ramené « en cours ».
  ⚠️ La section Sprint lit `ctx.sprint` (sprint DE L'ÉQUIPE), jamais `ctx.sprintInfo` (sprint global =
  celui d'Ami : son objectif s'affichait chez Fuego).
- **Météo des équipes** (3.152.0, [meteo_matrix.js](static/js/components/meteo_matrix.js)) :
  l'ÉCHELLE vit dans [utils/meteo.js](static/js/utils/meteo.js) (pur, via le barrel) — cinq
  niveaux ☀️ ⛅ 🌧️ ⛈️ ⚪, `weatherOf(score)` pour l'absolu, `weatherRel(pct, timePct)` pour
  le relatif au temps (tolérance de démarrage sous 15 %), `worstLevel()` pour une équipe.
  Seuils GLOBAUX (`sb-meteo-thresholds`), jamais par équipe. ⚪ = pas de donnée, jamais un
  mauvais signe. Chaque domaine relit une mesure existante — ne pas recalculer : sprint =
  `sprint-scope.js`, PI = `belongedToPi`, santé = `healthScore()` de
  [business_rules.js](static/js/business_rules.js) (**source unique**, normalisée par tickets
  actifs, utilisée aussi par `health.js`), SLA = `slaModel` de `sla_review_card.js`, mood =
  `store.moodVotes` du sprint actif, 📐 périmètre = `scopeStability()` (sprint-scope.js, même
  source que « nb début / nb actuel » de Health via `sprintScopeDelta`) — échelle INVERSE
  `weatherChurn` + plafonds `sb-meteo-scope` (10/25/40 %). ⚠️ Domaine `inLevel: false` :
  INDICATIF, hors du niveau d'équipe (PI 31 : 10 équipes / 13 en 🌧️/⛈️) — le passer à vrai
  est une décision métier, pas un correctif.
  Tendance vs PI − 1 : `churnTrend` (↘ = MIEUX, écart < 3 pts = stable), case + détail.
  Détail : histogramme 4 PI (`churnHistoryHtml`, tv-meteo-detail.js) — échelle bornée à
  2,5 × plafond « attention » (barre ▲ au-delà), libellé du plafond dans la marge droite. Dashboard filtré = **fiche équipe** : plan d'action
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
- **Flux cumulé du PI par état JIRA** (3.225.0, page PI → Indicateurs) : `components/pi_stage_flow.js` (modèle
  `piStageFlowModel` + carte), graphique `renderPiFlow` (charts.js). États 00.TODO → 05.DEVELOPMENT_DONE =
  UNIQUEMENT `stageOfLabel` / `JIRA_STAGES` ([utils/jira-stages.js](static/js/utils/jira-stages.js)) — ≠ `STATUS_MAP`
  (qualif = 04 ici, `done` là-bas) ; un libellé absent est signalé sous la carte, l'ajouter à `_BY_LABEL`.
  Chaque jour REJOUE l'historique (`sprintNamesAt`, statut, story points) — jamais interpolé (≠ `renderCFD` du
  Board, qui simule). Historique de statut absent / tronqué → reconstruit par `startedDate` / `resolvedDate`.
  Deux cartes : équipe du topbar + sa ligne produit (groupe dont `teams` la contient) ; sans équipe, le groupe
  du topbar ou tout le train. Unité `sb-pi-stageflow-unit`, vue de la carte ligne produit `sb-pi-stageflow-view`
  (`flow` | `bars`, commun aux deux cartes : une barre par équipe, 00 à gauche → 05 à droite, valeurs dans les
  segments via `_barValuesPlugin`, + part terminée en bout de barre et repère du temps écoulé `m.elapsed` —
  `_elapsedPct` = calcul de pi_progress, retard = `piFlowLate`, même règle ; mode % : `sb-pi-stageflow-pct`).
  ADDED SCOPE (3.226.0) = entrés dans le PI après la fin de son 1ᵉʳ jour (`piEntryMs`), points du jour, hors
  Buffer (`bufferTest(features)` : étiquette du ticket OU de l'epic, epic « [Buffer] ») ; NÉGATIF comme JIRA.
  Ligne produit = UNIQUEMENT `lineProductScope` (page PI ET Dashboard). Dashboard : `piFlowRowsHtml` dans
  `piProgressHtml(m, { statesHtml })` (remplace `.pip-teams`), modèle `snapshotOnly` (pas de rejeu jour par jour).
  Page PI : UNE carte (ligne produit ; carte équipe seulement sans ligne produit). Détail par epic =
  `piFlowEpicRows` / `piFlowEpicsHtml` (titre d'epic : `t.epic` = id de FEATURE), epics à 0 masquées comme JIRA.
  Copie du détail par epic = `copyPiFlowEpic` : `text/html` (`piFlowEpicHtml`, liens `jiraUrl/browse/ID`) +
  `text/plain` (`piFlowEpicText`), un seul modèle `_epicMessage`. Le TSV `piFlowEpicTsv` reste exporté.
  Même message sur le Dashboard (bouton `data-psr-copy` des lignes d'états, `bindPiFlowRows(root, m, copyOpts)`). Repères d'ajout du Flux = `m.addedDays[i]` (jour d'entrée `x.addedIdx`, slot =
  jour ouvré suivant), dessinés seulement si des points ; clic → `piFlowPick({ key: '__added', addedDay })`. Clic = `piFlowPick(m, { key, i, team })` sur
  `m.byDay[i]` (tickets + statut JIRA du jour) via le contrôleur rendu par `bindPiFlowCards` → `opts.onPick` de
  `renderPiFlow`, ignoré dans le zoom ; la bande cliquée se retrouve par le cumul des séries (05 en bas).
- **Copies « pour Slack »** (3.227.0) : UNIQUEMENT `copySlack(md, label)` (utils.js) — jamais `copyToClipboard` /
  `clipboard.writeText` sur un message mrkdwn. Collé dans le compositeur Slack, le mrkdwn s'affiche TEL QUEL
  (« *Support* », « <url|GCOM-1> ») : `copySlack` écrit `text/html` (`mrkdwnToHtml`) + `text/plain` sans balisage
  (`mrkdwnToPlain`, [utils/rich-copy.js](static/js/utils/rich-copy.js)). Les générateurs restent en mrkdwn.
  Rapports (3.228.0) : seul le format SLACK passe par là — son aperçu HTML (`B` / `E` / `SB`, `s-header`,
  `s-link`…) est traduit par `previewToMrkdwn` (reports-fmt.js) ; Texte et Confluence copient comme avant (le
  wiki Confluence ne doit pas être converti). Une nouvelle primitive d'aperçu Slack s'ajoute aussi à ce traducteur.
  Ticket listé au format Slack OU Confluence = `TK(t, ctx.jiraUrl)` (reports-fmt.js, numéro lié + espace) devant
  le titre. Format CONFLUENCE (3.229.0) : copie `copyRich(confluenceClipboardHtml(aperçu), innerText)` — statuts
  `CS` en styles EN LIGNE (le CSS de l'aperçu ne suit pas le collage), `class` / `target` / `rel` retirés ; un
  nouveau style de statut s'ajoute à `_CS_STYLE`. `copyRich(html, plain)` (utils.js) = copieur générique.
- **Durées de flux en jours OUVRÉS** (3.216.0) : Cycle / Lead Time et âge du WIP = UNIQUEMENT
  `cycleDays(t)` / `leadDays(t)` / `wipAgeDays()` ([utils/workdays.js](static/js/utils/workdays.js)) —
  ⚠️ `t.cycleTimeDays` / `t.leadTimeDays` sont CALENDAIRES en base (sync-parse.js) : ne jamais les lire
  en direct (sauf `> 0` = « dans les métriques de flux », que les helpers préservent).
- **Historique des tickets** (3.216.0) : `recentChanges` garde TOUS les changements de `story points`,
  `sprint`, `status` et `flagged` (`_CHANGE_FIELDS_KEEP_ALL`, sync-parse.js) + les 8 derniers des autres
  champs. Périodes de blocage = UNIQUEMENT `_blockedIntervals` (charts.js) : drapeau OU statut « bloqué ».
  La liste est triée du plus RÉCENT au plus ancien : jamais `slice(-N)` pour « les N derniers ».
- **Durées par colonne** (3.216.0) : `stageDurations` en jours OUVRÉS dès la synchro (`workdayDurationDays`) ;
  les sprints clos archivés gardent l'ancien calcul tant qu'un « Tout réimporter » n'est pas passé.
- **Test d'import** (3.216.0) : `POST /api/import?dry_run=1` = `import_body(..., commit=False)` (flush) puis
  rollback. ⚠️ `import_body` ne doit committer QU'À LA FIN — un commit intermédiaire rendrait le test
  destructeur. L'import en mode Remplacer passe par `confirmDanger`.
- **Import CSV / .zip d'un export** (3.216.0) : UNIQUEMENT `csvTextToRows` ([settings-io-csv.js](static/js/views/settings-io-csv.js)) —
  cellules multi-lignes, `""` ≠ cellule vide (`None`), booléens Python. Ne jamais redécouper en lignes avant les guillemets.
- **Axe des graphiques du rapport** (3.216.0) : jours OUVRÉS (week-ends ET fériés) — `workdaysOnly: true` dans l'objet sprint
  passé à `renderBurndown` / `renderBurnup` (charts.js `_axisDays`, repère du jour et évènements placés
  par DATE). Le Board reste calendaire : ne pas poser le drapeau ailleurs sans le demander.
- **Burnup du PI** (3.216.0) : périmètre daté à l'ENTRÉE dans le PI (`burnSeries({ entryDay })` +
  `piEntryMs`), jamais à la création — un ticket ancien tiré en cours de PI n'est pas « initial ».
- **Burndown / burnup réels** (3.195.0) : UNIQUEMENT `burnSeries()` ([utils/burn.js](static/js/utils/burn.js),
  via le barrel) — Board / Rapports / modale de sprint (`charts.js`, axe calendaire) ET TV
  (`tv-sprint.js`, jours ouvrés, fantôme du sprint précédent). Jamais de droite interpolée
  (`fait × i / jour courant`) : un ticket compte le jour de sa `resolvedDate`.
- **Priorité d'un ticket** : UNIQUEMENT `priorityKey()` / `priorityBadge()` ([utils/priority.js](static/js/utils/priority.js),
  via le barrel) — la base mélange libellés JIRA (« 2. haute ») et clés internes (`high`) ; un lookup exact
  sur les clés passait tout ticket synchronisé en « medium ». En-tête de la modale ticket = `_ticketHeadHtml`
  (modal.js) ; style de sa barre de titre sous `#modal:has(.mdl-titlebar)` (#modal est partagé).
  Taille d'un ticket = `pointsTone()` (utils/points.js, paliers Fibonacci, classes `.pts-tone--*`).
  Périodes de blocage = `blockedIntervals()` (utils/blocked.js — `_blockedIntervals` de charts.js n'en est
  qu'un alias). La tuile Sprint EST l'éditeur du sprint (`#sprint-field`) ; les AUTRES sprints et les labels
  vivent dans la bande `.mdl-head-tags` en pied d'en-tête (plus de panneau « Planification »). Tuile Flux → « Le voyage du ticket » (`components/ticket_flow.js`, modèle pur `ticketFlowModel`) :
  efficacité = dév + revue + test ÷ total, la préparation (spécification) n'est PAS du temps actif.
- **Personne JIRA ↔ import RH** : UNIQUEMENT `findPerson` / `samePerson` ([utils/person-name.js](static/js/utils/person-name.js)) —
  JIRA « Prénom Nom », RH « NOM, Prénom » : l'égalité stricte n'appariait qu'1 leader sur 86 aux absences.
  Correspondances saisies à la main = `piconfig.person_aliases` (`piInfo.personAliases`, « "" » = pas dans
  l'import), écrites UNIQUEMENT par `PUT /api/pi/person-alias` (fusion clé par clé), éditées dans Paramètres →
  Absences ([settings-person-aliases.js](static/js/views/settings-person-aliases.js)) — passer `personAliases`
  en 3ᵉ argument de `findPerson`, sinon elles sont ignorées. Comptes techniques : `isBotName`.
  Poker : tickets de référence 1 → 21 = `_pokerReferences` (modal.js), calculés UNE fois à l'ouverture
  (recalculés après un choix) ; référence ÉPINGLÉE par l'équipe = `piconfig.poker_references`
  (`{ équipe: { "5": id } }`, `PUT /api/pi/poker-reference`, ticketId null = auto). Cartes de vote NEUTRES
  (aucune couleur de palier : ne pas orienter le vote). Animations : distribution au CHANGEMENT de phase
  (fenêtre 700 ms — la popin se re-rend toutes les 3 s), révélation au passage caché → révélé observé APRÈS le
  1er fetch (`_loaded`, sinon un tour déjà révélé se rejoue). ⚠️ AUCUN re-rendu pendant ces fenêtres (le
  polling fait `refresh(false)`) : reconstruire le DOM rejouait l'animation (révélation vue deux fois). Sons = `components/poker_sound.js` (Web Audio,
  coupés par défaut, `sb-poker-sound`). Tours CONCLUS = table `pokerround` (« Enregistrer » → `POST
  /api/poker/{t}/rounds`, moyenne / écart recalculés côté serveur), DURABLES : dans `/api/export` (+ import),
  PAS dans `/api/all` (chargés par la modale, section « Estimations en équipe »). `PokerVote` reste éphémère.
  File des tickets à estimer = UNIQUEMENT `estimationQueue` (utils/estimation-queue.js) : bouton « ⏭ Suivant »
  du Poker (`_nextToEstimate`) ET page **🃏 Affinage** (`views/refinement.js`, `#refinement/<équipe>`, groupe
  Équipe & RH) — séance = tours du jour (`GET /api/poker-rounds?team&since`), 🗳 = `GET /api/poker-sessions`.
  Valeur enregistrée = suite de Fibonacci SEULEMENT (pastilles, choix gardé dans `_savePick` : re-rendu de 3 s).
  Volet « Description » à droite de la popin (`.poker-stage` > `.poker-modal` + `.poker-desc`) : rendu calculé
  UNE fois, ouvert / fermé EN PLACE (`sb-poker-desc`), défilement conservé au re-rendu ; < 1180 px il se superpose.
  « 📌 L'essentiel pour estimer » = `descSections` (components/desc_sections.js) : critères d'acceptation, règles
  de gestion, DoD, points d'attention, repérés sur un TITRE `hN` ou un PARAGRAPHE-LIBELLÉ court (gras ou « : »),
  jamais dans une phrase ; état replié des sections gardé par l'appelant (`_pdClosed`).
  Page Affinage : 📝 = description vide (tous types), ⚠️ = STORY sans critère d'acceptation repéré
  (`acceptanceStatus`, même repérage que le volet ; une tâche sans critère est normale) + filtre « à compléter ».
  « 📋 Copier pour Slack » = `toCompleteSlack` (refinement_recap.js) : regroupé par RAPPORTEUR, sprint en cours signalé.
  Fil « Par où commencer ? » (3.231.0) = `components/refinement_steps.js`, relit les chiffres de `_html` (jamais de
  recalcul) ; clic → `_goStep` (état de la section puis défilement).
  Mise en page (3.240.0) : fil COLLANT (hauteur mesurée → `--rf-sticky` sur `.rf`, décalage de `_goStep` et des
  collants dessous : colonne séance, en-tête du cadrage déplié — d'où `.rf-cad { overflow: clip }`, jamais `hidden`).
  Lignes cliquables = `data-rf-row` (+ `tabindex`), traitées EN DERNIER dans `container.onclick` après tous les
  boutons. Cadrage : `_st.cadOpen` null = automatique (déplié et remonté seulement si la file est vide).
  Poker « table de jeu » = css/views/poker-table.css (variables de thème redéfinies sur `.poker-modal`) — un effet
  ponctuel passe par `.poker-reveal-in`, jamais par une classe de phase (re-rendu toutes les 3 s).
  File par sprint (3.241.0) : ordre de proximité = UNIQUEMENT `sprintProximity` (estimation-queue.js), appliqué
  DANS `estimationQueue` (option `teamSprints`, passée par l'Affinage ET `_nextToEstimate`) — ne pas retrier ailleurs.
  Jeton du Poker = `flyPokerChip` (poker_chip_fly.js, clone sur body). Guide « Prêt à estimer ? » de la fiche =
  `mountReadyGuide(bodyEl(), ticket)` (ticket_ready.js), appelé à CHAQUE rendu d'`openTicketModal` ; la description
  s'édite EN PLACE (pas de re-rendu) → le guide se réévalue sur `store.on('tickets')`. Un nouveau point de contrôle
  s'ajoute à `_CHECKS` (sélecteur du champ + action qui ouvre son éditeur).
  Série Poker (3.248.0) = `utils/poker-playlist.js` : `setPokerPlaylist` puis ouverture du Poker ; `_nextToEstimate` (modal.js)
  ne lit la série QUE si le ticket affiché en fait partie, sinon `estimationQueue`.
  Badge ✨ de la file = `readyChecks(t, acc)` (même calcul que la bande, estimation exclue) ; `armReadyGuide(id)` avant
  `openTicketModal` = guide lancé d'office (étape « Compléter » ou clic sur le badge). Tuiles `.mdl-props` et cartes
  `.mdl-people` (3.242.0) : css/views/modal-tiles.css (couleur `--tile` / `--role`, sélecteurs à 3 classes pour
  gagner sur les bordures de grille de modal-detail.css) ; cellules Personnes repérées par `data-role`.
  « À compléter » de l'Affinage (compteur, filtre, étape, copie Slack, tri « moins prêts », badge) = UNIQUEMENT
  `_readyOf(t)` (refinement.js) — ne plus tester `_acceptance` seul pour ça (3.243.0). Préférences de la file :
  `sb-refinement-sort` (rank | ready), `sb-refinement-density` (compact) ; survol du badge = calque `.rf-pop`.
  Groupes repliables (3.244.0) : `_groupOpen(g, near)` — choix par équipe `sb-refinement-groups` (clé = NOM du sprint,
  pas `s0…`, qui bouge), défaut : clos + backlog repliés s'il existe un sprint en cours / à venir.
  Choix des PI du Cadrage (3.247.0) : option `pis` de `cadrageModel` (null = automatique ; liste = étiquettes choisies,
  tous statuts), `model.available` alimente le sélecteur, `_pickCadragePi` (refinement.js) part de ce qui est AFFICHÉ ;
  mémorisé par équipe `sb-refinement-cadrage-pis`.
  Volet 🧭 Cadrage (3.230.0) = UNIQUEMENT `cadrageModel` (utils/cadrage.js), rendu `components/refinement_cadrage.js` :
  cible `Cadrage_PI<PI de l'équipe + 1>` + `Cadrage_PI<PI en cours>` encore ouverts ; ⚠️ PAS de filtre `t.team` (les
  cadrages vivent chez « ERPC - Team Transverse ») mais SA- / PO- / PM-<périmètre> + contributeur (membre du roster
  via `findPerson`, étiquette métier, ou équipe). Périmètre = `CADRAGE_PERIMETERS` (config.js) > ligne produit.
  Contributeurs JIRA : champ détecté par `detectContributorsField` (sync-parse.js), à ajouter à toute NOUVELLE
  liste `fields` d'une passe tickets via `contributorsFieldParam()` (sinon `[]` silencieux).
  Sans ce champ (cas de l'ERPC, 3.251.0) : contributeurs = OBSERVATEURS JIRA (`sync-watchers.js`) — la même
  `contributorsFieldParam()` demande alors `watches` (nombre) ; seuls les tickets OUVERTS suivis au-delà de
  porteur + rapporteur sont relus (`/issue/{clé}/watchers`). Clé technique `_watchCount` retirée avant l'import.
  Récap de séance à partager = `components/refinement_recap.js` : UN modèle (`refinementRecapModel`) → Slack
  (mrkdwn), Teams / mail (HTML à styles EN LIGNE, `text/html` + `text/plain`), CSV — ne pas dupliquer un chiffre.
  ⚠️ Front servi frais (assets versionnés, cf. « Performances ») mais routes Python figées au lancement : un serveur sans `--reload`
  sert la nouvelle page avec l'ANCIENNE API (404 / 405). Ces vues le signalent (« redémarrez le serveur ») au
  lieu de se taire — garder ce réflexe pour toute route nouvelle appelée par le front.
  Congés d'une personne dans la modale = `presenceStripHtml` + `nextAbsence` (meteo_fiche.js, même bande que le
  roster du Dashboard) sur l'itération en cours de l'équipe. Labels = `labelChipHtml` / `labelColor` (utils.js).
- **Synchro JIRA d'UN ticket** (3.248.0, bouton ↻ de la popin) : UNIQUEMENT `components/jira_ticket_sync.js`
  (import DYNAMIQUE depuis modal.js — il tire sync-parse.js) et `transformIssue` pour lire l'issue : ne pas
  écrire un second parseur d'issue. Équipe locale conservée, statut interne recalculé seulement si le libellé JIRA a
  changé, id de sprint gardé tant que le nom ne bouge pas. Push = `api.jiraSend` (titre, points, priorité, étiquettes,
  leader par `accountId`, statut par TRANSITION) — jamais la description (ADF). `PUT /api/tickets/:id` accepte les
  clés de cycle (`startedDate`…) et normalise `createdAt` / `updatedAt` via `_iso_utc`.
- **Démos vidéo** (3.248.0) : `docs/demo/` est servi tel quel sous `/demo/` (`DEMO_DIR`, `main.py`) — lecteur, MP4,
  scénarios JSON et `*.meta.json` générés par `tools/demo-video/record.mjs` (racine du monorepo, agent `demo-video`).
  Ne rien éditer à la main dans ce dossier à part les `*.json` de scénario ; ne jamais monter `docs/` entier.
- **Historique d'un ticket** (3.252.0) : UNIQUEMENT `ticketHistoryHtml` / `bindTicketHistory` (components/ticket_history.js) ;
  catégorie d'un champ = `catOf` (`_BY_FIELD`) — un champ JIRA nouveau tombe en « Autres », l'ajouter là.
- **Modale ticket en PLEINE PAGE** : le bouton re-rend la modale (`openTicketModal`) dans une vue détaillée —
  voyage ouvert, description à gauche, activité à droite (personnes, commentaires, historique COMPLET).
  Corps = `.mdl-layout` > `.mdl-aside` / `.mdl-main` / `.mdl-aside-tail` : en modale normale ces trois
  conteneurs sont en `display: contents` et l'ordre vient de `order` — un bloc ajouté au corps doit y
  recevoir son `order`, sinon il se place en tête.
- **Statuts forcés, lisibilité** (3.195.0) : repère 🎯 d'une carte = `overrideReason(t)`, infobulle
  d'en-tête de colonne = `columnStatusesTip()` ([utils/status-override.js](static/js/utils/status-override.js)).
- **États vides** (3.197.0) : UNIQUEMENT `emptyStateHtml({ icon, title, text, action, size, tone })`
  ([utils/empty-state.js](static/js/utils/empty-state.js)) — plus de `tv-clear` / `tl-state` maison.
- **Sauvegarde de configuration** (3.198.0) : `/api/export` = snapshot complet ; `/api/config/*`
  ([config_bundle.py](app/routers/config_bundle.py)) = configuration curée (sans tickets / features /
  epics / sprints). ⚠️ Une nouvelle table de configuration s'ajoute à `CONFIG_DOMAINS` (sinon absente
  de la restauration). Les secrets du navigateur sont filtrés dans [settings-backup.js](static/js/views/settings-backup.js)
  (`isSecret`) à l'export ET à la restauration.
- **Votes Mood / Confiance dans l'info-panel** : `components/panel_votes.js` (carte « 🗳 Votes du sprint »),
  échelles = `VOTE_KINDS` (utils/vote-kinds.js, ré-exporté par health-votes.js). CHAQUE CLIC AJOUTE UN VOTE
  (recueil des votes de l'équipe depuis un poste, comme la page PI — pas de « mon vote ») ; × au survol =
  retire le DERNIER vote de cette valeur (`toastUndo`, suppression en base différée). Une équipe, sprint EN COURS.
  Page PI (onglets Mood / Fist, `renderVotingPanel`) : MÊME grammaire (cartes emoji, +1 par clic, × au survol,
  pastilles de sprint) et mêmes échelles `VOTE_KINDS` — plus d'échelle propre à la page.
- **Page PI → onglets Support / Équipes** : roster = `effectiveRosterForPi` du PI AFFICHÉ (jamais
  `deriveMembersFromAbsences` seul, qui garde les partis) ; absences de l'onglet Équipes bornées au PI (`piBounds`,
  prorata des jours ouvrés). Grille Support = même balisage que Paramètres → Rotation, en lecture seule.
  Onglets PI = carte commune `.pi-card` (+ `-head` / `-title` / `-actions` / `-body`, pi-planning.css) : Objectifs,
  Indicateurs, Features, Burnup, Dépendances, Équipes (Capacité pas encore). Ne pas restyler `.team-card` /
  `.pi-section-hdr` (partagés avec Dashboard / Roadmap) ni les cartes de mesure (stage flow, aging WIP).
  Dépendances (`components/dep_graph.js`, page PI seulement) : un lien est RÉSOLU quand l'item attendu (`to`) est
  `done` ; la matrice ne garde que les équipes ayant un lien inter-équipes (les autres sont citées à part).
- **Dashboard, flux « Équipe & risques » / « Pilotage & flux »** (3.222.0) : « 📈 Avancement du PI » =
  `components/pi_progress.js` (périmètre `engagedInPi` aligné sur JIRA, repère « aujourd'hui » en jours ouvrés via `piBounds`,
  segments / légendes cliquables → liste des tickets, « Copier les tickets à risque » : stagnation affichée en
  DATE — seuil calendaire de la card Bloqués / stagnants ≠ âge en jours ouvrés). « ⏳ Temps par colonne » :
  `opts.scopes` + `storageKey` + `compareOf` (stage_flow_card.js) — Sprint / PI / PI − 1, chaque segment comparé
  à sa référence ; sans `scopes`, comportement d'avant (page PI, Rétro). Activité récente (activity.js, Dashboard
  + Board + Kanban) : liste RECALCULÉE depuis les tickets (période `sb-activity-hours-<scope>`, 1 j par défaut ;
  filtres champ ET auteur à facettes) — plus de masquage CSS (`--overflow` rendait vide un filtre sur un champ
  rare). Barre de filtres : re-rendre son `innerHTML`, jamais l'élément (le rail l'enveloppe).
- **Échap et couches** : popin ticket au-dessus d'une couche (`.above-demo`) → Échap ne ferme QU'ELLE
  (`stopImmediatePropagation` dans modal.js) ; les couches dessous testent `ticketModalOnTop()` (utils/modals.js).
- **Historique des niveaux Atlas** (3.198.0) : table `skill_level_history`, écrite UNIQUEMENT par
  `PUT /api/member-skills` (une ligne par changement réel), lue par `components/atlas_history.js`.
- **Dernière synchro** (3.197.0) : `sprintconfig.synced_by` / `sync_kind`, posés par la synchro
  seulement (import ET `PUT /api/sprint` ne les écrivent que s'ils sont fournis) — fraîcheur affichée par la
  PASTILLE du bouton JIRA (`checkSyncStale`, app.js : ambre ≥ 2 h, rouge ≥ 48 h) + infobulle + ligne en tête du
  menu ▾ ; plus de bandeau sous le topbar. `checkSyncStale` est la SEULE écriture de l'infobulle de `#btn-sync`.
- **Marqueur `~membre=<nom>`** (3.197.0, `applyHash`) : ouvre la fiche membre après le routage
  (liens de l'export de la frise). Valeur sans « / » ni « ~ ».
- **TV : tout tient à l'écran** (3.199.2) — ⚠️ `.tv` fait `100vh` PUIS `zoom` : le zoom agrandit aussi la
  hauteur (1 404 px de TV pour 1 080, bas invisible car body en overflow hidden) → `_fitViewport` (tv.js)
  ramène la hauteur visuelle à la fenêtre, à chaque redimensionnement. Règle de la TV : JAMAIS de
  défilement ni de texte tronqué (`#tv-root` annule les `line-clamp` / ellipses, tv-week.css) — la place
  se gagne par la pagination à la hauteur (`_paginate`, météo par ligne produit, alerte par équipe),
  les colonnes des plans (`_choosePlansPerPage`, lisibilité ≥ 75 %), la densité de La semaine
  (`rollDays` → `data-dens`), et en dernier recours la réduction d'une carte trop haute (`_fitItems`).
- **Effectif d'une équipe** (3.199.2) : `teamCapacity(…, at, rosterCtx(piInfo, sprintInfo))` = roster du
  PI courant ; sans ce 5ᵉ argument, l'historique des congés (partis compris : Fuego 21 au lieu de 14).
- **TV, effet télé d'époque** (3.232.0) : calque `#tv-crt` (tv.js) + `css/views/tv-retro.css`, réglage `retroEnabled()`
  (tv-settings.js, `sb-tv-retro` : '0' / 'medium' / absent = léger ; `retroLevel()` → `data-level` ; URL `retro:leger|moyen|non`).
  Changement de chaîne = classe `is-zap` sur `#tv-screen`, posée par `show()` SEULEMENT si l'écran change (`_st.lastScreen`).
  TV « La semaine » : ligne d'évènement = grille icône · `<time>` · texte (tv-week.css) — garder `<time>` HORS du span texte.
  Créneaux alignés (3.234.0) : `li.tvw-slot[data-slot=HH]` par tranche d'une heure, hauteurs égalisées par `alignSlots`
  (en-têtes compris) À CHAQUE palier de `fit()` ; ⚠️ zoom de dernier recours IDENTIQUE pour toutes les journées tant
  qu'aligné (≥ `ALIGN_MIN_ZOOM`), sinon `data-align="0"` (listes compactes, zoom par journée). z-index 6 : au-dessus des écrans, SOUS `.tv-detail` (7). ⚠️ Rester
  DISCRET et sans scintillement rapide (rien sous la seconde) : c'est un écran mural regardé toute la journée.
- **TV, thème et nuit** (3.196.0) : thème de l'écran (⚙, sombre par défaut) posé sur `<html>` le
  temps de la TV et RESTAURÉ dans `_cleanup` ; la nuit pose `data-theme="dark"` sur `#tv-root` +
  palette `.tv.is-night` (plus aucun `filter`). Série « zéro blocker » : `sb-tv-blocker-seen`
  = `{ équipe: ISO }`, PAR équipe.

- **Performances, cache et compression** (3.245.0) : JS / CSS servis sous `/v/<version>/` (`app/static_assets.py`,
  `immutable`), version = empreinte des fichiers de `js/` + `css/`, recalculée au plus toutes les secondes ; `index.html`
  réécrit à la volée. ⚠️ JAMAIS d'import de module par chemin ABSOLU (`import('/js/x.js')`) ni de `<script>` / `<link>`
  vers `/js/` ou `/css/` hors d'`index.html` : chargé hors version, le module existerait deux fois (état séparé). Un
  lien ajouté à `index.html` en `href="/css/…"` / `src="/js/…"` est versionné automatiquement.
  `/api/all` = `app/boot_cache.py` : corps + gzip mis en cache par état de la base, ETag → 304 sans lecture. ⚠️ Son
  contenu ne doit dépendre QUE de la base (aucune date du jour), sinon l'ajouter à `_state()`. Encodé par `json.dumps`
  direct : les serializers ne doivent rendre que des types JSON natifs (pas de `datetime` brut). `GZipMiddleware` dans
  `main.py` pour le reste.

- **Menu mobile** (3.246.0, sidebar.js) : ouverture / fermeture UNIQUEMENT par `setMenuOpen(open)` (classe `open`,
  `body.nav-open`, `aria-expanded`). Voile `.sidebar-scrim` créé par le JS. ⚠️ Tester un clic sur un bouton à icône
  avec `contains(e.target)`, jamais `e.target === bouton` (le clic arrive sur le `<svg>`).
- **Bandeau calendrier, vue globale** (3.246.0) : absents = `offSummaryHtml` (components/cal_banner_off.js), styles
  et rendus replié / déplié de la vue globale dans css/views/cal-banner-compact.css (après calendar-banner.css,
  > 800 lignes). Classes d'état posées sur `.cal-banner` : `cal-banner--global`, `is-collapsed`.
  Dailys regroupés par créneau (déplié, vue globale, 3.247.0) : `groupDailies` (components/cal_banner_dailies.js), nature
  « daily » via `calNatureWithRules` ; état ouvert en mémoire de session seulement.

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
