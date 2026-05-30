## [3.10.80] - 2026-05-29

### Feat : Modal Démo — indicateur "Buffer" (nombre + somme des points)
- Nouvelle stat-card `.demo-stat--buffer` dans la grille de stats du Mode Démo ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - Valeur principale : `${bufferDone}/${bufferTotal}` (tickets Buffer terminés vs total).
  - Label : `🛡️ Buffer · ${bufferPtsDone}/${bufferPtsTotal} pts` (somme des Story Points).
  - Tooltip détaillé au survol.
- Visuel : gradient teal/sky (`#14b8a6 → #38bdf8`) pour distinguer du gradient or/rose de PI Predictabilité.
- N'apparaît que s'il y a au moins un ticket Buffer dans le sprint (label `Buffer` casse-insensible).

## [3.10.79] - 2026-05-29

### Feat : Modal détail ticket — nouveau field "Sprint(s)"
- Ajout d'un field full-width "Sprint(s)" dans la grille 3-colonnes ([modal.js](squad-board/static/js/components/modal.js)) — utile pour repérer en un coup d'œil le sprint courant d'un ticket et son historique (tickets reportés d'un sprint à l'autre).
- **Sources** ([_sprintsHistoryOfTicket](squad-board/static/js/components/modal.js)) :
  - `ticket.sprintName` → sprint courant côté JIRA (source de vérité).
  - `recentChanges` filtré sur `field === 'sprint'` → union des `from`/`to` (comma-separated) pour reconstituer les sprints historiques. Limité aux 8 derniers événements du changelog (cap sync).
- **Affichage** : chips ordonnées, sprint courant en premier avec `●` + couleur primary, sprints historiques avec `○` + style italique gris. Chip `piSprint` séparée (bordure dashed) à droite.
- État vide : `— Aucun sprint`.

## [3.10.78] - 2026-05-29

### Feat : Sprint sélectionné passé — tickets réels (Réalisations / À reporter / board Sprint)
- **Problème** : après [3.10.76], sélectionner un sprint passé via le picker rendait bien le bon header/dates, **mais** la liste "🏆 Réalisations" + "🔄 À reporter" (Sprint Review HTML et modal Démo) ainsi que les colonnes du board page Sprint étaient incohérentes — la base locale ne contient que les tickets `done` qui sont restés taggés sur ce sprint (les "à reporter" ont été retaggés sur le sprint suivant côté JIRA), donc la photo à la clôture était incomplète.
- **Fix** ([sprint_tickets_modal.js getSprintTicketsAsync](squad-board/static/js/components/sprint_tickets_modal.js)) — nouveau helper async exporté :
  - Sprint **actif/futur** → base locale (instantané, source de vérité).
  - Sprint **clos** (sprint.state === 'closed') → fetch JIRA `rest/agile/1.0/sprint/{id}/issue` (snapshot à la clôture = Done + reportés). **Cache module-level** par `team::jiraIds` → un seul fetch par sprint et par session.
  - Fallback transparent sur les tickets locaux si JIRA n'est pas configuré.
  - Toast informatif au premier fetch.
- **`openCurrentSprintReview` / `openCurrentSprintDemo`** désormais `async`, awaitent le helper avant de générer le HTML de la Sprint Review (nouvel onglet) / d'ouvrir la modal Démo. Couvre boutons header Sprint/Kanban + Ctrl+K (`open-sprint-review`, `open-demo-mode`).
- **Page Sprint** ([sprint.js](squad-board/static/js/views/sprint.js)) : quand l'utilisateur sélectionne un sprint clos dans le picker, on injecte le snapshot JIRA (via le même cache partagé). Pendant le fetch, un spinner discret `⏳ Chargement JIRA…` apparaît à côté du picker. Le board, l'activity feed et les charts ré-affichent automatiquement avec les tickets fraîchement chargés.
- **Champs JIRA enrichis** dans la lite-transformation : `resolutiondate`, `created`, `updated` (utiles pour burndown rétrospectif et cycle time des sprints clos).
- **Impact perf** : pour un sprint clos jamais consulté, +1 appel JIRA paginé (cap 20 pages × 100 = 2000 tickets). Cachée ensuite — re-pick du même sprint = instantané. Sprint actif et futur : aucun changement.

## [3.10.77] - 2026-05-29

### Feat : Sprint & Kanban — chip "jours dans la colonne" sur chaque ticket (signal daily)
- Objectif : repérer en un coup d'œil les tickets stagnant dans la même colonne pour alimenter la discussion du daily.
- **Helper** ([utils.js daysInCurrentColumn](squad-board/static/js/utils.js)) — calcule l'ancienneté dans la colonne courante. Sources, par priorité :
  1. Dernier changement `status` dans `recentChanges` (= entrée dans la colonne actuelle).
  2. `startedDate` (mise en cours JIRA) si jamais re-déplacé.
  3. `updatedAt` (fallback faible).
  Retourne `{ days, sinceIso, source }` ou `null`.
- **Affichage** ([card.js](squad-board/static/js/components/card.js)) — chip discret en haut à droite de la carte (à côté de l'ID ticket), forme `⏱ Xj`, tooltip `"X jours dans cette colonne · depuis <source> (date)"`.
- **Zones de couleur** (signal d'action) :
  - 🟢 vert `ok` : 2-3j
  - 🟡 ambré `warn` : 4-6j
  - 🔴 rouge `crit` : ≥ 7j (bold pour appeler l'œil)
- **Masqué** dans 2 cas — pour éviter le bruit :
  - statut `done` (peu actionable en daily)
  - < 2j (ticket fraîchement déplacé)
- Aucune impact perf : `recentChanges` est déjà fetché à la sync (changelog expand). Couvre Sprint **et** Kanban via le composant partagé `renderCard`.

## [3.10.76] - 2026-05-29

### Fix : Sprint Review (page HTML) + modal Démo — respect du sprint sélectionné
- **Symptôme** : depuis la page Sprint, sélectionner un sprint passé/futur via le picker, puis cliquer "Sprint Review" ou "Mode Démo" → la page/modale ouvrait toujours le **sprint actif** au lieu du sprint sélectionné.
- **Cause** ([sprint_tickets_modal.js _resolveCurrentSprint](squad-board/static/js/components/sprint_tickets_modal.js)) : le helper appelait directement `getSprintForTeam(team, sprintInfo)` qui renvoie systématiquement le sprint actif, sans consulter `store.sprintPick` (introduit en [3.10.74]).
- **Fix** : `_resolveCurrentSprint()` priorise désormais `store.sprintPick` :
  1. Si un pick est défini → cherche le sprint correspondant dans `sprintInfo.teamSprints` (filtré par équipe si team ≠ 'all') et le retourne avec `isCurrent: chosen.state === 'active'` (le badge "EN COURS" reste cohérent).
  2. Sinon → fallback `getSprintForTeam` (sprint actif de l'équipe).
- **Impact** : couvre simultanément `openCurrentSprintReview()` et `openCurrentSprintDemo()` (utilisés par boutons du header Sprint/Kanban + Ctrl+K entries `open-sprint-review` et `open-demo-mode`). Idem pour un lien partagé `#sprint/<team>/<sprintName>` (puisque le hash hydrate `store.sprintPick`).

## [3.10.75] - 2026-05-29

### Fix : Modal détail cachée derrière la modale "Tickets sans assigné·e" (et autres alertes)
- **Symptôme** : depuis la modale Health ("Tickets sans assigné·e", "Bloqués", etc.), cliquer un ticket ouvrait la modale détail mais elle était cachée derrière.
- **Cause** : `.alert-modal-overlay` et `.modal-overlay` ont le même `z-index: 200` (var(--z-modal)). L'alert-modal est créée dynamiquement et insérée à la fin du DOM → naturellement au-dessus de `#modal-overlay` (qui est dans l'HTML statique). Quand on ouvre la modal détail, elle reste plus bas dans la pile visuelle.
- **Fix** ([alert_modal.js](squad-board/static/js/components/alert_modal.js)) — au clic sur `[data-open-ticket]`, on ajoute la classe `above-demo` sur `#modal-overlay` avant d'appeler `openTicketModal`. La règle `.modal-overlay.above-demo { z-index: 11000 }` (introduite en [3.10.48] pour le même cas avec la Demo) force la modal détail au-dessus.
- Mécanisme désormais réutilisé : si une autre modale du même niveau a le même souci, suffit d'ajouter `above-demo` avant `openTicketModal`.

## [3.10.74] - 2026-05-29

### UX : Sélecteur de sprint dans le hash — URL partageable
- Le sprint sélectionné via le picker en haut de la page Sprint est désormais reflété dans l'URL : `#sprint/<team>/<sprintName>` → lien partageable qui ouvre directement le bon sprint.
- **Implémentation** :
  - **State** ([state.js](squad-board/static/js/state.js)) : nouvelle clé `sprintPick: null` (synchronisée avec le hash).
  - **Lecture** ([sprint.js](squad-board/static/js/views/sprint.js)) : helpers `_getSprintPick()` / `_setSprintPick(name)` lisent/écrivent `store.sprintPick` (remplace l'ancienne variable de module `_selectedSprintName`).
  - **Hash push** ([app.js pushHash](squad-board/static/js/app.js)) : pour `view === 'sprint'`, ajoute `/<sprintName>` après le team (encodé via `encodeURIComponent`). Si team='all' et qu'on a un pick → format `/all/<sprintName>` pour préserver la position du segment.
  - **Hash apply** ([app.js applyHash](squad-board/static/js/app.js)) : `parts[2]` sur view 'sprint' → `store.set('sprintPick', decoded)`. Si pas de `parts[2]` → reset à null (revient au sprint actif).
  - **Wireup picker** : `change` et clic `↺ Reset` appellent `_setSprintPick(...)` + `window.__squadBoard.pushHash()` → l'URL se met à jour immédiatement.
- L'URL devient un lien direct vers le sprint choisi (utile pour partager une review d'un sprint passé, par exemple).

## [3.10.73] - 2026-05-29

### Fix : Page Sprint — alertes "Sprint à X% du temps" muettes sur les sprints passés
- **Symptôme** : sur un sprint sélectionné d'il y a 4 mois, alerte "Sprint à 723% du temps mais seulement 0% des points" — non pertinent et bruyant.
- **Cause** ([infopanel.js getSprintAlerts](squad-board/static/js/components/infopanel.js)) : le `timePct` n'était pas borné. Le ratio `(now - start) / (end - start)` peut atteindre 800-900% pour un sprint de 14 jours vieux de 4 mois. Toutes les alertes "temps vs pts" se déclenchaient même hors période active.
- **Fix** :
  - **`timePct` borné** à `[0, 100]` (cohérence avec l'affichage de la card sprint déjà borné).
  - Calcul du statut temporel : `isActive` (now ∈ [start, end]), `isFuture` (now < start), `recentlyEnded` (< 7j après fin).
  - **Alertes "temps vs pts" déclenchées UNIQUEMENT si `isActive`** : aucune pertinence sur un sprint terminé ou futur.
  - **Alerte "Sprint terminé"** désormais affichée seulement si fin < 7j (au lieu de toujours pour `timePct >= 100`). Évite le bruit "Sprint terminé - pensez à la démo et à la rétro" sur un sprint d'il y a 4 mois.

## [3.10.72] - 2026-05-29

### UX : Ctrl+K — entrée "Ouvrir la modale Démo" plus facile à trouver
- L'entrée `open-demo-mode` existait déjà mais ses mots-clés (`demo presentation tv fullscreen sprint review`) ne couvraient pas les recherches utilisateur courantes (`modal`, `modale`, `ouvrir`, `écran`, `plein écran`…).
- **Fix** ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js)) :
  - **Label** : `Mode Démo fullscreen…` → `Ouvrir la modale Démo (présentation TV fullscreen)` — démarre par "Ouvrir" (verbe d'action) et inclut "modale" (terme cherché).
  - **Mots-clés** enrichis : `demo démo modal modale ouvrir afficher presentation présentation tv écran fullscreen plein sprint review burnup velocity vélocité mood fist` — couvre les recherches en FR/EN, par contenu (burnup, vélocité, mood), et par contexte (sprint review).
  - Idem pour `open-sprint-review` (ajout de `ouvrir modale` aux mots-clés).
- Désormais une recherche `modal`, `démo`, `écran`, `présentation` ou `burnup` retrouve l'entrée.

## [3.10.71] - 2026-05-29

### Feat : Page Sprint — sélecteur de sprint (PI N-1 / N / N+1) + WIP Age transparent
- **Sélecteur de sprint** en haut de la page Sprint ([sprint.js](squad-board/static/js/views/sprint.js)) :
  - Liste déroulante avec **groupes `<optgroup>`** par PI : `PI N-1 · précédent`, `PI N · courant`, `PI N+1 · à venir`
  - Badge état devant chaque sprint : `●` actif, `✓` clôturé, `○` à venir
  - **Sprint actif sélectionné par défaut**. Le choix de l'utilisateur est en variable de module (reset à chaque reload).
  - Bouton `↺ Sprint actif (XXX)` apparaît si on a basculé sur un autre sprint pour revenir rapidement.
  - Source : `sprintInfo.teamSprints` (déjà fourni par la sync JIRA, filtré par équipe sélectionnée + dédup par nom si team='all').
  - Si moins de 2 sprints dispo → sélecteur masqué (pas pollution UI).
- **WIP Age** ([charts.js renderWIPAge](squad-board/static/js/components/charts.js)) :
  - **Tooltip enrichi** par barre : `Age : Xj (critique 🔴) · Démarré le YYYY-MM-DD (mise en cours / création / fallback) · Statut · Lead · Seuils utilisés · Référence (p85 calculé OU fallback fixe)`.
  - **Coloration claire** : 🟢 vert OK · 🟡 ambré attention (≥ 70% p85) · 🔴 rouge critique (≥ p85).
  - **Fallback** quand p85 non calculable (< 3 tickets done) : seuils fixes 🟡≥7j / 🔴≥14j (Kanban classique).
  - **Légende sous le chart** : 3 swatches avec leurs significations affichées en permanence (plus besoin de deviner).
  - Tooltip dans le card-header `ⓘ comment ça marche` qui explique le calcul (`age = jours depuis mise en cours`, seuils, etc.) au survol.
  - Identique sur la vue Kanban (légende compacte).

## [3.10.70] - 2026-05-29

### UX : Sprint Review — "À reporter" trié par statut puis feature
- La section `🔄 À reporter au prochain sprint` était une liste plate non triée → difficile de scanner.
- **Tri intelligent** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) :
  1. **Statut** : `blocked` → `inprog` → `review` → `test` → `todo` → autres
  2. **Feature parente** (alpha) au sein de chaque statut
  3. **Points décroissants** (les gros tickets d'abord)
- **Regroupement visuel** par statut, réutilise le composant `.wins-group` (bordure gauche colorée par catégorie) :
  - 🚫 Bloqués (rouge) — priorité absolue
  - 🔄 En cours (bleu)
  - 👁 En review (violet)
  - 🧪 En test (ambré)
  - ⏸ À faire (gris)
- Compteur par groupe. Groupe vide → masqué. Permet de viser directement les blockers en réunion sans scroller.

## [3.10.69] - 2026-05-29

### Fix : Modal Demo — background gradient s'étend jusqu'en bas même au scroll
- `.demo-mode-bg` était positionné en `absolute inset: 0` dans `.demo-mode-overlay` (position fixed) → couvrait uniquement le viewport. Quand le contenu débordait et qu'on scrollait, le bas du contenu apparaissait sur fond uni `#0f172a` sans les radial-gradients.
- **Fix** :
  - HTML ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) : `.demo-mode-bg` déplacé **dans** `.demo-mode-content` (qui grandit avec le scroll).
  - CSS ([views.css](squad-board/static/css/views.css)) : `.demo-mode-bg` reste `position: absolute` mais à l'intérieur de `.demo-mode-content` (déjà `position: relative`) → couvre toute la hauteur scrollée. `pointer-events: none` pour ne pas bloquer les clics, `z-index: 0`. Les autres enfants directs (`> *:not(.demo-mode-bg)`) reçoivent `position: relative; z-index: 1` pour passer au-dessus.

## [3.10.68] - 2026-05-29

### UI : Modal Demo Réalisations — passage de grid à CSS multi-column
- `.demo-wins-grid` n'est plus en `display: grid` mais utilise **CSS multi-column** (`column-count: 3` · `column-gap: 8px` · `column-fill: balance`).
- Les cards remplissent désormais la **colonne 1 d'abord** (du haut vers le bas), puis la colonne 2, etc. — au lieu de la distribution row-major du grid (row1: col1/col2/col3, row2: …).
- `.demo-win-card` : `break-inside: avoid` (ne se coupe pas entre 2 colonnes), `display: inline-block; width: 100%` (nécessaire dans une multi-column).
- Responsive : 3 cols → 2 cols ≤ 1400px → 1 col ≤ 900px.

## [3.10.67] - 2026-05-29

### UI : Modal Demo Réalisations — cards collées (zéro espace vertical)
- `.demo-wins-grid` : `gap: 0 8px` au lieu de `6px` (row-gap = 0, column-gap = 8px) → les cards d'une même colonne sont **contiguës**, l'utilisateur voit plus de tickets par hauteur.
- Hover ajusté : suppression du `translateY(-1px)` (créait un chevauchement visuel avec la card du dessus), remplacé par un changement de **fond bleuté + bordure primary** + `z-index: 1` pour faire ressortir la card survolée sans la déplacer.

## [3.10.66] - 2026-05-29

### UI : Modal Demo Réalisations — cards compactées (gain ~40% de hauteur)
- Espace excessif entre les tickets de "🏆 Réalisations" — compacté à plusieurs niveaux ([views.css](squad-board/static/css/views.css)) :
  - `.demo-wins-grid` : `gap: 12px → 6px` · `padding: 4px → 2px`
  - `.demo-win-card` : `padding: 14px 16px → 7px 10px` (vertical -50%) · `border-radius: 12 → 8` · transition plus courte
  - `.demo-win-top` : `margin-bottom: 8 → 3` · `gap: 8 → 6`
  - `.demo-win-icon` : `20 → 16 px`
  - `.demo-win-key` : `12 → 11 px`
  - `.demo-win-pts` : `padding: 2/10 → 1/8` · `font-size: 14 → 12`
  - `.demo-win-title` : `font-size: 14 → 13` · `line-height: 1.4 → 1.3`
  - `.demo-win-parent-chip` : `padding: 3/9 → 1/8` · `margin-top: 6 → 3` · `font-size: 11 → 10`
- Chaque card est ~30 % moins haute, le grid est plus dense → 4-5 cards visibles d'un coup d'œil sans scroller au lieu de 2-3.
- Hovers raccourcis (translate -1px au lieu de -2px) — plus subtil, cohérent avec la taille réduite.

## [3.10.65] - 2026-05-29

### Fix : Modal Demo — scroll autorisé si contenu déborde (petits écrans / Wins très haut)
- Le fix [3.10.59] avait mis `overflow: hidden` sur `.demo-mode-content` → impossible de voir le bas (burnup + vélocité PI) sur petits écrans / écrans avec beaucoup de PI Objectives.
- **Fix** :
  - [views.css](squad-board/static/css/views.css) `.demo-mode-overlay` : `overflow-y: auto` (+ `overflow-x: hidden`) → scroll vertical au niveau de l'overlay fullscreen si le contenu dépasse la viewport. `-webkit-overflow-scrolling: touch` pour scroll fluide iOS.
  - `.demo-mode-content` : passe de `height: 100%` à `min-height: 100%` (peut grandir au-delà), retire le `overflow: hidden`.
  - `.demo-2col` : `flex: 1 1 auto` (au lieu de `1 1 0`) → prend sa taille naturelle, ne shrink pas indéfiniment.
  - `.demo-burnup-chart` : `min-height: 200px` (au lieu de `0`) — garantit qu'il est toujours lisible, même quand on doit scroller.
- **Comportement** :
  - **Grand écran** : tout fit, aucune scrollbar visible (gain UX du fit screen préservé).
  - **Petit écran ou contenu volumineux** : scroll global de l'overlay → l'utilisateur voit tout (burnup, vélocité PI, réalisations).

## [3.10.64] - 2026-05-29

### UI : Page Sprint — header restructuré (progress en bas pleine largeur, quick-actions à droite des stats)
- Avant : la progress bar était sous les stats dans la colonne droite, et les quick-actions (📋 Review + 📺 Demo) étaient empilées en dessous.
- Refonte ([sprint.js](squad-board/static/js/views/sprint.js) + [views.css](squad-board/static/css/views.css)) :
  - **Quick-actions à droite des stats** : la colonne stats passe en `flex-direction: row` avec `justify-content: space-between` → les stats restent à gauche, les boutons sont collés à droite sur la même ligne.
  - **Progress bar full-width en bas** : `<div class="progress sprint-progress-full">` sortie de la colonne stats et placée en sibling du `.sprint-header--2col` avec `grid-column: 1 / -1` (span sur les 2 colonnes).
- La page Sprint se compacte verticalement (header plus dense) et la progress est plus visible (pleine largeur visuelle).

## [3.10.63] - 2026-05-29

### Fix : Page Sprint — Sprint Goal ne se tronque plus
- `.sprint-header--2col .sprint-goal-bar` avait `white-space: nowrap` + `text-overflow: ellipsis` → le goal était coupé à `…` sur une ligne.
- Remplacé par `white-space: pre-wrap` + `word-break: break-word` + `line-height: 1.4` → le goal s'affiche en intégralité, wrap sur plusieurs lignes si nécessaire. Padding vertical légèrement augmenté (4px → 6px) pour la respiration.

## [3.10.62] - 2026-05-28

### Fix : Lien "🚀 PI N+1" Sprint Review — JQL `sprint IN ("PI#N+1")` au lieu de `fixVersion`
- Le bouton `🚀 PI {N+1}` pointait sur `/projects/G/queues?jql=fixVersion=PI30` — dépendait d'un projet inexistant (`G` extrait du nom d'équipe) et utilisait `fixVersion` qui n'est pas la convention de planification SAFe locale.
- **Fix** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) — nouveau JQL : `sprint IN ("PI#30")` (convention features SAFe, cf. CLAUDE.md). URL pleine `/issues/?jql=...` (au lieu de `/projects/.../queues`) — la recherche issue globale Jira fonctionne sur tous les projets sans préfixe. JQL encodé via `encodeURIComponent`.
- Tooltip enrichi : affiche le JQL exact qui sera exécuté (`&#10;` pour saut de ligne dans `title`).

## [3.10.61] - 2026-05-28

### UX : Météo équipe — tooltip transparent avec breakdown du calcul
- Le tooltip de la card Météo affichait juste `mood X/5 · N bloqués · scope creep N` — on ne savait pas comment le score `/100` était calculé.
- **Détail complet** ([dashboard.js](squad-board/static/js/views/dashboard.js)) — le tooltip liste maintenant chaque pénalité ligne par ligne avec l'opération appliquée :
  ```
  MÉTÉO ÉQUIPE — 65/100  (Quelques nuages)

  Score de base : 100
  🚫 Blockers : 2 (> 0)  →  -10
  ✅ Scope creep : 1  →  ±0
  🎭 Mood : 3.2/5 (< 3.5)  →  -10
  ✅ Vélocité : 32/40 pts (80% cible)  →  ±0

  Seuils : ☀️ ≥85  ·  ⛅ ≥65  ·  🌧️ ≥45  ·  ⛈️ <45
  ```
- Chaque ligne montre la valeur observée, le seuil franchi (ou pas), et l'impact sur le score. Les seuils d'icône (☀️/⛅/🌧️/⛈️) sont rappelés en bas.

## [3.10.60] - 2026-05-28

### Fix : Sync JIRA — descriptions ActionRetro tronquées (paragraphes manquants au début)
- **Diagnostic** : sur GDEM-4071, la description JIRA contenait 3 nodes ADF (paragraphe `💥 Problématique :` + paragraphe `👉 But :` + bulletList) mais seul le `<ul>` apparaissait en local. Investigation via curl proxy : le nouvel endpoint **JIRA Cloud `/rest/api/3/search/jql` ne renvoie PAS le champ `description`** même quand on le demande explicitement (limitation API non documentée).
- **Fix** ([sync.js passe Amélioration](squad-board/static/js/sync.js)) — `fields: '*all'` au lieu de la liste explicite pour la passe Amélioration continue (qui couvre les ActionRetro / Retro / Postmortem / CoP). Payload plus lourd mais volume faible (~50 tickets max). Garantit que la description complète arrive.
- **Note pour ajouter** : si d'autres types de tickets ont besoin de leur description complète, étendre `*all` aux passes correspondantes.

### Feat : Sprint Review HTML — PNG, PDF, Décisions éditables, lien PI Planning suivant
- **Bouton 📷 PNG** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) — html2canvas chargé à la demande via CDN, capture pleine page + download automatique. Nommage du fichier : `sprint-review-<sprint-slug>.png`.
- **Bouton 🖨 PDF** — déclenche `window.print()`. Le `@media print` existant produit déjà un PDF propre.
- **Section "Décisions" éditable** — `contenteditable=true` sur `.notes-zone`, persistance localStorage par sprint name (`cr-decisions-<sprint>`), debounce 400 ms. Placeholder italique si vide.
- **Bouton 🚀 PI {N+1}** — lien direct vers Jira `queues?jql=fixVersion=PI{N+1}` pour amorcer le PI Planning suivant. Affiché uniquement si `piInfo.number` est défini.

### Feat : Ctrl+K — 7 templates Slack par rituel
- 7 nouvelles entrées dans la command palette ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js)) : `🌅 Daily standup`, `🎬 Sprint Review / Démo`, `🔁 Rétrospective`, `🚨 Blocker / besoin d'aide`, `🎭 Mood Meter`, `✊ Fist of Five`, `🚀 PI Planning à venir`.
- Helper `_copySlackTpl(kind)` génère un message **texte brut** (pas de mrkdwn) avec variables auto : nom sprint actif, équipe, date du jour. Copie automatique dans le presse-papier + toast.

### Feat : Dashboard — Météo équipe + Mood/Fist chips + "Cette semaine"
- **Météo équipe** ([dashboard.js](squad-board/static/js/views/dashboard.js)) — 5e card metric (☀️/⛅/🌧️/⛈️) avec score `/100` calculé à partir de : blockers (-25 si >3, -10 si >0), scope creep (-20 si >5, -10 si >2), mood moyen (-25 si <3, -10 si <3.5), vélocité vs cible (-15 si <50%). Labels : Tout va bien / Quelques nuages / Pluie battante / Orage.
- **Mood/Fist chips** dans le sprint-header — pattern identique à la Modal Demo, filtre tolérant sur `piSprint`. Border-color liée à la valeur (vert/orange/rouge selon seuil).
- **Section "Cette semaine"** ([dashboard.js](squad-board/static/js/views/dashboard.js)) — 5 cards horizontales (J-4 à J0) avec : nombre de tickets résolus chaque jour + points associés. Intensité du fond proportionnelle au volume (gradient sur var(--success)). Card du jour mise en avant avec border primary + halo.
- (Burndown live + RUN/BUILD #3 reportés — demandent une convention de label `run`/`build` à confirmer avec l'équipe avant impl.)

### Feat : Health — courbe historique du score sur 3 mois
- `HEALTH_HIST_MAX` étendu de 30 à **90 jours** (1 snapshot/jour, persistance localStorage `sb-health-history`).
- Nouvelle card `📈 Évolution sur N jours` ([health.js](squad-board/static/js/views/health.js)) entre la capacité et les cards d'anomalies.
- **KPIs** : moyenne, min, max, delta vs premier point (avec ↗/↘ et badge coloré).
- **SVG inline** (pas de Chart.js, plus léger) — courbe area + ligne avec :
  - 4 bandes de fond (good ≥80 / ok ≥60 / warn ≥40 / bad <40) pour interpréter le niveau au coup d'œil
  - Lignes pointillées sur 0, 50, 100
  - Point final mis en valeur avec halo blanc
  - Labels de dates aux extrémités (jj-mm)
  - Gradient bleu pour l'aire

## [3.10.59] - 2026-05-28

### UI : Modal Demo — fit hauteur viewport (seul .demo-wins-grid scrolle)
- **Garanties** :
  - `.demo-mode-content` : `overflow: hidden` + `display: flex column` + `height: 100%` — jamais de scroll global, peu importe le device.
  - Sections fixes (`header`, `.demo-stats`, `.demo-pi-objectives`, `.demo-footer`) → `flex-shrink: 0`.
  - `.demo-2col` → `flex: 1 1 0; min-height: 0` (prend tout le reste).
  - `.demo-wins-grid` → seule à scroller (overflow-y: auto, déjà présent).
- **Cap PI Objectives** : `max-height: 28vh` + scroll interne fin (4 px) si beaucoup d'objectives — évite qu'ils écrasent le 2col.
- **Burnup chart** : `min-height: 0` (au lieu de `280px`) qui forçait un scroll global sur écrans bas. La min-height de 240 px ne s'applique plus que ≥ 800 px de viewport.
- **Padding compressé** : `28/40/16` (au lieu de `48/56/32`) → -36 px gagnés en hauteur sur toutes tailles.
- **Responsive serré** :
  - `@media (max-height: 720px)` → padding `20/28/12`, gap réduit, stats compactes, PI obj cap à `22vh`.
  - `@media (max-width: 900px)` → padding `18` côté.

## [3.10.58] - 2026-05-28

### UI : Modal Demo — Mood inline dans la goal-card, Fist inline avec pi-summary
- Suppression de la section dédiée `🎭 Climat équipe` (devenue redondante avec le nouvel emplacement contextuel).
- **🎭 Mood Meter** déplacé dans la **goal-card** (chip discret en bas), juste sous le sprint goal — l'humeur d'équipe à côté de l'objectif qu'on a poursuivi : sens visuel. Si pas de goal mais Mood présent → label `Aucun objectif explicite` + Mood en dessous, la card reste utile.
- **✊ Fist of Five (confiance PI)** déplacé inline à droite de la **pi-summary**, dans le h2 de `🎯 PI Objectives` — emplacement sémantique (confiance dans les objectifs du PI).
- **Style discret** ([views.css](squad-board/static/css/views.css)) — chips arrondis (`border-radius: 999px`) avec :
  - Icône (🎭 ou ✊) + face emoji (Mood) + valeur en gras (`4.2/5`) colorée par seuil
  - **5 mini-bars** verticales ultra-compactes (4 px de large, 14-16 px de haut) montrant la distribution proportionnelle au max
  - Compteur de votes séparé par une bordure verticale subtile
  - Fond `rgba(255,255,255,0.05)` + bordure faible → s'intègre sans dominer
- Tooltips par mini-bar pour le détail (`🙂 4/5 : 3 votes` / `4/5 (Confiant) : 3 votes`).

## [3.10.57] - 2026-05-28

### UI : Climat équipe (Modal Demo) — layout compact horizontal
- Le précédent layout des cards Mood/Fist était vertical (score géant centré + 5 lignes de distribution empilées) → prenait ~140 px de hauteur par card. Trop sur la modal Demo.
- **Refonte** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) + [views.css](squad-board/static/css/views.css)) — layout **horizontal compact** (~52 px par card) :
  - `[Icône] Titre + count`   (à gauche)
  - `[Face emoji] 4.2/5`  (score inline au milieu)
  - `[5 mini-bars verticales]` (distribution à droite, 38 px haut, une barre par valeur 1-5 avec count en haut + label en bas)
- Les mini-bars : hauteur proportionnelle au max de la distribution (au lieu du % du total) → mieux différencier les valeurs faibles.
- Tooltips par barre (`Mood : 4/5 : 3 votes` ou `Fist : 4/5 (Confiant) : 2 votes`).
- Padding réduit, font-sizes réduites, h2 plus compact (`14px` au lieu de `16px`).
- Layout préservé sur la Sprint Review HTML (palette papier, distribution lisible en print) — la refonte ne touche que la Modal Demo.

## [3.10.56] - 2026-05-28

### UI : Climat équipe forcé sur 2 colonnes (Mood gauche · Fist droite)
- `.demo-climate-grid` (modal Demo) et `.vote-grid` (Sprint Review HTML) passent de `auto-fit minmax(260px, 1fr)` à `1fr 1fr` — les 2 cards Mood et Fist of Five sont **toujours côte à côte** (au lieu de potentiellement empilées sur écran intermédiaire).
- Responsive : sous 760px (Demo) / 700px (Review HTML) → retour à 1 colonne pour mobile.
- Fist of Five reste explicitement labellisé `Fist of Five — confiance PI` (lien sémantique avec les PI Objectives).

## [3.10.55] - 2026-05-28

### Fix : Mood absent + Climate chevauchait la sparkline vélocité (Modal Demo)
- **Bug #1 — Mood ne s'affichait pas** dans la page Sprint Review (seul Fist apparaissait) : le filtre `v.piSprint === _sprintLabel` était trop strict. Le champ `piSprint` des votes peut contenir `"29.3"`, `"Fuego - Ite 29.3"`, `"PI#29"` selon la saisie utilisateur — un seul format passait le filtre par hasard pour les fistVotes mais pas pour les moodVotes.
  - **Fix** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) — helper `_matchVoteSprint(vps)` tolérant :
    1. `vps === sprint.name` (exact)
    2. `vps === sprintLabel` ou `vps.includes(sprintLabel)` (match partiel sur `29.3`)
    3. Inclusion bidirectionnelle (`vps.includes(sprint.name)` ou `sprint.name.includes(vps)`)
  - Appliqué dans `_buildSprintReviewHtml` ET `openDemoMode` (helpers `_matchVoteSprint` / `_matchDemoVoteSprint`).
  - Log console `[SprintReview] mood=N fist=M sprint="..." label="..." team="..."` pour diagnostic rapide.
- **Bug #2 — Climate chevauchait la sparkline vélocité PI** dans la modal Demo : la section `.demo-climate` était positionnée **après** le `.demo-2col` (qui a `flex: 1` et prenait toute la hauteur disponible). Résultat : Climate poussé en dehors du viewport ou superposé visuellement avec la sparkline en bas du panel Burnup.
  - **Fix** — Climate déplacé **avant** le `.demo-2col` (juste après PI Objectives, juste avant Burnup + Wins). Hiérarchie verticale claire :
    1. Header
    2. Stats
    3. PI Objectives
    4. **🎭 Climate** (nouveau placement)
    5. 2col Burnup ↔ Wins
  - Plus de chevauchement, le flow vertical reste linéaire.

## [3.10.54] - 2026-05-28

### Feat : Réalisations fusionnées + Mood/Fist intégrés (Demo, Sprint Review, Slack)
- **Fusion des 3 groupes Réalisations** (Tickets + Buffer + Actions rétro) en **un seul bloc plat** trié par feature parente :
  - **Sprint Review HTML** : un seul `<ul class="cr-tickets-merged">` au lieu des 3 groupes empilés. Badges récap dans le titre (`🏆 Réalisations [N tickets · X pts] [🛡️ Buffer Y/Z] [🔁 Retro N]`).
  - **Slack copier** : un seul bloc `🏆 Réalisations (N tickets · X pts) · 🛡️ Buffer Y/Z · 🔁 Retro N` puis liste plate (top 15).
  - **Modal Demo** : les cards `.demo-win-card` sont mélangées dans une seule grille à 3 colonnes (déjà en place), avec un **tag inline** `🛡️` ou `🔁` à côté de la clé pour identifier la catégorie. Plus de sections `.demo-wins-group-*`.
- **Climat équipe (Mood + Fist) intégré** dans les 3 sorties :
  - **Filtrage** : votes filtrés par `sprintLabel` (extrait par regex `\d+\.\d+`) et `team` (si différent de `'all'`).
  - **Stats calculées** : moyenne (1 décimale), nombre de votes, distribution par valeur 1-5.
  - **Modal Demo** : section `🎭 Climat équipe` en pleine largeur sous le grid 2-col. Card par vote-type avec score géant (avec emoji-face pour le mood), distribution barres horizontales colorées (vert ≥4, orange ≥3, rouge <3), et labels Fist (`Pas confiance / Inquiet / Mitigé / Confiant / Très confiant`).
  - **Sprint Review HTML** : section `🎭 Climat de l'équipe` avec le même rendu (palette claire pour print).
  - **Slack** : résumé compact `🎭 Climat équipe / • Mood : 🙂 4.2/5 (8 votes) / • Fist of Five (confiance PI) : 3.8/5 (8 votes)`.
- **CSS** ([views.css](squad-board/static/css/views.css) + inline Sprint Review) : `.demo-vote-card/.vote-card`, `.demo-vote-dist/.vote-dist`, `.demo-win-tag--buffer/--retro` (badges inline sur les cards Réalisations).

## [3.10.53] - 2026-05-28

### UX : Copier Slack — liens JIRA cliquables + tirets simples
- **Tickets cliquables** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) : chaque clé de ticket devient un lien Slack `<jiraUrl/browse/ID|ID>` (format interprété par Slack même au paste, contrairement au mrkdwn). Le user clique directement sur la clé pour ouvrir le ticket JIRA.
- Helper `_slackKey(id)` qui produit `<URL|ID>` si `jiraBase` est configuré, sinon retourne l'ID brut (fallback gracieux).
- **Tirets longs `—` remplacés par `-`** partout dans le texte Slack (header, métriques titres, lignes de tickets, "À reporter", etc.) — plus lisible et conforme à la demande.
- `…` (ellipse Unicode) remplacé par `...` (3 points ASCII).

## [3.10.52] - 2026-05-28

### Fix : Copier Slack — texte brut (pas de mrkdwn, Slack n'interprète pas au paste)
- Le bouton "Copier pour Slack" produisait du mrkdwn (`*gras*`, `_italique_`, `` `code` ``) — mais Slack n'interprète ces marqueurs **qu'à la frappe**, pas au paste. Résultat : les caractères `*` `_` apparaissaient littéralement dans le message.
- **Fix** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) — réécriture en **texte brut pur** :
  - Suppression de tous les `*` `_` `` ` `` `>` (blockquote)
  - Aération via emojis, sauts de ligne et **indentation 3 espaces** pour les sous-items
  - Listes avec `   • ` (bullet U+2022)
  - `🚨` Unicode au lieu du `:rotating_light:` shortcode
- L'utilisateur peut désormais coller directement dans Slack sans nettoyage manuel. Pour mettre en gras des passages, il fait Ctrl+B à la frappe.

## [3.10.51] - 2026-05-28

### Feat : Sprint Review — bouton "Copier pour Slack" en haut (résumé aéré, mrkdwn)
- Nouvelle toolbar **sticky** en haut de la page Sprint Review avec un bouton aux couleurs Slack (purple `#4A154B`).
- Au clic, copie dans le presse-papier un **résumé Slack-friendly aéré** (Slack mrkdwn — `*gras*`, `_italique_`, `\`code\``, `• puces`) :
  - Titre + équipe + dates
  - 🎯 Sprint Goal (en blockquote)
  - 📊 Métriques (vélocité, % terminés, buffer)
  - 🎯 PI Objectives summary (N/M livré, BV, Predictability%)
  - 📈 Vélocité PI (moy. clos, record, vs cible)
  - 🏆 Réalisations par groupe (🎫 Tickets / 🛡️ Buffer / 🔁 Actions rétro) — **top 5** par groupe + `…et N autres` si plus
  - 🔁 Actions rétro non clôturées (top 10) à passer en revue
  - 🔄 À reporter (avec mention `:rotating_light:` si blockers non résolus)
  - ⚠️ À discuter en rétro OU 👍 Sprint propre
- **Feedback visuel** : le bouton bascule en vert `✓ Copié dans le presse-papier !` 2.4s puis revient à son état initial. En cas d'erreur clipboard : `Copie impossible` rouge.
- Implémentation 100% **self-contained** : la string est générée au build du HTML et embarquée via `JSON.stringify` dans un `<script>` inline. Pas de dépendance externe au moment où la page s'ouvre.
- `@media print { .cr-toolbar { display: none } }` — le bouton ne pollue pas l'impression.

## [3.10.50] - 2026-05-28

### Feat : Sprint Review — section "Actions rétro à passer en revue" dépliable
- Nouvelle section ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) insérée **au-dessus** de `🔄 À reporter au prochain sprint` :
  - Titre `🔁 Actions rétro à passer en revue (N)` avec intro `« Tour de table : où en est-on sur chaque action issue des rétros précédentes ? »`
  - Liste **toutes les ActionRetro du sprint** (peu importe le statut), triées : pas-encore-done d'abord (en cours, bloquées, à faire), done à la fin — facilite l'ordre du tour de table.
  - Chaque item est une card avec **header en ligne** : badge statut coloré (`✓ Terminée` vert, `✗ Bloquée` rouge, `● En cours` bleu, `○ À faire` ambré), lien JIRA, titre, owner, chip feature parente.
  - **Card colorée par statut** (fond + bordure gauche 4px) — repérage visuel rapide.
- **Description dépliable** : chaque item a un `<details>` `📝 Voir la description` (fermé par défaut pour ne pas alourdir la lecture) :
  - Chevron animé (`▸` → `▾`) à l'ouverture
  - Contenu en serif Georgia (cohérent avec le style document) sur fond blanc avec bordure
  - `white-space: pre-wrap` + `word-break: break-word` pour préserver mise en forme et URLs longues
  - Support natif pour HTML (description parsée par JIRA sync) ET texte brut (les retours à la ligne sont conservés)
- L'utilisateur peut déplier les descriptions une par une pendant la review ou ouvrir toutes avant impression.

## [3.10.49] - 2026-05-28

### Feat : Sprint Review HTML enrichie (parité avec la Modal Demo)
- La page Sprint Review (compte-rendu Confluence-ready ouvert en nouvel onglet) gagne **3 nouvelles sections** synchronisées avec le mode Démo :
  - **🎯 PI Objectives** ([sprint_tickets_modal.js _buildSprintReviewHtml](squad-board/static/js/components/sprint_tickets_modal.js)) — grid des objectives du PI courant filtrés par équipe (ou tous si team=all). Code couleur par statut (done=vert gradient avec ✓ cerclé, inprog=bleu, blocked=rouge, stretch=dashed). Badge récap : `✓ N/M · BV livrée X/Y · Predictability %`. Badge BV ambré→orange sur les done.
  - **📈 Vélocité PI** — mini velocity-card avec KPIs (moy. clos, ⭐ record, 🎯 vs cible) + **sparkline horizontal** (style barres avec dégradés vert/bleu/ambré). Sprint actif détecté → vélocité **live** calculée depuis les tickets locaux (cf. fix [3.10.47]). Sprint de respiration marqué 🍃. Légende avec 5 swatches.
  - **🏆 Réalisations regroupées** (au lieu de liste plate) en 3 groupes : `🎫 Tickets` (bleu), `🛡️ Buffer` (violet), `🔁 Actions rétro` (orange). Filtres exclusifs (ActionRetro prioritaire). Compteur + total points par groupe. Tickets **triés par feature parente** (alpha). Chaque ticket affiche une **chip feature parente** discrète (🧭 nom complet non tronqué).
- **Helpers communs** entre Demo et Review (résolution feature parente, calcul vélocité live, identification sprint respiration) — code dupliqué pour rester self-contained dans le HTML offline (pas de dépendance externe au moment d'ouvrir dans Confluence).
- **CSS print-friendly** : palette claire (compatible papier/Confluence), `break-inside: avoid` sur cards/objectives/wins-group, sparkline reste lisible en N&B.
- **Pas de Chart.js** : tout est SVG/divs inline-block — la page reste autonome (blob URL).

## [3.10.48] - 2026-05-28

### Fix : Modal ticket s'ouvrait derrière la modal Demo (conflit z-index)
- **Symptôme** : cliquer une clé de ticket ou une chip parente dans les Réalisations du sprint ouvrait la modal détaillée **derrière** la modal Demo (fullscreen dark).
- **Cause** : `.demo-mode-overlay` z-index `10000` vs `.modal-overlay` z-index `200` (`var(--z-modal)`).
- **Fix** :
  - [sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) — au click ticket depuis la Demo, on ajoute la classe `above-demo` au `#modal-overlay` avant d'appeler `openTicketModal`.
  - [base.css](squad-board/static/css/base.css) — nouvelle règle `.modal-overlay.above-demo { z-index: 11000 }` qui force la modal détail au-dessus de la Demo (10000 < 11000).

## [3.10.47] - 2026-05-28

### Fix : Modal Demo — vélocité live pour le sprint en cours (sprint actif = 0 affiché)
- **Symptôme** : sur Gabbiano, la barre du sprint en cours affichait `0 pts` alors que plusieurs tickets étaient en `Terminé` ou `À livrer en Préprod` (statuts mappés vers `done` côté frontend).
- **Cause** : `teamSprints[].velocity` est rempli côté sync.js depuis l'endpoint JIRA Greenhopper `/board/{id}/velocity` qui ne renseigne `completed.value` **qu'à la clôture du sprint**. Pour un sprint actif, l'API renvoie 0 → la barre affichait 0.
- **Fix** ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) — calcul **live** pour chaque sprint sans vélocité JIRA :
  ```
  liveDone = tickets.filter(t.sprintName === s.name && t.status === 'done' && t.team === s.team)
                    .reduce((sum, t) => sum + t.points, 0)
  ```
  Si > 0, on remplace `s.velocity` et on marque `s._live = true`. Les sprints clôturés gardent la valeur JIRA (préservée).
- **Tooltip enrichi** : `12 pts (calculé live depuis les tickets)` quand la vélocité est dérivée localement, vs `12 pts` quand elle vient de JIRA.
- Couvre aussi le cas où le sprint courant a tous ses tickets en `À livrer en Préprod` (mapping STATUS_MAP → `done` déjà OK).

## [3.10.46] - 2026-05-28

### UX : Modal Demo — vélocité dans la barre, sprint goal au hover, PI Objectives "wow"
- **Vélocité affichée dans la barre** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) + [views.css](squad-board/static/css/views.css)) — chaque barre du sparkline montre désormais le nombre de points :
  - Si la hauteur de la barre est ≥ 22 % → label `INSIDE` (texte blanc + text-shadow, en haut de la barre)
  - Sinon → label `ABOVE` (texte gris muted, au-dessus de la barre)
  - Tabular numerics, font-weight 700 pour alignement parfait
- **Sprint Goal dans le tooltip** — le `title` natif inclut maintenant `🎯 <goal>` sur une nouvelle ligne quand la rotation porte un goal. Format final : `nom · X pts · état\n🎯 goal`. Source : `teamSprints[].goal` déjà fourni par la sync JIRA.
- **PI Objectives "done" en mode wow** ([views.css](squad-board/static/css/views.css) `.demo-pi-obj.is-done`) :
  - Fond gradient triple-couche (vert → bleu en diagonale + radial top-right) → effet de profondeur
  - Bordure gauche **4px** (au lieu de 3) + box-shadow vert diffuse + inset highlight blanc
  - Hover : `translateY(-2px)` + ombre amplifiée (effet de soulèvement)
  - Icône ✓ dans un **cercle vert gradient** (24×24, font-weight 700) avec triple halo (ring + glow)
  - Badge BV en **gradient ambré→orange** (au lieu de jaune mat) avec ombre teintée
  - Texte en **blanc pur** + font-weight 600 (au lieu de vert pâle)
  - **Animation "shine sweep"** : un reflet diagonal traverse la card toutes les 3.4s (`@keyframes demo-shine`) — effet brillance subtil mais flatteur en mode présentation
- **Résumé objectives** en header (`.demo-pi-summary`) : badge vert `✓ N/M · BV livrée X/Y` à côté du titre, immédiate lisibilité.

## [3.10.45] - 2026-05-28

### UX : Modal Demo — mini velocity-card du PI sous le burnup (style dashboard) + 🍃 sprint de respiration
- Remplace la sparkline simple introduite en 3.10.44 par une **mini velocity-card** inspirée de la `velocity-card` du dashboard, adaptée au thème dark de la modal Demo.
- **KPIs en ligne** (basés sur les sprints clôturés du PI uniquement) : moy. clos, tendance (moy. 3 derniers vs 3 précédents, ↗/↘ + %), record ⭐ (meilleur sprint clos), stabilité (CV avec label Très stable / Stable / Variable / Instable), % vs cible 🎯 (si `piInfo.velocityTarget` défini). Chaque KPI a son badge coloré : primary/good/ok/warn/danger.
- **Sparkline barres** dégradées par état :
  - `--closed` : dégradé vert
  - `--current` : dégradé bleu + ring (sprint actif)
  - `--best` : dégradé ambré + glow (meilleur sprint)
  - `--breath` : dégradé vert clair + bordure 🍃 (sprint de respiration / IP)
  - `--future` : pointillé gris
- **Sprint de respiration** : le **dernier sprint du PI** (idx max ou `piInfo.sprintsPerPI`) est marqué `--breath` avec un badge 🍃 flottant au-dessus de la barre. Tooltip : `nom · pts · 🍃 Sprint de respiration (IP)`. Référence SAFe : le dernier sprint d'un PI est traditionnellement Innovation & Planning, dédié à la respiration et au cadrage du PI suivant.
- **Label en bas de chaque barre** : numéro du sprint (ex: `29.1`, `29.5`) — `font-variant-numeric: tabular-nums` pour alignement.
- **Légende** sous la sparkline avec 5 swatches (Clôturé / En cours / Record / 🍃 Respiration (IP) / À venir).

## [3.10.44] - 2026-05-28

### UX : Modal Demo — chips parent cliquables, clés ticket cliquables, sparkline PI sous burnup
- **Feature parente en chip discrète** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) — remplace l'ancienne ligne italique `↳ Nom`. Nouveau `<button class="demo-win-parent-chip">` avec icône 🧭, fond `rgba(255,255,255,0.04)`, bordure circulaire (radius 999px), couleur muted. Texte de la feature **non tronqué** (`white-space: normal`, `word-break: break-word`). Hover : tint violet `rgba(192,132,252)`.
- **Clés tickets cliquables** : `<span class="demo-win-key">` devient `<button class="demo-win-key--clickable">` (couleur bleue muted, hover light + lift). Wireup global `overlay.querySelectorAll('[data-ticket-id]')` → `window.__squadBoard.openTicketModal(id)`. La chip parente utilise le même hook (data-ticket-id = id de la feature).
- **Sparkline sprints du PI sous le burnup** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) + [views.css](squad-board/static/css/views.css) `.demo-pi-spark`) — inspiré de `.velocity-card .velocity-spark` du dashboard, adapté au thème dark de la modal Demo :
  - Filtre les `teamSprints` du PI courant (extraction via regex sur le nom du sprint affiché) ; dédup par nom si team='all'
  - Tri chrono, bars hauteur proportionnelle à `velocity`
  - États visuels par dégradé : **closed** (vert), **current** (bleu avec ring), **future** (gris hachuré)
  - Label à gauche : `PI N` + sous-label `X sprints · Y pts cumulés`
  - Tooltip par barre : `nom · pts · état`

## [3.10.43] - 2026-05-28

### UX : Modal Demo Réalisations — feature parente affichée discrètement + tri par feature
- **Retiré** : ligne `— [Nom du responsable]` sur chaque card (info redondante, déjà visible dans la modal ticket détaillée).
- **Ajouté** : ligne `↳ [Nom de la feature parente]` discrètement en bas de chaque card. Résolution via la chaîne `ticket.epic → epic.feature → feature.title` (avec fallback sur le titre de l'epic si pas de feature au-dessus).
- **Style discret** ([views.css](squad-board/static/css/views.css) `.demo-win-parent`) : font-size 11px, italique, couleur `#64748b` (gris foncé sur fond sombre), opacity 0.85. **Pas de troncature** (`white-space: normal`, `word-break: break-word`) — l'utilisateur voit le titre complet même s'il fait plusieurs lignes.
- **Tri par feature** dans chaque groupe (Tickets / Buffer / Actions rétro) : `localeCompare('fr', { sensitivity: 'base' })` sur le titre de la feature parente. Les tickets de la même feature se suivent → facilite la lecture lors du Sprint Review (« Voici tout ce qu'on a fait sur la feature X »). Les tickets sans parent sont relégués à la fin.

## [3.10.42] - 2026-05-28

### Fix : Burnup Modal Demo — textes blancs (lisibles sur fond foncé)
- Le chart Burnup utilisait `baseOpts()` qui lit les variables CSS — sur le fond foncé de la modal Demo (toujours dark, peu importe le thème de l'app), les axes/labels/légende étaient quasi invisibles.
- **Fix** ([charts.js renderBurnup](squad-board/static/js/components/charts.js)) — nouveau paramètre optionnel `opts.theme`. Si `'dark'`, on override les couleurs de ticks (`#cbd5e1`), grilles (`rgba(255,255,255,0.08)`) et légende (`#f1f5f9`). Les couleurs des datasets (lignes scope/done) restent inchangées (déjà visibles sur fond foncé).
- **Appel** ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) : `renderBurnup(..., sprintEvents, { theme: 'dark' })`.

## [3.10.41] - 2026-05-28

### UI : Modal Demo — Réalisations en 3 colonnes + stats compactes
- **Stats** ([views.css](squad-board/static/css/views.css) `.demo-stats`) plus compactes :
  - padding `24px → 12px`, margin-bottom `32px → 18px`, gap `48px → 32px`
  - `.demo-stat-val` font-size `clamp(40-64px) → clamp(28-44px)` ; label font-size `13px → 11px`
  - Libère ~60px de hauteur pour le contenu principal en dessous.
- **3 colonnes côte à côte pour Réalisations** :
  - `.demo-wins-grid` passe en `grid-template-columns: repeat(3, minmax(0, 1fr))` — les 3 groupes (Tickets / Buffer / Actions rétro) sont alignés horizontalement, **toutes les cards visibles d'un coup d'œil**.
  - `align-items: start` pour que les groupes restent collés en haut (pas étirés à la hauteur du plus haut).
  - Responsive : 3 cols → 2 cols sous 1400px → 1 col sous 900px.
  - `.demo-wins-group-cards` passe de grid à flex column (les cards d'un même groupe s'empilent verticalement).
- **Plus de place pour les wins** : grid principal passe de `1fr / 1.15fr` à `0.85fr / 2.4fr` — la colonne Burnup reste lisible mais cède de la largeur au panneau wins (qui en a vraiment besoin pour 3 colonnes lisibles).

## [3.10.40] - 2026-05-28

### UI : Modal Demo Réalisations — regroupement Tickets / Buffer / Actions rétro
- Les "🏆 Réalisations du sprint" étaient affichées en grid à plat (tous types mélangés).
- Refonte ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) — répartition en **3 groupes ordonnés** :
  1. **🎫 Tickets** (bordure gauche bleue `#60a5fa`) — tickets standard sans label spécial
  2. **🛡️ Buffer** (bordure gauche violette `#c084fc`) — label `Buffer`
  3. **🔁 Actions rétro** (bordure gauche jaune `#fbbf24`) — label `ActionRetro`
- Filtres exclusifs (un ticket ne va que dans un seul groupe ; ActionRetro prioritaire sur Buffer si les 2 labels co-existent).
- Chaque groupe affiche : icône + nom + badge compteur + total points cumulés à droite (ex: `🎫 Tickets [5] · 12 pts`).
- Si un groupe est vide → masqué (pas de section orpheline).
- CSS ([views.css](squad-board/static/css/views.css)) — `.demo-wins-grid` devient flex column de `.demo-wins-group`, chaque groupe a son propre grid interne `.demo-wins-group-cards` (1 col par défaut, 2 cols ≥1400px). Styles par variante : `.demo-wins-group--tickets|buffer|retro`.

## [3.10.39] - 2026-05-28

### UI : Modal Demo — layout 2 colonnes + Sprint Goal en card encadrée
- **Sprint Goal** déplacé à droite du titre dans le header (avant : sous le titre, en italique). Nouveau composant `.demo-goal-card` :
  - Gradient orange→rose, bordure orange semi-transparente, ombre teintée, border-radius 14px
  - Label `🎯 SPRINT GOAL` en majuscules orange + texte du goal en italique crème
  - Max-height 180px avec scroll si goal très long
  - `flex-direction: column` du `.demo-hdr` sous 1100px (mobile/écran étroit) : la card passe sous le titre
- **Layout 2 colonnes** pour Burnup + Réalisations ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - Nouveau wrapper `.demo-2col` en grid `minmax(0, 1fr) minmax(0, 1.15fr)` — la colonne wins a légèrement plus de place
  - **Burnup à gauche** : flex column avec `min-height: 280px`, le chart occupe toute la hauteur de la section
  - **Réalisations à droite** : wins-grid en 1 colonne dans la moitié droite (au lieu de l'ancienne grid `repeat(auto-fill, minmax(280px, 1fr))` sur full width), passe à 2 colonnes au-dessus de 1400px
  - Compteur visible `🏆 Réalisations du sprint <small>N</small>` (badge bleu pâle)
- **Responsive** : sous 1100px, retour à une colonne unique (Burnup au-dessus, Wins en dessous).
- Bonus : le header titre passe de `clamp(36px, 5vw, 56px)` à `clamp(32px, 4vw, 48px)` pour mieux cohabiter avec la goal-card à droite.

## [3.10.38] - 2026-05-28

### Feat : Sprint Review & Demo plus accessibles (Ctrl+K + header Sprint/Kanban) + modal Demo enrichie
- **Helpers globaux** ([sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - `openCurrentSprintReview()` — résout le sprint actif de l'équipe sélectionnée via `getSprintForTeam`, récupère ses tickets, ouvre directement le compte-rendu Confluence-ready dans un nouvel onglet.
  - `openCurrentSprintDemo()` — idem, ouvre directement le mode présentation TV plein écran.
  - Exposés via `window.__squadBoard.openCurrentSprintReview` et `…openCurrentSprintDemo` ([app.js](squad-board/static/js/app.js)).
- **3 points d'entrée nouveaux** :
  - **Ctrl+K** ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js)) — 2 entrées `📋 Ouvrir Sprint Review (Confluence-ready)` et `📺 Mode Démo fullscreen`.
  - **Header vue Sprint** ([sprint.js](squad-board/static/js/views/sprint.js)) — boutons `📋 Review` (secondaire) et `📺 Demo` (primary) à droite des stats sprint.
  - **Header vue Kanban** ([kanban.js](squad-board/static/js/views/kanban.js)) — mêmes boutons dans une cellule `.kanban-metric-actions` à la suite des metrics.
- **Modal Demo enrichie** ([sprint_tickets_modal.js openDemoMode](squad-board/static/js/components/sprint_tickets_modal.js)) :
  - **Sprint Goal** déjà affiché en header (préservé).
  - **Stats étendues** : ajout d'une stat `PI Predictability %` (commit + stretch livrés / commit planifiés × BV) si des objectives sont définis.
  - **Section PI Objectives** : grid auto-fit montrant jusqu'à 8 objectives, code couleur par statut (vert done, bleu inprog, rouge blocked, gris todo), bordure dashed pour stretch, badge BV à droite.
  - **Burnup chart** : canvas plein largeur sous les objectives, utilise `renderBurnup` (utilise `_eventMarkers` qui annote la courbe avec les faits marquants du sprint via le plugin Chart.js existant). Compteur "X faits marquants" si présents.
- **CSS** ([views.css](squad-board/static/css/views.css)) : `.demo-pi-objectives`, `.demo-pi-grid`, `.demo-pi-obj[.is-done|is-inprog|is-blocked|is-stretch]`, `.demo-burnup`, `.demo-burnup-chart` (220px, fond rgba blanc 4%), `.sprint-quick-actions`, `.kanban-metric-actions`. Palette cohérente avec le thème dark de la Demo (text colors `#fff/#cbd5e1/#fbbf24`).

## [3.10.37] - 2026-05-28

### UX : Tabs Settings dans l'URL — partage de lien direct
- Au clic d'une tab Settings, le hash devient `#settings/<slug>` via `history.replaceState` (replace = pas de pollution de l'historique). L'URL devient partageable : envoyer `…/#settings/rotation` ouvre directement la tab "Rotation Support".
- [app.js pushHash](squad-board/static/js/app.js) — gère désormais le cas `view === 'settings'` : lit `store.settingsSection` et produit `settings/<slug>` (au lieu de juste `settings`). Le bouton précédent/suivant du navigateur reste cohérent.
- [settings.js _settingsApplyTabs](squad-board/static/js/views/settings.js) — `activate(slug)` accepte `{ syncHash }` : `false` à l'init (on lit l'état), `true` au clic (on met à jour `store.settingsSection` + `history.replaceState`). Aussi : sync initial du hash si différent de la tab détectée (ex : on arrive sur `#settings` sans slug → on pose `#settings/<première-tab>`).

## [3.10.36] - 2026-05-28

### UI : Tabs Settings pleine largeur (wrap si dépasse, pas de scrollbar)
- La barre `#settings-tabs` était limitée à 800px (héritage de `.settings-layout`).
- Fix :
  - [settings.js](squad-board/static/js/views/settings.js) — la nav est désormais rendue **hors** du `<div class="settings-layout">`, donc plus contrainte par le `max-width: 800px`.
  - [views.css](squad-board/static/css/views.css) — `flex-wrap: wrap` + `width: 100%` + `max-width: none`. Si l'ensemble des tabs dépasse la largeur, **passage à la ligne** automatique (pas de scroll horizontal, plus fluide visuellement).

## [3.10.35] - 2026-05-28

### Feat : Rotation Support — membres actif/inactif (exclusion des rôles non éligibles)
- **Besoin** : certains rôles (Manager, RTE, PO…) ne font pas de support. Ils doivent rester dans la liste des membres pour la capacité mais être exclus du shuffle.
- **Stockage** ([utils.js](squad-board/static/js/utils.js)) — global, `localStorage.rot-inactive` = JSON array de noms. Helpers exportés : `getInactiveSupportMembers()`, `isMemberSupportActive(name)`, `setMemberSupportActive(name, active)`.
- **UI** ([settings.js _rotTeamPanelHtml](squad-board/static/js/views/settings.js)) — chaque ligne membre dans la grille panel équipe a un **toggle circulaire** à gauche du nom :
  - `🛎️` (fond vert pâle, bordure success) = actif support
  - `🚫` (fond gris, opacity 70%) = inactif support
  - Clic = bascule + re-render
  - Quand inactif : nom **barré + italique muted** + ligne entière (cellules semaines) grisée à 60% opacity
  - Résumé panel : `X/Y actifs (Z hors support)` au lieu de `Y membres`
- **Propagation au shuffle** :
  - [settings.js](squad-board/static/js/views/settings.js) handler `data-rot-shuffle` : filtre `teamMembers.filter(isMemberSupportActive)` avant `generateSupportRotation`. Warning si plus aucun actif.
  - [support.js](squad-board/static/js/views/support.js) `_shuffle` : idem.
- **CSS** ([views.css](squad-board/static/css/views.css)) : `.rot-active-toggle[.is-on]`, `.rot-member-name.is-inactive`, `.rot-row-inactive .rot-cell` (grisée), `.rot-sum-inactive`.
- **Pas de migration backend** : le flag est côté frontend uniquement (préférence utilisateur locale, partagée entre Settings et Support via localStorage).

## [3.10.34] - 2026-05-28

### UX : Paramètres en tabs colorées (au lieu de sections empilées collapsibles)
- **Problème** : 10+ sections empilées verticalement → beaucoup de scroll, charge visuelle lourde.
- **Refonte** ([settings.js _settingsApplyTabs](squad-board/static/js/views/settings.js)) — nav horizontale de tabs **post-render** :
  - Scanne `.settings-section`, extrait le titre `h3` (strip le compteur `(N)`), slugify et attribue un id stable (`section-<slug>`) si pas déjà présent.
  - Génère une nav `<nav id="settings-tabs">` sticky en haut avec un bouton par section.
  - Une seule section visible à la fois (`display: none` sur les autres).
  - Tab active = section dépliée (la classe `collapsed` est retirée).
  - Désactive `data-stg-toggle` sur les headers (le clic-pour-collapser n'a plus de sens en mode tabs).
- **Couleurs** : palette 12 couleurs cyclées par index (`#0ea5e9`, `#8b5cf6`, `#10b981`, `#f59e0b`, …). Variable CSS `--tab-color` par tab. Tab active = fond plein + ombre teintée ; tab inactive = dot coloré devant le label.
- **Icônes** : helper `_settingsTabIcon(title)` mappe le titre vers un emoji (🌳 groupe, 👥 équipes, 🧑 membres, 🌴 absences, 🚀 Sprint/PI, 🛎️ rotation, ⚡ events, 📅 calend, 🔗 jira, 📦 data, ⚙️ fallback).
- **Tab initiale** (priorité) : `#settings/<slug>` hash > `store.settingsSection` > `localStorage.sb-settings-tab` > 1re tab. Au clic d'une tab, slug persisté en localStorage (mais hash inchangé pour ne pas casser les deep links Support → `#settings/rotation`).
- **Compatibilité préservée** : le lien `⚙ Édition` depuis Support active toujours la tab "Rotation Support" (id `section-rotation` conservé) — fix [3.10.30](#) toujours opérationnel.
- **CSS** ([views.css](squad-board/static/css/views.css)) `.settings-tabs` + `.stg-tab[.is-active]` — sticky top + ombre subtile + transition fluide. Mode tabs masque le chevron via `.settings-tabs ~ .settings-section .chevron { display: none }`.

## [3.10.33] - 2026-05-28

### UX Settings : tri équipes, PI courant par défaut, Sprint & PI replié
- **Tri alpha équipes** dans Rotation Support ([settings.js _rotPanelsHtml](squad-board/static/js/views/settings.js)) : `localeCompare('fr', { sensitivity: 'base' })` — insensible à la casse + accents. Ordre prévisible.
- **PI en cours affiché par défaut** : suppression de la persistance `localStorage.rot-show-next-pi`. État remplacé par variable de module `_rotShowNext` (initialisée à `false`) → reset à chaque rechargement de page. Le switch reste fonctionnel pendant la session.
- **Section "Sprint & PI" repliée par défaut** ([settings.js:552](squad-board/static/js/views/settings.js#L552)) : ajout de la classe `collapsed` sur le `<div class="settings-section">` correspondant. Cohérent avec les autres sections déjà repliées par défaut.

## [3.10.32] - 2026-05-28

### Fix : Date de début du PI configurable explicitement — fini la dérivation fragile
- **Symptôme rapporté** : avec mode `Ven → Jeu` sur Fuego, le calendrier affichait `30.1.1 = 1 juin` alors que le PI 30 commence en réalité le **vendredi 12 juin**.
- **Cause racine** : `buildSupportPiWeeks` dérivait la date de début du PI depuis `sprintInfo.startDate - curIdx × sprintDuration`. Cette dérivation est fragile si le sprint actif n'est pas parfaitement aligné, ou si plusieurs sprints du même PI ont des dates très légèrement décalées.
- **Fix** : nouvelle source de vérité explicite `piInfo.startDate` (saisie utilisateur).
  - **Backend** ([main.py](squad-board/main.py)) : champ `start_date` ajouté à `PIConfig` (nullable). Migration SQLite via `_run_migrations` (`ALTER TABLE piconfig ADD COLUMN start_date TEXT`). `_pi_dict` expose `startDate`. `update_pi` accepte `startDate` (None pour effacer).
  - **Frontend** ([utils.js buildSupportPiWeeks](squad-board/static/js/utils.js)) — **priorité d'ancrage** :
    1. `piInfo.startDate` si présent (saisi par l'utilisateur, c'est la vérité)
    2. Sinon fallback sur la dérivation `sprintInfo.startDate - curIdx × duration`
    Le snap au jour de semaine (Ven/Mer/Lun) est appliqué dans les 2 cas pour aligner les semaines.
  - **UI** ([settings.js Settings → PI](squad-board/static/js/views/settings.js)) : nouveau champ `<input type="date">` "Début PI (1er jour)" dans le formulaire PI. Au submit, `getPI()` est rechargé dans le store pour que la timeline rotation se réaligne immédiatement.
  - Le retour de `buildSupportPiWeeks` inclut désormais `anchorSource: 'config' | 'derived'` pour diagnostic.
- **Comment l'utiliser** : Settings → PI → saisir la date du **1er jour du PI COURANT** (pas du suivant). Ex: si PI courant = 29 et PI 30 démarre le 12 juin 2026 (vendredi), alors PI 29 a commencé `12 juin - 5×14j = 3 avril 2026` (vendredi) → saisir `2026-04-03`. Le code calculera automatiquement PI 30 = 12 juin ✓.

## [3.10.31] - 2026-05-28

### Feat : Rotation Support — mode semaine paramétrable par équipe (défaut vendredi)
- **Contexte** : les sprints démarrent le **vendredi** sur la plupart des équipes (mode default), mais certaines équipes (ex: équipe legacy) démarrent le **mercredi**. Le code forçait `weekMode: 'monday'` partout — bug visible : semaines mal alignées sur le calendrier sprint.
- **Centralisation** ([utils.js](squad-board/static/js/utils.js)) :
  - `SUPPORT_WEEK_MODES` = `{ monday, wednesday, friday }` avec `dow` (0-6) et `label`.
  - `SUPPORT_WEEK_MODE_DEFAULT = 'friday'` (changement majeur de default).
  - `getSupportWeekMode(team)` lit `localStorage.rot-mode-<team>` avec fallback default.
  - `buildSupportPiWeeks(piInfo, sprintInfo, weekMode)` accepte le mode et **snap** le début du PI au jour cible (recul max 6j) avant de paginer en semaines de 7j.
- **UI sélecteur par équipe** :
  - [Settings → Rotation Support](squad-board/static/js/views/settings.js) : `<select>` "Semaine" dans le header du panneau équipe (à côté de "Eff./sem" et "🎲 Shuffle"). Les valeurs sont les labels lisibles (`Lun → Dim` / `Mer → Mar` / `Ven → Jeu`).
  - [Vue Support](squad-board/static/js/views/support.js) : même `<select>` dans le header de la table rotation (chip `.sup-mode-label`).
  - Changer le mode → `localStorage.rot-mode-<team>` mis à jour + re-render local.
- **Propagation** : tous les `weekMode: 'monday'` hardcodés deviennent `getSupportWeekMode(team)` (createSupport ligne 1287/1545, shuffle Settings, shuffle Support). Les rotations enregistrées portent le mode utilisé pour leur génération.
- **Recalcul par équipe** : dans `_rotTeamPanelHtml` (Settings) et `_panel` (Support), les semaines sont recalculées via `_rotBuildPiWeeks(teamName)` / `buildSupportPiWeeks(..., teamMode)` — chaque équipe peut donc avoir un calendrier de semaines différent et aligné sur son propre 1er jour.
- **Doc** : nouvelle section "Mode semaine Support" dans [CLAUDE.md](squad-board/CLAUDE.md) avec tableau des 3 modes et chaîne d'appel.

## [3.10.30] - 2026-05-28

### 3 fixes UX rotation support
1. **Vue Support — semaines passées masquées par défaut** ([support.js](squad-board/static/js/views/support.js)) : la timeline ne montre plus les semaines `weekEnd < today` à l'ouverture. Bouton dans le header (`#sup-toggle-past`) avec compteur : `🕰️ Afficher passé (N)` / `👁️‍🗨️ Masquer le passé`. État persisté en localStorage `sup-show-past` (off par défaut). Les stats d'équité (top 3 membres chargés, total assignés/cible) restent calculées sur **tout** le PI pour refléter la charge réelle.
2. **Lien `#settings/rotation` plus fiable** :
   - [settings.js](squad-board/static/js/views/settings.js) : lecture **directe du hash** dans renderSettings (plus robuste que `store.settingsSection` qui peut être consommé entre temps). Délai `setTimeout(80)` pour le `scrollIntoView` (laisse le déplissement CSS se faire avant de scroller). Warning console si la section ciblée est introuvable.
   - [app.js](squad-board/static/js/app.js) applyHash : si on est **déjà** sur la vue settings (cas: cliquer un autre `#settings/section` depuis settings), `store.set('view','settings')` ne notifie pas (dédup interne du Store). On force un `queueMicrotask(rerenderView)` pour ré-exécuter renderSettings et appliquer l'auto-ouverture.
3. **Settings tableau rotation — un seul PI à la fois selon switch** ([settings.js _rotTeamPanelHtml](squad-board/static/js/views/settings.js)) : le switch passe d'inclusif (`courant` OU `courant+suivant`) à **exclusif** (`courant` XOR `suivant`). `allWeeks = showNext ? nextWeeks : curWeeks`. Les boucles header/cellule/total ne mélangent plus les 2 PIs : un seul groupHeader (`colspan=allWeeks.length`), `allWeeks.map(...)` au lieu de `curWeeks + nextWeeks`. Résumé recalculé sur le PI affiché.

## [3.10.29] - 2026-05-28

### UI : Vue Support — "Rotation cette semaine" en hero-cards + "Rotation PI" en table Monday-like
- **Section "Rotation cette semaine"** ([support.js](squad-board/static/js/views/support.js)) — refonte en **hero-cards** par équipe :
  - Bordure gauche 5px couleur équipe, badge `EN COURS` couleur primary
  - Méta : 📆 label semaine, dates, badge "Xj restants" (urgent si ≤ 1j)
  - Mini-bar de progression de la semaine (calculée sur la durée écoulée)
  - Membres affichés en chips avec **avatar circulaire** (initiales colorées par hash du nom), nom et tag `Disponible`/`Absent`. Les absents sont barrés + fond rouge pâle.
- **Section "Rotation du PI"** — passage d'une timeline horizontale à un **tableau type Monday** :
  - 5 colonnes : `Semaine` (label + dates), `Statut` (badge `EN COURS` / `PASSÉ 🔒` / `À VENIR`), `Membres assignés` (chips avec avatars), `Effectif` (badge `Vide`/`X/Y`/`✓ Complet` rouge/orange/vert), `Charge équipe` (bar de capacité dispo avec couleur ok/mid/low).
  - Ligne courante surlignée primary, lignes passées atténuées (opacity), lignes du PI suivant teintées info.
  - **Pied de tableau** : compteur global `assignés/cible (%)` + top 3 membres les plus chargés (équité visuelle avec avatars).
  - Wrapper scrollable (`overflow-x: auto`) pour grands écrans étroits.
- **Avatar helper** : nouveau `_avatar(name, size)` utilisant `hashColor(name)` et `initials(name)` (existants dans utils.js) — réutilisable dans toute la vue Support.
- **Match tolérant équipe** : repris dans `_panel` (cohérent avec les autres fixes piège #5) pour que les panels apparaissent même si le nom config ≠ nom CSV exact.
- CSS ([views.css](squad-board/static/css/views.css)) — ~200 lignes de styles : `.sup-avatar`, `.sup-hero-*`, `.sup-table-*`, `.sup-row-*`, `.sup-foot-*` avec variables sémantiques (`var(--success)`, `var(--warning)`, `var(--primary)`), gradients subtils sur les en-têtes panel.

## [3.10.28] - 2026-05-28

### UI : Vue Support — toggle PI suivant aligné sur le switch 2 segments de Settings
- Le bouton `▾ Masquer PI30` solitaire de la timeline rotation Support est remplacé par le **même switch 2 segments** que Settings (classes `.rot-pi-switch*` déjà stylées) — cohérence visuelle entre les 2 vues qui parlent de rotation.
- `📆 PI {N} courant` / `➕ PI {N+1} suivant`, segment actif surligné (fond surface, primary, bold, ombre subtile).
- Chaque segment ACTIVE son propre mode (clic explicite, pas un toggle aveugle).
- Wireup : `#sup-pi-switch-cur` (force false) + `#sup-toggle-next` (force true).

## [3.10.27] - 2026-05-28

### UI : Sprints du PI — objectifs affichés en intégralité (plus de troncature)
- Demande utilisateur : voir l'objectif complet, pas tronqué à 80 chars + tooltip.
- Fix ([dashboard.js](squad-board/static/js/views/dashboard.js)) — suppression du `slice(0, 78) + '…'`, le goal entier est rendu directement. CSS ([views.css](squad-board/static/css/views.css)) : `min-height` retiré, `white-space: pre-wrap` (préserve les retours à la ligne du goal RH/JIRA), `word-break: break-word` (sécurité URLs).
- Les cards s'adaptent désormais à la hauteur du contenu. Le grid `auto-fit` minmax 200px continue d'aligner les cards par ligne ; les goals plus longs étendent la hauteur de leur card (les voisines de même ligne suivent automatiquement avec `align-items: stretch` implicite du grid).

## [3.10.26] - 2026-05-27

### UI : Dashboard "Sprints du PI" — pills compactes remplacées par mini-cards avec objectifs visibles
- **Demande** : voir les objectifs (goals) de chaque sprint du PI et identifier clairement le sprint en cours.
- **Refonte** ([dashboard.js _renderPiSprintsStrip](squad-board/static/js/views/dashboard.js) + [views.css](squad-board/static/css/views.css)) — remplacement des pills compactes par un **grid de mini-cards** (auto-fit minmax 200px) montrant pour chaque sprint :
  - **État badge** : `Terminé` (vert), `En cours` (primary plein), `À venir` (gris)
  - **Nom + dates** du sprint
  - **🎯 Objectif** (goal du sprint depuis `sprintInfo.teamSprints[].goal`, tronqué à 80 chars + tooltip pour le full). Si absent → "Aucun objectif défini" en italique grisé.
  - **Compteur points** : `donePts/totalPts pts` + pourcentage à droite + mini-progress-bar colorée selon avancement
- **Sprint actif distinct** :
  - Border `2px` primary + box-shadow primary diffuse (effet "card surélevée")
  - Badge "En cours" sur fond primary plein (blanc sur primary)
  - Étiquette **● MAINTENANT** en haut à droite, animée (pulse 1.6s)
- **Sprint terminé** : opacity 0.7 pour reculer visuellement.
- **Sprint futur** : border en pointillé + fond surface (vide).

## [3.10.25] - 2026-05-27

### Fix + UI : Settings Rotation — panels PI29/PI30 vides + toggle PI suivant restylé
- **Bug #1 — Panels PI vides** : `_rotPanelsHtml` filtrait `members.filter(m => m.team === teamName)` en **strict**. Si les équipes config app valent `"Fuego"` mais les members CSV ont `team="Team Ami"` ou `"GCOM - Fuego"`, le tableau est vide → `if (!teamMembers.length) return ''` → aucun panneau ne se rend, même avec des données existantes. Piège #5 (3e occurrence dans la codebase).
  - Fix ([settings.js _rotPanelsHtml](squad-board/static/js/views/settings.js)) : match tolérant (cohérent avec support.js `_shuffle` et settings.js shuffle handler) — normalisation + inclusion bidirectionnelle. Appliqué aussi au filtre `support`.
  - **Hint diagnostique** : si finalement aucun panneau ne se rend, on affiche un encart `.rot-empty-hint` listant les équipes effectivement vues dans le CSV (`Team Ami`, `Team Bellier`…) pour que l'utilisateur sache où renommer (côté Settings ou côté CSV).
- **UI #2 — Toggle PI suivant** : remplacé l'unique bouton secondaire (`▾ Masquer PI 30`) par un **switch à 2 segments** type tab-bar :
  - Segment "📆 PI {N} courant" et segment "➕ PI {N+1} suivant"
  - Le segment actif est surligné (fond `var(--surface)`, couleur primary, ombre subtile, font-weight bold)
  - Chaque segment ACTIVE son propre mode (clic explicite, pas un toggle aveugle)
  - Wireup : `#rot-pi-switch-cur` (force false) + `#rot-next-pi-toggle` (force true)
- CSS ([views.css](squad-board/static/css/views.css)) : nouveau bloc `.rot-pi-switch` + `.rot-empty-hint` (en warning-bg avec liste cliquable des équipes vues).

## [3.10.24] - 2026-05-27

### Fix : Dashboard strip "Sprints du PI" invisible + info-panel mélangeait les sprints
- **Bug #1 — Strip invisible** : la fonction `_renderPiSprintsStrip` recevait `sprintInfo` issu de `getSprintForTeam(team, ...)` qui retourne **un seul sprint** (sans le champ `teamSprints[]`). Donc `ts.length === 0` → return ''. Le strip n'apparaissait jamais.
  - Fix ([dashboard.js](squad-board/static/js/views/dashboard.js)) — séparation `sprintInfoAll` (objet global avec `teamSprints[]`) vs `sprintInfo` (sprint actif de l'équipe). Le helper utilise désormais `sprintInfoAll.teamSprints` et déduit le PI à partir du sprint courant OU du sprint global OU du 1er sprint `active` trouvé (3 fallbacks). Signature : `_renderPiSprintsStrip(sprintInfoAll, currentSprint, team, allTickets)`.
- **Bug #2 — info-panel card "Sprint" mélangeait les sprints** : la variable `tickets` venait de `filterByTeam(store.tickets, team)` SANS filtre sprint. Or la sync JIRA ramène les tickets PI courant + suivant + clos → la card sprint mélangeait tout.
  - Fix ([infopanel.js](squad-board/static/js/components/infopanel.js)) — import de `getSprintForTeam` ; `sprintInfo` = sprint actif de l'équipe sélectionnée (fallback global) ; `tickets` désormais filtré sur le sprint actif (`t.sprintName === currentName || t.allSprints.includes(currentName) || t.sprint === currentName`). Toutes les métriques de la card (pts, status counts, alertes, buffer) reflètent maintenant **uniquement le sprint en cours**.
- **Effets de bord vérifiés** : la card Buffer (ligne 109), les alerts proactives (ligne 309) et `getSprintAlerts` utilisent tous `tickets` — cohérent avec "sprint en cours uniquement".

## [3.10.23] - 2026-05-27

### Feat : Dashboard sprint-header — strip "Sprints du PI courant"
- Sous la barre de progression du sprint actif, nouvelle rangée listant **tous les sprints du PI courant** (closed ✓ / active ▶ / future ○) avec :
  - Pill par sprint, état codé visuellement (closed grisé, active surligné primary, future en pointillé)
  - Compteur points livrés/total (calculé depuis `allTickets` via `sprintName`/`allSprints`) si dispo
  - Tooltip : dates + pts + %
- **Source** : `sprintInfo.teamSprints` (fourni par la sync JIRA — closed + active + future). Si une équipe est sélectionnée, filtre dessus ; sinon dédup par nom de sprint (sprints partagés entre équipes).
- Implémentation : `_renderPiSprintsStrip(sprintInfo, team, allTickets)` en fin de [dashboard.js](squad-board/static/js/views/dashboard.js) + bloc CSS `.pi-sprints-strip` dans [views.css](squad-board/static/css/views.css).

### Feat : Settings > Membres — visuel des congés (aujourd'hui + 30 prochains jours)
- À côté de chaque membre, nouveaux éléments visuels inspirés de JIRA-Dashboard :
  - **Chip "🌴 Aujourd'hui"** (warning) si le membre est en congé au moment du rendu
  - **Chip "📅 dd/mm"** (info) montrant la date du prochain congé s'il y en a un à venir
  - **Strip 30 jours** : mini-barre avec 1 case par jour (vert = dispo, jaune = congé, gris = week-end). Tooltip global = "X absences au total · Yj sur les 30 prochains jours · prochain : dd/mm".
  - **Surlignage de la ligne** (`item-row--absent-today`) en jaune pâle si la personne est absente aujourd'hui.
- Implémentation : `_memberAbsenceInfo(memberName, absences)` dans [settings.js](squad-board/static/js/views/settings.js) + classes `.member-abs-*` dans [views.css](squad-board/static/css/views.css). Aucune requête réseau supplémentaire — tout dérive de `store.absences` déjà chargé.

## [3.10.22] - 2026-05-27

### UX : hash `#settings/<section>` pour atterrir directement sur une section
- Le bouton **⚙ Édition** de la timeline rotation (vue Support) pointe maintenant vers `#settings/rotation` au lieu de `#settings` — la section "Rotation Support" est ouverte (déplissée) et scrollée à l'écran automatiquement.
- **Routing** ([app.js applyHash](squad-board/static/js/app.js)) — pour `view === 'settings'`, `parts[1]` n'est plus interprété comme un team (sans objet ici) mais comme une **section** à ouvrir, stockée dans `store.settingsSection`.
- **Auto-ouverture** ([settings.js renderSettings](squad-board/static/js/views/settings.js)) — à la fin du rendu, on lit `store.settingsSection`, on retire la classe `collapsed` sur `#section-<id>` et on `scrollIntoView({behavior:'smooth'})`. Le flag est ensuite consommé (`null`) pour ne pas re-déclencher.
- **Sections supportées** : aujourd'hui seul `id="section-rotation"` existe. Pour étendre, il suffit d'ajouter `id="section-<slug>"` sur les autres `.settings-section` (members, absences, jira, …) et de pointer le hash en conséquence.

## [3.10.21] - 2026-05-27

### Fix : Shuffle rotation — match tolérant sur le nom d'équipe + message diagnostic
- **Symptôme** : cliquer "🎲 Générer PI29" sur l'équipe Fuego affichait `Aucun membre dans cette équipe (CSV congés vide)` alors que les absences étaient bien importées.
- **Cause** : filtre `m.team === team` strict. Si le nom du bouton est `"Fuego"` mais les absences ont `"GCOM - Fuego"` (Team[Team] JIRA), `"Team Fuego"` (CSV RH) ou variations de casse/espaces, aucune correspondance. Piège #5 de l'agent debugger.
- **Fix** ([support.js _shuffle](squad-board/static/js/views/support.js) + [settings.js shuffle handler](squad-board/static/js/views/settings.js)) :
  - **Match tolérant** : normalisation (casse + trim) + inclusion bidirectionnelle (`t.includes(target) || target.includes(t)`). Gère `"Fuego"` ↔ `"GCOM - Fuego"` ↔ `"Team Fuego"`.
  - **Message diagnostic** : si aucun match, on liste les équipes effectivement vues dans les absences (`Équipes vues en base : Team Ami, Team Bellier…`) — l'utilisateur sait immédiatement où est le mismatch.
- **Note** : la rotation enregistrée garde le nom d'équipe original (`Fuego`), donc le rendu de la timeline reste cohérent. Seul le matching pour récupérer les membres est tolérant.

## [3.10.20] - 2026-05-27

### Fix : Import CSV pivot — consolidation des jours consécutifs en une seule absence
- **Symptôme** : un congé du 20/04 → 21/04 était importé comme **2 absences** d'1 jour chacune au lieu de **1 absence de 2 jours** (cf. cas TEST, Alain dans le CSV de l'utilisateur).
- **Cause** : `_parsePivotAbsencesCsv` émettait naïvement une absence par cellule non vide, sans regrouper les jours contigus.
- **Fix** ([settings.js _consolidateConsecutive](squad-board/static/js/views/settings.js)) — après extraction, on regroupe par `(memberName | team)`, on trie les dates, puis on fusionne les runs contigus. Règle "contigu" : gap calendaire ≤ 3 jours entre deux dates triées (vendredi → lundi compte comme un seul congé, le week-end ne casse pas la séquence — convention RH classique).
- **Conséquences** : `startDate`/`endDate` reflètent la plage réelle ; `days` = somme des jours consécutifs. Plus lisible dans la liste, plus utile pour les calculs de capacité PI (`absenceDays >= 3` dans la rotation support s'appuie sur cette plage).
- Exemple concret : pour le CSV `TEST, Alain ... 06/04=1 20/04=1 21/04=1`, on a maintenant **2 absences** au lieu de 3 (06/04 → 06/04, et 20/04 → 21/04 / 2j).

## [3.10.19] - 2026-05-27

### Fix : Import CSV absences — entité enregistrée + dédup membres
- **Symptômes** : (1) l'entité présente dans la 3e colonne du CSV pivot n'était jamais inscrite — perdue silencieusement ; (2) après import, des doublons de membres apparaissaient (mêmes personnes vues 2 fois dans une équipe).
- **Cause #1** : le parseur `_parsePivotAbsencesCsv` extrayait uniquement `(name, team, dates)`. Les colonnes `Entité` et `Rôles` étaient ignorées. Et même capturées, elles n'auraient pas trouvé de place : la table `absence` n'a pas de champ `entity` — il fallait synchroniser la table `member`.
- **Cause #2** : `/api/members/bulk` en mode `replace=False` **ignorait** les noms existants au lieu de les enrichir. Conséquence : un Member créé par la sync JIRA (avec entity vide) restait incomplet, et l'import CSV n'avait aucun effet sur lui — d'où la sensation de "doublons" entre l'apparition côté absences (avec entité) et côté table member (sans).
- **Fix** :
  - [settings.js _parsePivotAbsencesCsv](squad-board/static/js/views/settings.js) — retourne maintenant `{ absences, members }`. Les colonnes méta sont résolues par regex sur l'en-tête (gère `Équipes`/`Equipe`/`Team`, `Entité`/`Entity`/`Société`, `Rôles`/`Role`/`Fonction`). Trim agressif des espaces invisibles (export Excel) pour éviter des doublons `"Alain Lenom"` vs `"Alain Lenom "`.
  - [settings.js handler import](squad-board/static/js/views/settings.js) — appelle désormais `bulkMergeMembers(membersPayload)` après l'import des absences. Toast enrichi : `X absence(s) ajoutee(s) · N membres crees, M maj`.
  - [main.py bulk_merge_members](squad-board/main.py) — refait en **vrai upsert** : si `name.lower()` existe, on enrichit `team`/`role`/`entity` avec les valeurs CSV **non vides** (préserve les valeurs existantes si CSV vide). Retourne `{ created, updated }`.
- **Limite connue** : la dédup membre est sur `name.lower()`. Pour deux graphies vraiment différentes (`"Alain Lenom"` côté JIRA vs `"LENOM, Alain"` côté CSV RH), c'est l'utilisateur qui doit unifier dans Settings — un fuzzy match cross-graphie reste à faire si le besoin se confirme.

## [3.10.18] - 2026-05-27

### Fix : Import CSV Absences — format pivot RH supporté + noms avec virgule
- **Symptôme** : un CSV RH au format <code>NOMS, Prénom \t Équipes \t Entité \t Rôles \t 03/04 \t 06/04 \t …</code> était mal parsé — le séparateur split sur `[;\t,]` cassait les noms `"LENOM, Alain"` en deux colonnes, et le format pivot (1 colonne par jour) n'était pas reconnu.
- **Fix** ([settings.js _parsePivotAbsencesCsv](squad-board/static/js/views/settings.js)) — auto-détection des **2 formats** :
  1. **Pivot RH** (prioritaire) : détecté si ≥ 3 colonnes d'en-tête au format `dd/mm` (ou `dd/mm/yyyy`). Une absence est créée pour chaque cellule non vide / > 0 (cellule = nombre de jours, gère "1", "0.5", virgule décimale "0,5"). Année saisissable via un champ dédié (défaut = année courante).
  2. **Ligne par absence** (fallback) : `Nom;Equipe;Debut;Fin;Type;Jours` — split uniquement sur **TAB ou `;`** (plus jamais sur virgule) pour préserver les noms `"NOM, Prénom"`.
- **Équipes transverses** : helper `_isTransverseTeam(name)` reconnaît `"Team X"`, `"TRV"`, `transverse`, `pool`, `shared` — les absences sont enregistrées telles quelles ; le toast de confirmation indique combien sont transverses (rappel utilisateur). La rotation support / capacité agile les ignore naturellement car le filtre `m.team === <équipe agile>` ne matche pas.
- **UX** ([settings.js section absences](squad-board/static/js/views/settings.js)) :
  - Aide réécrite avec les 2 formats côte à côte.
  - Champ "Année pour format pivot" visible (défaut = année courante).
  - Dialog de confirmation enrichi : format détecté, équipes vues, nombre d'absences transverses.

## [3.10.17] - 2026-05-27

### Feat : Rotation Support — règles métier centralisées + génération depuis la vue Support
- **Règles métier centralisées** ([utils.js generateSupportRotation](squad-board/static/js/utils.js)) — une seule source de vérité, utilisée par Settings (grille) ET la vue Support (timeline) :
  1. Absent ≥ 3 jours sur la semaine → exclu (source = absences CSV RH).
  2. Pas 2 semaines consécutives — relâché si pool insuffisant.
  3. Verrouillage auto du passé (`weekEnd < today` → intact, marqué `_autoLocked`).
  4. Verrouillage manuel (`locked: true` préservé même futur).
  5. Équité par compteur d'affectations + random pour ex-aequos.
  6. `membersPerWeek` configurable (`localStorage.rot-mpw-<team>`).
- **Helper partagé** `buildSupportPiWeeks(piInfo, sprintInfo)` extrait dans utils.js — utilisé par Settings et Support pour générer les semaines du PI courant + suivant.
- **Vue Support enrichie** ([support.js](squad-board/static/js/views/support.js)) :
  - Nouvelle section **"Rotation du PI"** avec **timeline horizontale** des semaines (current + optionnellement PI suivant).
  - Boutons `🎲 Générer PI{N}` et `🎲 PI{N+1}` par équipe (par défaut visible si une équipe est sélectionnée ; sinon panneau par équipe pour `team='all'`).
  - Indicateurs visuels : semaines passées grisées, semaine courante surlignée, semaines verrouillées avec 🔒, membres absents barrés en rouge.
  - Lien direct vers `Paramètres` pour l'édition fine cellule par cellule.
  - **Préservation cross-PI** : si on régénère le PI suivant, le PI courant existant est conservé dans le payload pour ne pas être effacé par le `bulk` côté serveur.
- **Refacto** ([settings.js:1311-1339](squad-board/static/js/views/settings.js#L1311-L1339)) : le handler shuffle utilise désormais `generateSupportRotation`, gagnant automatiquement les règles "pas 2 sem consécutives" et "passé verrouillé".
- **Doc** :
  - [CLAUDE.md](squad-board/CLAUDE.md) nouvelle section "Règles métier Rotation Support" — explicite les 6 règles + le piège du bulk-clear (pourquoi renvoyer l'autre PI).
  - [docs/guide-support.md](squad-board/docs/guide-support.md) mis à jour avec tableau des règles + accès depuis la vue Support.
- **CSS** ([views.css](squad-board/static/css/views.css)) : nouveau bloc `.sup-tl-*` pour la timeline (grid horizontal scrollable, cellules par semaine, chips membres, états past/current/locked).

## [3.10.16] - 2026-05-27

### Tooling : agent `squad-board-debugger` local
- Nouvel agent dans [.claude/agents/squad-board-debugger.md](squad-board/.claude/agents/squad-board-debugger.md) — consolide tout ce qui a été appris pendant les itérations de debug pour éviter de re-perdre du temps :
  - **Mapping snake/camel** : tableau de correspondance (`ticket.epic_id` → `t.epic`, `epic.feature_id` → `e.feature`, etc.).
  - **7 pièges récurrents** : filtre par équipe oublié sur features ; règles d'anomalies dupliquées health/alert_modal ; source de vérité absences vs members ; team mapping Team[Team] ; mismatch noms d'équipe ; 3 chemins enfants d'une feature (epic intermédiaire / direct / JIRA-only) ; détection PI courant.
  - **5 recettes prêtes à copier** : inspecter une feature et ses enfants (local vs JIRA), vérifier la cohérence des noms d'équipe, trouver les tickets d'un epic, lister custom fields JIRA, dump des champs non-null d'une issue.
  - **Méthode d'investigation** en 5 étapes + format de rapport standardisé.
- Mention dans [CLAUDE.md](squad-board/CLAUDE.md) section finale.

## [3.10.15] - 2026-05-27

### Feat : sidebar enfants — lazy fetch JIRA pour les tickets hors base
- **Cas test diagnostiqué** : feature `GCOM-2457` (status=done, PI#29) — JIRA expose 7 enfants OPS via `parent = GCOM-2457 OR "Epic Link" = GCOM-2457` (TRV-4483, TRV-4445, GCOM-3050, GCOM-2657, GCOM-2650, GCOM-2649, GCOM-2647), mais **aucun n'est en base locale** : la sync per-board/sprint n'importe pas les tickets `done` historiques d'une feature elle-même `done`.
- **Fix** ([modal.js _fetchJiraChildren](squad-board/static/js/components/modal.js)) — à l'ouverture de la sidebar enfants sur une feature, on lance en parallèle un fetch JIRA via le proxy local `/jira/rest/api/3/search/jql` avec `parent = X OR "Epic Link" = X`. Les résultats non présents en base sont ajoutés dans une section `📡 Présents dans JIRA, non en base (N)` avec :
  - Un badge `JIRA` (en couleur info, bordure pointillée) pour les distinguer
  - Au clic : ouvre la fiche JIRA externe (`jiraUrl/browse/<id>`) plutôt qu'une modale locale vide
  - Compteurs du toggle button et du header sidebar mis à jour avec le nouveau total
- **Comportement silencieux** : si le proxy JIRA est KO ou non configuré, la promesse échoue sans erreur visible — la sidebar reste utilisable avec ses enfants locaux.
- **CSS** ([base.css](squad-board/static/css/base.css)) — `.badge-jira-only` (dashed border + tint info) et `.mdl-cs-row--jira { opacity: 0.88 }` pour différencier visuellement.

## [3.10.14] - 2026-05-27

### Fix : sidebar enfants invisible — détection élargie + affichage toujours actif sur feature
- **Symptômes** : utilisateur n'a vu ni le bouton 🌿 ni la sidebar sur une feature ouverte depuis PI Planning.
- **Cause #1** : la sidebar n'incluait que les tickets passant par un epic (`epic.feature === f.id` puis `ticket.epic === epic.id`). Or [roadmap.js:147](squad-board/static/js/views/roadmap.js#L147) gère un cas réel : certains projets attachent les tickets **directement** à la feature via `ticket.epic === feature.id` (sautent l'epic intermédiaire) → 0 enfant trouvé, sidebar silencieusement masquée.
- **Cause #2** : `if (total === 0) return;` masquait toute trace de la fonctionnalité — l'utilisateur ne pouvait pas distinguer "feature sans enfant" de "fonctionnalité cassée".
- **Fix** ([modal.js _renderChildrenSidebar](squad-board/static/js/components/modal.js#L1041)) :
  - **Détection élargie** : on cumule `ticketsViaEpic` (via `epic.feature`) ET `ticketsDirect` (via `ticket.epic === feature.id`), avec dédup sur `t.id`.
  - **Affichage toujours actif** sur les features (même si total=0) : bouton 🌿 visible, sidebar avec message "Aucun enfant rattaché" + indication des chemins vérifiés (pour le debug).
  - **Log console** : `[ChildrenSidebar] Feature XXX : N epic(s) + M ticket(s) (via epic: X, direct: Y)` pour diagnostic rapide.
- **Note** : si après reload tu vois "0 epic + 0 ticket" alors qu'il "devrait" y en avoir, c'est que la liaison parente n'est pas en base — vérifier côté JIRA que les epics/tickets pointent bien sur la clé de la feature.

## [3.10.13] - 2026-05-27

### UX : Autocomplete leader multi-tokens (prénom et/ou nom, ordre libre)
- **Avant** : la recherche faisait `name.toLowerCase().includes(query)`. Taper `"martin david"` ne matchait pas `"David Martin"` (ordre des tokens).
- **Fix** ([alert_modal.js:412-422](squad-board/static/js/components/alert_modal.js#L412-L422)) : la query est splittée sur whitespace ; **chaque token** doit être présent dans le nom. Ex: `"dav"` → matche `"David Lefebvre"` ; `"martin david"` → matche `"David Martin"` ; `"jean"` → matche `"Jean Dupont"` et `"Sophie Jean-Baptiste"`.

### Feat : sidebar "Tickets enfants" sur la modal d'une feature
- Quand on ouvre une feature dans la modal détaillée, une sidebar latérale apparaît à droite avec :
  - Les **epics enfants** (`epic.feature === feature.id`)
  - Les **tickets de ces epics** (`ticket.epic === epic.id`)
  - Chacun cliquable → ouvre le ticket dans la modal (navigation in-place)
- **Toggle** via un bouton 🌿 dans le titre (à côté du sélecteur prev/next) ou via la croix de la sidebar. L'état ouvert/fermé est persisté en localStorage `sb-mdl-children-visible`.
- **Comportement** : la sidebar n'apparaît que si `ticket.type === 'feature'` ET qu'il y a au moins 1 enfant. Sinon ni bouton ni sidebar.
- **Responsive** : sous 1280px, la sidebar bascule en bottom-sheet centré (320px max-width / 40vh max-height) pour ne pas déborder de l'écran (modal max-width 860 + sidebar 340 + gap = ~1212px).
- **Implémentation** :
  - JS : [modal.js](squad-board/static/js/components/modal.js) — helper `_renderChildrenSidebar(feature)` en fin de fichier, appelé après le rendu du body. Nettoyage dans `closeModal`.
  - CSS : [base.css](squad-board/static/css/base.css) — nouveau bloc "Sidebar Tickets enfants" + override `.modal.has-children-sidebar { overflow: visible }` pour permettre le débordement.

## [3.10.12] - 2026-05-27

### Fix : Autocomplete leader Health — match tolérant + fallback liste complète
- **Symptôme** : sur un input `leader` (ex: ticket `GDEM-2907`), taper "David" n'affichait aucune suggestion alors que des personnes correspondantes existent dans le CSV congés.
- **Cause** : le filtre strict `derived.filter(m => m.team === scope)` retournait `[]` quand le nom d'équipe du ticket ne correspondait pas au caractère près à celui présent dans la table absences (mismatch typique `"Demeter"` vs `"GDEM - Demeter"` selon la source d'import).
- **Fix** ([alert_modal.js:407-419](squad-board/static/js/components/alert_modal.js#L407-L419)) :
  - **Match tolérant** : normalisation casse + `trim`, puis exact OR inclusion bidirectionnelle (un nom contient l'autre). Gère les préfixes/suffixes JIRA (`"GCOM - Fuego"` ↔ `"Fuego"`).
  - **Fallback ultime** : si le filtre tolérant ne renvoie toujours rien, on suggère la liste complète dérivée du CSV plutôt qu'un popover muet.

## [3.10.11] - 2026-05-27

### Fix : Dashboard et Reports — features non filtrées par équipe
- Extension du fix [3.10.10] aux 2 vues restantes signalées :
  - [dashboard.js:16](squad-board/static/js/views/dashboard.js#L16) — `features = filterByTeam(...)`
  - [reports.js:18](squad-board/static/js/views/reports.js#L18) — idem
- Toutes les vues affichant features par équipe utilisent désormais `filterByTeam` (cohérence avec la nouvelle convention CLAUDE.md).

### Fix : Autocomplete leader dans la modal Health — basé sur le CSV congés et équipe du ticket
- **Symptôme** : l'input `leader` de la modal Health (cliquer une carte → édition) suggérait soit la liste brute `store.members` (artefacts JIRA d'autres équipes), soit une liste filtrée trop laxiste acceptant les membres sans team.
- **Fix** ([alert_modal.js:396-415](squad-board/static/js/components/alert_modal.js#L396-L415)) :
  - Source unique = `deriveMembersFromAbsences(absences, members)` (table absences = CSV RH à jour, cf. CLAUDE.md "Source de vérité des membres").
  - Filtre par équipe : si une équipe est sélectionnée dans le topbar → cette équipe ; sinon (`team='all'`) → équipe du **ticket** sur lequel porte l'input (résolu via `data-id` → `store.tickets`). Utile quand la modal liste plusieurs équipes.
  - Suppression de `_availableMembers` (plus utilisée).

## [3.10.10] - 2026-05-27

### Fix : PI Planning — onglet Features non filtré par équipe sélectionnée
- **Symptôme** : l'onglet `Features (2400)` de la vue PI Planning affichait **toutes** les features de la base, peu importe l'équipe sélectionnée dans le topbar. Les tickets, eux, étaient bien filtrés.
- **Cause** ([pi.js:16](squad-board/static/js/views/pi.js#L16)) — `const features = store.get('features') || [];` lisait le store brut sans passer par `filterByTeam`. Le compteur d'onglet, la metric card "Features", et la liste rendue dans `renderFeatures` héritaient tous de cette liste non filtrée.
- **Fix** ([pi.js:16-18](squad-board/static/js/views/pi.js#L16-L18)) — `const features = filterByTeam(store.get('features') || [], team);`. `filterByTeam` gère déjà : équipe spécifique → filtre `f.team === team`, `'all'` + groupe → filtre sur les équipes du groupe, `'all'` sans groupe → vue globale (préserve la vue RTE).
- **Cohérence SAFe** : le champ `team` des features = `Team[Team]` JIRA (équipe agile responsable, cf. 3.10.8) — donc filtrer dessus correspond bien à "features de l'équipe sélectionnée".
- **Vues similaires vérifiées** :
  - [roadmap.js:18](squad-board/static/js/views/roadmap.js#L18) ✅ déjà filtré
  - [dashboard.js:16](squad-board/static/js/views/dashboard.js#L16) ⚠ **non filtré** — à investiguer (potentiel bug similaire si les metrics features sont affichées)
  - [reports.js:18](squad-board/static/js/views/reports.js#L18) ⚠ **non filtré** — à investiguer

## [3.10.9] - 2026-05-27

### Fix : carte Health "Sans estimation" ignorait l'exclusion ActionRetro
- **Symptôme** : la card Health `noPoints` affichait 7 alors que la modal n'en listait que 2 — 5 tickets `ActionRetro` étaient comptés dans la card mais exclus à juste titre dans la modal.
- **Cause** : la règle de filtre était définie **2 fois** ([health.js:67-72](squad-board/static/js/views/health.js#L67-L72) pour la card + matrice, [alert_modal.js:30-34](squad-board/static/js/components/alert_modal.js#L30-L34) pour la modal). Seule cette dernière excluait `ActionRetro`.
- **Fix** ([health.js:67-75](squad-board/static/js/views/health.js#L67-L75)) — ajout de la même exclusion `!(t.labels || []).some(l => /^ActionRetro$/i.test(l))` dans `ANOMALIES.noPoints.match`. Commentaire de sync croisée vers `alert_modal.js` ajouté.
- **Doc** : nouvelle section "Règles métier" dans [CLAUDE.md](squad-board/CLAUDE.md) — explicite (1) la règle ActionRetro, (2) la duplication des filtres d'anomalies aux 2 endroits avec consigne de garder en sync, (3) à 3e duplication → extraire dans `business_rules.js` partagé.

## [3.10.8] - 2026-05-24

### Fix : Team[Team] prioritaire sur le nom du board pour les features
- **Diagnostic** : les 10 features signalées par l'utilisateur (GCOM-3775, 3810, 3967, 3997, 4001, 4031, 4032, 4038, 4074, TRV-5467) étaient bien en base avec `piSprint="PI#29"` correct, mais leur `team` était **`"PI Board Features ERPC"`** (le nom du board JIRA cross-team) au lieu de leur équipe agile responsable.
- **Cause** : `transformIssue` priorisait `teamName` (nom du board passé en argument) sur `_teamFromField` (Team[Team] JIRA). Les features sont planifiées sur un board cross-team `"PI Board Features ERPC"` mais Team[Team] vaut bien `"GCOM - Fuego"`, `"GCOM - Caméléon"`, etc.
- **Fix #1** ([sync.js:849-853](squad-board/static/js/sync.js#L849-L853)) — Inversion priorité : `_teamFromField (Team[Team])` > `teamName (board)` > `extractTeam(sprint)` > `'Autre'`. Sémantique SAFe : Team[Team] = équipe agile responsable, board = artefact de planification.
- **Fix #2** ([sync.js:443-450](squad-board/static/js/sync.js#L443-L450)) — La passe features JQL réévalue désormais le `team` des features déjà importées par la passe per-board (sinon `existing.team` restait figé sur le board name).
- **Action requise** : resync **complète** pour réappliquer le mapping. Après resync, les 10 features doivent apparaître sur la team Fuego/Caméléon/etc. selon leur `Team[Team]`.

## [3.10.7] - 2026-05-24

### Fix : Features absentes de la roadmap PI courant
- **Filtre PI tolérant multi-source** ([roadmap.js:51-82](squad-board/static/js/views/roadmap.js#L51-L82)) — `_matchFeaturePi(f)` accepte désormais :
  - `f.piSprint` (priorité 1, format `PI#29` standard)
  - `f.sprintName` (fallback si piSprint null mais sprint stocké)
  - `f.labels[]` (chaque label, ex: `PI29` ou `PI#29`)
  - Format `29.1`/`29.3` (sprint nommé `Fuego - Ite 29.3`) → match PI 29
  - Normalisation casse + espaces ignorés
- **Bug team mapping** ([sync.js:844-851](squad-board/static/js/sync.js#L844-L851)) — les features sans champ `Team[Team]` mais avec Sprint=`PI#29` étaient mappées en équipe fantôme **"PI#29"** (extractTeam ne filtrait pas les PI-tags) → invisibles si filtre équipe ≠ "PI#29"
  - **Fix** : la regex `/^PI\s*#?\s*\d+\s*$/i` détecte les sprint names qui sont juste un tag PI et ne déduit plus de team dans ce cas → fallback sur `'Autre'`
- **Log diagnostic console** ajouté : `[Roadmap] Filtre PI PI#29 (team=Fuego) : 2/12 features { PI#29: 2, PI#28: 5, (null): 5 }` — permet de voir d'un coup d'œil le bug data
- **Action requise** : resync complète pour appliquer le fix team mapping aux features existantes

## [3.10.6] - 2026-05-24

### Fix : PI courant détecté depuis le sprint actif (fallback automatique)
- **Cause** : si `piInfo.number` n'est pas configuré dans Settings (cas par défaut), `_basePi = 0` → `currentPiTag = null` → le filtre masquait toutes les features
- **Fix** : fallback automatique via extraction du numéro PI depuis le nom du sprint actif (regex `(\d+)\.\d+` ou `PI\s*#?\s*(\d+)`)
  - Exemple : sprint `"Fuego - Ite 29.3"` ou `"PI30"` → `basePi = 29` / `30` sans config manuelle
- Appliqué dans :
  - [roadmap.js:30-37](squad-board/static/js/views/roadmap.js#L30-L37) — filtre features
  - [picalendar.js:55-61](squad-board/static/js/views/picalendar.js#L55-L61) — labels sprints PI
  - [topbar.js:81-90](squad-board/static/js/components/topbar.js#L81-L90) — affichage du sélecteur (sinon il restait caché)
- Le sélecteur PI écoute maintenant aussi `store.on('sprintInfo')` pour se rafraîchir après sync JIRA
- `pi.js` utilisait déjà le fallback (`_extractPi(sprintInfo?.name)`) — inchangé

## [3.10.5] - 2026-05-24

### Sélecteur PI — filtre features actif sur tous les PI (current/passé inclus)
- **Bug** : le sélecteur PI du topbar mettait à jour le titre mais ne filtrait pas les features en mode "current" — toutes les features de l'équipe restaient visibles peu importe le PI choisi
- **Fix** : en mode "current" (piOffset ≤ 0), `sortedFeatures` est désormais issu de `piFilteredFeatures = features.filter(f => _matchPi(f.piSprint))` ([roadmap.js:35-55](squad-board/static/js/views/roadmap.js#L35-L55))
- **Convention de match** : `f.piSprint` (déjà extrait du champ Sprint JIRA par `extractPI` → format `PI#30`) comparé au tag du PI sélectionné, avec tolérance `PI30`/`PI#30`/casse/espaces
- **Conséquence attendue** : les features sans `piSprint` (champ Sprint absent côté JIRA) n'apparaissent dans **aucun** PI — c'est cohérent avec la règle métier rappelée par l'utilisateur. Pour les rendre visibles, ajouter un Sprint sur le ticket Feature côté JIRA + resync.
- Le mode "PI futur" (piOffset > 0) utilise déjà `f.piSprint === nextPiTag` (inchangé, fonctionnel)

## [3.10.4] - 2026-05-24

### Roadmap — suppression du toggle Current/Next (doublon avec sélecteur PI)
- Le bloc `<div class="rm-view-header">` avec les boutons "PI{N} — courant / PI{N+1} — suivant" est retiré ([roadmap.js:156-165](squad-board/static/js/views/roadmap.js#L156-L165))
- Le handler de clic associé `container.querySelectorAll('.rm-view-btn')` est supprimé
- Le **sélecteur PI du topbar** prend le relais : `piOffset > 0` → vue "PI suivant" (mode cards/list), `piOffset ≤ 0` → vue "PI courant/passé"
- Logique adaptée :
  - `isNextPi = _piOffset > 0` (au lieu de `viewMode === 'next' || 'next-list'`)
  - `viewMode = isNextPi ? (roadmapTab === 'next-list' ? 'next-list' : 'next') : 'current'`
  - `nextPiTag = `PI#${currentPiNum}`` (le PI sélectionné, plus le PI suivant)
- Le sous-toggle **Cartes / Liste** reste dans la section "PI futur" pour basculer entre les deux affichages

## [3.10.3] - 2026-05-24

### Bandeau calendrier — 1 ligne scrollable + Sélecteur PI dans le topbar
- **`.cal-banner-events` réorganisé en 1 ligne horizontale scrollable** ([views.css:4492-4527](squad-board/static/css/views.css#L4492-L4527))
  - `flex-wrap: nowrap` + `overflow-x: auto` avec scrollbar fine (6px, color-mix)
  - `.cal-banner-line` passe en `inline-flex` + `flex-shrink: 0` pour ne plus retourner à la ligne
  - `.cal-banner-line--off` : séparateur vertical à droite au lieu de bordure horizontale
  - Le `.cal-banner` parent passe à `flex-wrap: nowrap` pour préserver la ligne unique
  - Gain : économie de hauteur quand beaucoup de réunions le même jour
- **Sélecteur PI dans le topbar** (PI−2, PI−1, **PI courant**, PI+1, PI+2)
  - Visible uniquement sur les vues `pi`, `picalendar`, `roadmap`
  - Style identique à `.rm-view-toggle` (bordure unifiée, état actif violet, bouton "courant" pré-teinté)
  - Nouveau champ `store.piOffset` (default 0, reset à 0 au changement de vue)
  - Branché dans [roadmap.js:28-34](squad-board/static/js/views/roadmap.js#L28-L34), [pi.js:500-503](squad-board/static/js/views/pi.js#L500-L503), [picalendar.js:52-57](squad-board/static/js/views/picalendar.js#L52-L57)
  - Re-render automatique de la vue au changement de PI (`store.on('piOffset', renderView)`)
  - Décale le PI affiché : titres, filtres features/sprints, calendrier — sans toucher aux données

## [3.10.2] - 2026-05-24

### Axes x des charts Sprint/Kanban : vraies dates de début/fin
- `sprintDays()` ([charts.js:146-156](squad-board/static/js/components/charts.js#L146-L156)) : labels format `12/05 L` au lieu de `J1 (L)` — on voit immédiatement la date réelle
- `sprintCtx` calculé depuis `endDate - startDate` du sprint réel ([sprint.js:101-111](squad-board/static/js/views/sprint.js#L101-L111), [kanban.js:35-44](squad-board/static/js/views/kanban.js#L35-L44)) — fini le `durationDays: 14` hardcodé qui ne correspondait pas aux sprints de 2/3 semaines
- Premier label = date de début du sprint, dernier label = date de fin — l'axe x s'étend exactement sur la durée du sprint
- Charts impactés : Burndown, Burnup, CFD, Throughput (tous les charts daily-based)

## [3.10.1] - 2026-05-24

### Fixes : terme "Buffer" unique + filtre sprint + statut JIRA brut + actions rétro
- **Revert "Buffer" unique** :
  - Chart vélocité : la barre violette s'appelle à nouveau **`Buffer (estimé)`** (au lieu d'Engagement)
  - Modal stat : card unique `Buffer (estimé)` + `▮` violet (CSS `.sb-stat-card--buffer` revert au gradient violet doux)
  - Suppression de la card doublon `Buffer (réservé)` qui faisait collision
  - Markdown/print : `Buffer (estimé)` pour le total JIRA, `🛡️ Tickets Buffer` pour la somme des tickets-label
  - Les tickets ayant le label `Buffer` conservent leur visualisation (icône 🛡️, fond violet, chip)
- **Filtre par sprint sur la page Sprint** ([sprint.js:30-49](squad-board/static/js/views/sprint.js#L30-L49)) :
  - Bug : GCOM-4174 (`sprintName: "PI30"`) apparaissait dans la vue du sprint "Fuego 29.4" car aucun filtre par sprint
  - Fix : `tickets = teamTickets.filter(t => t.sprintName === sprintInfo.name)` après résolution du sprint courant via `getSprintForTeam`
  - Fallback : si pas de sprint courant identifiable, on garde tout (mode dégradé)
- **Statut JIRA brut préservé** (ex: `En cours de développement` au lieu de `En cours`) :
  - Backend : nouvelle colonne `ticket.jira_status` ([main.py:81](squad-board/main.py#L81)) + migration ALTER TABLE + sérialisation `jiraStatus` dans `_ticket_dict`
  - Sync : `transformIssue` exporte le label JIRA brut ([sync.js:842](squad-board/static/js/sync.js#L842))
  - Helper [`getStatusLabel(ticket)`](squad-board/static/js/utils.js#L8-L18) : `jiraStatus` > `STATUS_LABELS[status]`
  - Branché dans `alert_modal.js`, `topbar.js` (search), `sprint.js` (board-list) — le statut interne reste utilisé pour groupement/filtres/couleurs ; le label JIRA pour l'affichage
  - **Action requise** : relancer une sync complète pour peupler `jiraStatus` sur les tickets existants
- **Modal "Tickets sans estimation"** : exclut les tickets ayant le label `ActionRetro` ([alert_modal.js:30](squad-board/static/js/components/alert_modal.js#L30)) — les actions de rétro ne nécessitent pas d'estimation SP

## [3.10.0] - 2026-05-24

### #3 + #7 + #8 + #11 + #12 — Skeleton, Breadcrumb, Favoris, Sparklines, Capacity

**#3 Skeleton loaders pendant les syncs JIRA**
- Au démarrage de `handleJiraImport`, la vue courante est remplacée par un skeleton animé (shimmer 1.4s) — feedback immédiat vs écran figé
- Header avec spinner + titre du mode (rapide / complète) + sub explicatif
- Grid de 4-8 cards placeholders selon le mode
- Auto-remplacé par le re-render à la fin du sync

**#7 Breadcrumb topbar persistant**
- Le `viewTitle` devient un **fil d'Ariane** : `[Icon View] › [Équipe/Groupe] › [📌 Sprint]`
- Segments cliquables :
  - Clic **équipe** → bascule sur "Toutes les équipes"
  - Clic **groupe** → retire le filtre groupe
  - Clic **vue (icon)** → ouvre le Team Switcher (Ctrl+E)
- Sprint name affiché uniquement sur Sprint/Kanban/Dashboard avec équipe spécifique
- Dot couleur sur les segments équipe/groupe

**#8 Vues favorites ★** ([components/favorites.js](squad-board/static/js/components/favorites.js))
- Nouveau bouton **★** dans la topbar (entre topbar et + Nouveau)
- Dropdown qui ouvre la liste des favoris + bouton "＋ Sauver la vue courante"
- Capture state : view + team/group + qfText sessionStorage
- Persistance localStorage `sb-favorites` (max 12)
- Click favori → restore complet en 1 clic
- Suppression au hover via × discret
- Tooltip avec détails du favori

**#11 Trend sparklines KPIs** ([components/sparkline.js](squad-board/static/js/components/sparkline.js))
- Composant SVG ultra-léger autonome (pas de Chart.js)
- Helpers `sparkline(values, opts)` et `trendChip(values, opts)` (avec `invertGood` pour les KPIs où baisse = bien)
- **Health Dashboard enrichi** :
  - Snapshot quotidien du score + counts par anomalie en localStorage `sb-health-history` (max 30 entrées)
  - **Sparkline 120×32** sous le label du score (zone teintée + dernier point + min/max highlights)
  - **Chip de tendance** ↗↘ à côté du label avec % vs jour précédent
  - **Mini sparkline 70×22** dans chaque card anomalie + chip tendance (invertGood = couleur verte si baisse)

**#12 Capacity planning prévisionnelle** ([utils.js:computeCapacityNextSprint](squad-board/static/js/utils.js))
- Helper exporté qui calcule pour une équipe : `vélocité moy. 3 derniers × (1 − ratio absences)`
- Fenêtre du prochain sprint : `endDate sprint actif + 1 jour → +durée du sprint actif`
- Compte les jours ouvrés (lundi-vendredi) sur la fenêtre + intersect avec les absences
- Demi-journées (`type === '1/2'`) supportées
- **Card "🎯 Capacité prévisionnelle"** affichée dans la vue Health quand une équipe est filtrée
  - Capacité estimée (gros bleu), Vélocité moyenne, Ratio absences (vert/info/warning selon %)
  - Sub : nom équipe + dates de la fenêtre du prochain sprint

## [3.9.1] - 2026-05-23

### Fixes : centrage score Health + autocomplete vraie sur input leader
- **Score Health circle** : passage de `display: inline-flex; align-items: baseline` à `flex-direction: column; align-items/justify-content: center` → "14" centré, "/100" en petit dessous (au lieu de désaligné en baseline)
- Font-size légèrement bump (42 → 44px) + letter-spacing -0.02em pour un rendu plus dense
- **Autocomplete custom** sur les inputs `alert-input--leader` ([alert_modal.js:330-432](squad-board/static/js/components/alert_modal.js#L330-L432)) :
  - Remplace la `<datalist>` HTML5 (limitée, UI inconsistante)
  - Popover singleton attaché au `<body>` (position fixed z-index 10010) → échappe au clip de la modal
  - Au focus / input : popover s'ouvre avec les membres filtrés (top 10, match `name.includes(query)`)
  - Affiche nom + équipe en petit à droite
  - Navigation clavier : ↑↓ Enter Esc Tab
  - Click sur option (mousedown pour devancer le blur) → sette la valeur + déclenche événement `input` (track dirty)
  - Auto-close au blur (avec délai 120ms pour laisser le mousedown agir)

## [3.9.0] - 2026-05-23

### #1 + #2 + #3 — Cmd+K boosté, Team switcher, Health Check Dashboard

**#1 Cmd+K (palette de commandes) boosté** ([cmdpalette.js](squad-board/static/js/components/cmdpalette.js))
- Nouvelle catégorie **`Actions`** (10 commandes) avec scoring + boost de pertinence sur les `keywords`
  - Sync JIRA rapide/complète · Basculer thème · Ouvrir calendrier semaine · Modales d'alertes (unassigned, noPoints, oldBlockers, scopeCreep) · Voir toutes équipes · Ouvrir JIRA externe
- Empty state enrichi : top 5 actions populaires visibles avant même de taper
- Activation : run la fonction `action.run()` au clic / Enter

**#2 Team Switcher fuzzy (Ctrl+E)** ([team_switcher.js](squad-board/static/js/components/team_switcher.js))
- Nouveau composant léger : palette modale d'équipes (style cmdpalette mais focalisé)
- Sections : **⏱ Récents** (localStorage `sb-recent-teams`, 6 derniers) → **📦 Groupes** → **Équipes (A-Z)**
- Fuzzy search live + navigation clavier ↑↓ Enter Esc
- **Raccourci Ctrl/Cmd + E** global pour ouvrir
- **Bouton 🔍** ajouté en bas de la sidebar des équipes si > 5 équipes
- Swatches couleur 2 lettres cohérents avec la sidebar
- Au choix → set `team`/`group` dans le store + push récent

**#3 Health Check Dashboard** ([health.js](squad-board/static/js/views/health.js))
- Nouvelle vue dans la sidebar `🛡️ Health` (shortcut `H`)
- **Hero** : score global 0-100 (jauge circulaire colorée selon niveau) + label "Excellent/Correct/Attention/Critique"
- **7 cards anomalies** cliquables : 🚫 Bloqués · 🔴 Blockers >48h · 🐌 Stagnants · 👤 Sans assigné · 📊 Sans estimation · 🔄 WIP élevé · 📈 Périmètre élargi
  - Clic → ouvre la modal d'action (réutilise `openAlertModal` existant)
- **Matrice heatmap équipes × anomalies** :
  - 1 ligne par équipe (avec swatch couleur 2 lettres), 1 colonne par anomalie + total
  - Intensité de fond proportionnelle au count (color-mix dynamique)
  - Clic sur cellule → bascule le filtre topbar sur cette équipe + ouvre la modal d'action
  - Hover : zoom 1.15× + font-weight bold pour la lecture rapide
- **Calcul du score** : `100 - (weighted_anomalies / active_tickets × 35)` avec pondération sévérité (danger ×3, warning ×1.5, info ×0.5)
- Respect du filtre topbar (équipe/groupe) : si filtre actif, la matrice se restreint au périmètre

## [3.8.22] - 2026-05-23

### Filtre équipes intra-modal calendrier (popover header)
- **Nouveau toggle "👥 Équipes"** dans le header de la modal calendrier (Sprint/Kanban) entre la nav semaine et le bouton sync
- **Popover** avec pills équipes (réutilise `.team-pill` de settings) :
  - Pill `Toutes` (par défaut) → reset · pills équipe → toggle multi
  - Triées alphabétiquement (`localeCompare 'fr'`, sensitivity base)
  - Listées uniquement les équipes qui ont au moins **un calendrier ICS** configuré (pas de pollution)
- **Pré-coche l'équipe topbar** si elle est spécifique au open (`openCalWeekModal` initialise `teamSelection` avec [team])
- **Filtre live** : re-render de la modal au toggle, navigation semaine préserve la sélection
- **Events sans team** (calendriers globaux) toujours affichés peu importe la sélection
- **CSV support** : un cal `team="Fuego,Caméléon"` matche les deux filtres
- **Toggle compact** : affiche `Toutes équipes`, `Fuego` (si 1), ou `3 équipes` + badge compteur primary si N > 0
- État `is-active` (fond primary 12% + bordure 40%) sur le toggle quand un filtre est actif
- Popover en `position: fixed` z-index 10001 → échappe au clip de la modal
- Click hors popover → ferme

## [3.8.21] - 2026-05-23

### Équipes triées alphabétiquement dans les pickers Paramètres
- `teamNames` ([settings.js:44](squad-board/static/js/views/settings.js#L44)) trié par `localeCompare('fr', sensitivity:'base')` → ordre alphabétique insensible à la casse / accents
- Impacte les **pills équipes** du picker calendriers ICS (ajout + édition inline) et toutes les autres listes de teams dans la vue Settings
- `.slice()` avant tri pour ne pas muter le store

## [3.8.20] - 2026-05-23

### Calendriers ICS — édition inline + multi-équipes
- **Édition inline** : nouveau bouton **✏️** sur chaque calendrier dans Paramètres → transforme la row en form édition (nom, URL, équipes) avec ✓/✗ et raccourcis Enter/Échap
- **Multi-équipes** via picker à pills :
  - Pill `Toutes` (par défaut) ↔ pills équipe individuelles
  - Clic sur une équipe = toggle ; clic sur "Toutes" = reset
  - Si plus aucune équipe sélectionnée → "Toutes" se réactive automatiquement
  - Stockage CSV dans le champ `team` existant (rétrocompatible)
- **Backend** ([main.py:1893-1897](squad-board/main.py#L1893-L1897)) : `get_calendar_events` accepte le CSV — un cal `team="Fuego,Caméléon"` matche les deux filtres
- **Frontend filter** ([cal_banner.js:188-194 + 691-697](squad-board/static/js/components/cal_banner.js#L188-L194)) : helper `_matchTeam(et, t)` qui split CSV et matche
- **Display** : chip "Fuego" pour 1 équipe, "3 équipes" + tooltip pour multi
- **Délégation** sur `#cal-list` pour les actions (edit/refresh/delete) → cancel d'édition ne perd plus les handlers
- Picker mutualisé entre formulaire d'ajout et formulaire d'édition (même composant `cal-teams-picker`)
- CSS dédié : pills primary actives, form édition fond bleu pâle pour distinguer

## [3.8.19] - 2026-05-23

### Epic picker — combobox autocomplete avec récents (modal ticket)
- Le champ `editable-field` Epic de la modal ticket devient un **combobox custom** au clic (au lieu d'un `<select>` natif)
- **Input d'autocomplete** en haut : filtre live sur la clé (ex `GCOM-`) ET le titre
- **Section "⏱ Récents"** : 8 derniers Epics modifiés sur cet appareil (localStorage `sb-recent-epics`) — push automatique à chaque commit
- **Section "N Epics (A → Z)"** : tous les autres Epics triés alphabétiquement par titre (avec locale FR pour é/à)
- **Option "— Aucun (retirer l'Epic)"** au sommet pour détacher facilement
- **Indicateurs visuels** :
  - Epic courant : fond vert + bordure gauche succès
  - Hover : fond bleu light
  - Clé monospace primary + titre tronqué avec ellipsis
- **Navigation clavier** :
  - ↑/↓ pour parcourir, Enter pour valider, Esc pour annuler
  - Le scroll suit l'élément hover (`scrollIntoView`)
  - Click hors picker = cancel
- **Filtre intelligent** : masque dynamiquement les section headers quand rien dessous n'est visible
- Position absolue dans le champ, dropdown 320px max scrollable, shadow + ring primary pour le focus visuel

## [3.8.18] - 2026-05-23

### qf-search Sprint — matche aussi les labels + Epic/Feature parente
- Le filtre `_qfText` (input `qf-search` de la vue Sprint) prend désormais en compte :
  - **Labels** du ticket (déjà actif, confirmé)
  - **Epic parente** : `t.epic` résolu → matche sur `ep.id` ET `ep.title`
  - **Feature ancêtre** : chaîne `ticket → epic.feature_id → feature` → matche sur `ft.id` ET `ft.title`
- Index `Map` pré-construits depuis `store.epics`/`store.features` → résolution O(1) par ticket (pas de scan répété)
- Aligné sur les **deux chemins de filtre** : initial dans `renderSprint` ([sprint.js:58-87](squad-board/static/js/views/sprint.js#L58-L87)) + diff dans `_refreshBoard` ([sprint.js:334-358](squad-board/static/js/views/sprint.js#L334-L358))
- **Placeholder mis à jour** : `🔍 Filtrer : clé, titre, leader, label, contributeur, Epic/Feature parente…`
- Exemple : taper `LOGIN` affiche les tickets dont l'Epic ou la Feature parente s'appelle "Refonte parcours LOGIN"

## [3.8.17] - 2026-05-23

### Bouton "Voir la semaine" → mini-éphéméride sexy
- Le bouton `Semaine ⌄` devient un **mini-widget calendrier** style page d'éphéméride :
  - **Carré 36×40 avec header rouge** (gradient `#ef4444 → #dc2626`) affichant le mois en 3 lettres (`MAI`)
  - **Numéro du jour en gros bold** (`23`)
  - **Jour de la semaine** en petites caps en bas (`MAR`)
  - Bordure + inner highlight + drop-shadow subtile pour un effet "carte tangible"
- **Label à droite** sur 2 lignes :
  - `Semaine` (14px, semibold)
  - `vue détaillée` (uppercase 9.5px muted)
- **Hover** : translateY(-1px) + box-shadow + ring primary discret + bordure primary 40%
- Tooltip enrichie : `Voir la semaine — mer. 23 mai`
- Police `font-variant-numeric: tabular-nums` pour la cohérence des chiffres
- Le clic ouvre toujours `_openWeekModal(filtered)` (binding inchangé)

## [3.8.16] - 2026-05-23

### Alert-bar du Sprint cliquable → modal d'action (même que panel-alert)
- Les items du `alert-bar` (en haut de la vue Sprint) avec un `actionable` deviennent **cliquables** et ouvrent la même modal que les alertes du panel aside
- Attributs alignés sur `panel-alert-row--clickable` : `role="button"`, `tabindex="0"`, `data-alert-action`, `title="Cliquer pour agir sur ces tickets"`
- **Flèche `→` CTA** apparaît au hover (opacité 0.6 → 1 + translateX)
- **Hover** : `translateY(-1px)` + box-shadow + bordure interne renforcée
- **Accessibilité** : navigation clavier (Enter/Space pour ouvrir)
- Pas de double rendu : la modale globale réutilise `openAlertModal(actionable)` — même tableau éditable + hash routing

## [3.8.15] - 2026-05-23

### Fix tooltip Scrum croppée — singleton portal body
- **Bug** : la tooltip était `position: absolute` dans le badge → croppée par `overflow:hidden`/scroll des parents (`.cal-week-grid-wrap`, modal, cellules jour)
- **Fix** : **singleton tooltip attaché au body** ([cal_banner.js:582-650](squad-board/static/js/components/cal_banner.js#L582-L650))
  - Le badge ne contient plus que l'emoji + `data-scrum-key`
  - Au hover (délégation globale `mouseover`/`mouseout` + `focusin`/`focusout`), une tooltip globale unique est positionnée en **`position: fixed`** via JS calculant la `getBoundingClientRect` du badge
  - **`z-index: 10000`** + reparent au body → échappe à tout clip parent
  - **Placement intelligent** : préfère "au-dessus à droite", flip dessous si pas de place en haut, recale à gauche si débord à gauche, max-x clampé
  - **Hover persistant** sur la tooltip (mouseenter sur tt = cancel hide) — permet de cliquer dedans / lire tranquillement
  - Délais de hide `setTimeout(80ms)` pour transition fluide entre badge et tooltip
- Réutilise la couleur par cérémonie via classe `.cal-scrum-tt--<key>` qui set `--scrum-color`

## [3.8.14] - 2026-05-23

### Tooltip pédagogique sur les cérémonies Scrum
- **Au hover de l'emoji cérémonie** (🌅 🎯 🔍 🔁 🎤) : tooltip riche colorée par type qui explique la cérémonie en 5 points pour un newcomer Scrum :
  - **🎯 Pourquoi** — objectif business/équipe
  - **👥 Qui** — participants typiques
  - **⏱ Fréquence** — cadence et durée
  - **📦 Output** — livrable attendu
  - **💡 Exemple** — phrase concrète dans un encadré teinté (en italique)
- **Design "sexy"** :
  - Largeur 320px, padding généreux, line-height 1.5 pour la lecture
  - Background gradient (couleur du type → surface)
  - Bordure colorée par type + double shadow (drop-shadow coloré + halo léger)
  - Petite **flèche pointe** sous la tooltip vers le badge
  - Titre 14px coloré par type, dashed separator
  - Bloc exemple : encadré bordure gauche colorée + fond pastel
- **Position intelligente** : par défaut au-dessus à droite du badge ; sur les 2 derniers jours de la semaine (`nth-last-child(-n+2)`), bascule à gauche pour ne pas sortir du grid
- **Accessibilité** : `tabindex="0"` + `aria-label` + `role="tooltip"` + visible aussi sur `:focus-visible` / `:focus-within`
- Animation : fade + slide-up cubic-bezier 0.16/1/0.3/1
- Contenu détaillé centralisé dans `_SCRUM_DETAILS` ([cal_banner.js:86-122](squad-board/static/js/components/cal_banner.js#L86-L122))

## [3.8.13] - 2026-05-23

### Durée des events retirée du calendrier modal
- Suppression de `<span class="cal-ev-dur">(15min)</span>` à côté de l'horaire — l'horaire `10h30 – 10h45` suffit à donner la durée
- Plus de calcul `_duration` dans le rendu (helper toujours présent pour usage futur)

## [3.8.12] - 2026-05-23

### Badge cérémonie réduit à l'emoji seul
- Le badge cérémonie n'affiche plus que l'emoji (🌅 / 🎯 / 🔍 / 🔁 / 🎤) sans le libellé texte
- **Tooltip conserve le nom complet** ("Daily", "Sprint Review"…) au hover
- Plus discret + plus de risque de débordement dans les cellules étroites

## [3.8.11] - 2026-05-23

### Fix débordement badge cérémonie Scrum
- **`.cal-ev-time`** passé en `flex-wrap: wrap` (avec `row-gap: 3px`) → le badge cérémonie passe sous l'horaire si la cellule jour est trop étroite (au lieu de déborder hors du cadre)
- L'horaire reste `white-space: nowrap` (premier enfant) pour ne pas casser "10h00 – 10h30"
- **Badge cérémonie compacté** :
  - `font-size: 9.5px → 8.5px`, `padding: 1px 6px → 0 4px`, `border-radius: 4px → 3px`, `gap: 3px → 2px`
  - `font-weight: semibold → bold` pour compenser la taille réduite
  - `letter-spacing` resserré (`0.03em → 0.02em`)
  - Ajout `text-overflow: ellipsis` + `max-width: 100%` au cas où

## [3.8.10] - 2026-05-23

### Calendrier modal — visuel dédié pour les cérémonies Scrum
- Nouveau helper `_detectScrumType(title)` ([cal_banner.js:84-99](squad-board/static/js/components/cal_banner.js#L84-L99)) qui identifie 5 types de cérémonie via regex sur le titre :
  - 🎤 **Sprint Review** (`sprint review`, `sprint demo`, `démo sprint`)
  - 🎯 **Planning** (`sprint planning`, `PI planning`)
  - 🌅 **Daily** (`daily`, `stand-up`, `standup`, `scrum matinal`)
  - 🔍 **Refinement** (`refinement`, `grooming`, `raffinement`)
  - 🔁 **Rétro** (`rétro`, `retro`, `rétrospective`, `retrospective`)
- Ordre des règles : plus spécifique d'abord (sprint review avant review seul)
- **Badge Scrum** affiché à droite de l'horaire (avant l'icône 🔄 récurrence si présente), avec icône + libellé court
- **Fond gradient subtil** sur toute la ligne event (couleur du type vers transparent à 70%)
- **Couleurs cohérentes par type** :
  - Daily → vert (#10b981, action quotidienne)
  - Planning → bleu (#3b82f6, projection)
  - Refinement → ambre (#f59e0b, analyse)
  - Rétro → violet (#8b5cf6, réflexion)
  - Sprint Review → cyan (#06b6d4, démo)
- Variable CSS `--scrum-color` par variante → palette extensible facilement

## [3.8.9] - 2026-05-23

### Calendrier modal — équipe masquée si filtrée + 🔄 à droite de l'horaire
- **Équipe masquée si filtre actif** : si une équipe spécifique est sélectionnée dans la topbar, le `👥 Équipe` n'apparaît plus dans le metaLine de chaque event (information redondante). Les autres infos (calendarName si différent) restent affichées.
- **Icône 🔄 récurrence repositionnée** : retirée du metaLine en bas, ajoutée à droite de l'horaire (`.cal-ev-time` avec `margin-left: auto`) — meilleur scan visuel des événements récurrents au moment où on regarde l'heure
- Span dédié `.cal-ev-recur` avec opacité 0.75 → 1 au hover, cursor help + tooltip "Événement récurrent"

## [3.8.8] - 2026-05-23

### Support-banner — noms en "Prénom L." + label équipe rétréci
- **Nom membre compacté** : `Jean Dupont` → `Jean D.` via helper `_shortName(n)` ([sprint.js:99-104](squad-board/static/js/views/sprint.js#L99-L104))
  - Gestion des noms multi-mots : on garde le prénom + initiale du **dernier** mot (particules ignorées : `Marie Claire De La Fontaine` → `Marie F.`)
  - **Tooltip conserve le nom complet** au hover du chip
- **`.support-team-label` rétréci** : min-width `22px → 16px`, padding `1px 5px → 0 4px`, border-radius `999px → 4px` (carré au lieu de pill — plus compact), font `9.5px → 9px`, letter-spacing diminué (`0.04em → 0.02em`)

## [3.8.7] - 2026-05-23

### "Scope creep" → "Périmètre élargi" (français partout)
- Libellés affichés mis à jour dans :
  - **Alerte du panel aside** : `Périmètre élargi : N ticket(s) ajouté(s) après début (+X pts)`
  - **Modal d'action** : titre `Périmètre élargi — tickets ajoutés en cours de sprint`
  - **Sprint Review template** : `Périmètre élargi :` dans "Points d'attention pour la rétro" + reformulation du message "Sprint propre" (« pas d'ajout significatif après début »)
  - **Docs** : guide-rte.md et guide-scrum-master.md
- **Clés techniques inchangées** (`scopeCreep` actionable, hash routing `#sprint/Fuego/alert/scopeCreep`, var locale `scopeCreep`) pour préserver la rétrocompat et les liens partagés

## [3.8.6] - 2026-05-23

### Support-banner ultra-compact + scroll horizontal
- **Hauteur réduite** : padding `4px sp-3` (vs `sp-2 sp-4`), min-height 30px, font 12px (vs sm)
- **Scroll horizontal discret** des membres (`flex-wrap: nowrap` + `overflow-x: auto`) :
  - Scrollbar fine 4px, couleur transparente `text-muted 30%` → 50% au hover (Firefox `scrollbar-width: thin`)
  - Empêche le retour à la ligne quand beaucoup d'équipes
- **Chips members plus petits** : padding `1px 6px 1px 3px`, font 11px, avatar 14×14 (vs 16×16)
- **Date en format court** : `5 → 11 juin` si même mois, `28 mai → 3 juin` sinon (au lieu de `05/06/2026 → 11/06/2026`)
  - Tooltip conserve les dates complètes au hover
- **Encadrement groupe** un peu resserré (padding 1px/5px au lieu de 2px/6px) et `nowrap` interne

## [3.8.5] - 2026-05-23

### Support-banner — affinage visuel
- **Texte** : `Support :` → `Support` (suppression du deux-points pour cohérence avec les autres labels)
- **Label équipe condensé** : nom complet → 2 premières lettres en majuscules (`Fuego` → `FU`, `Caméléon` → `CA`) — gain de place, tooltip conserve le nom complet
- **Encadrement discret** des membres par équipe (`.support-team-group--bordered`) :
  - Bordure pointillée colorée par équipe (via `--team-dot` CSS variable)
  - Fond très léger (4% color-mix) pour distinguer les groupes sans surcharger
  - Padding interne minimal (2px/5px) pour rester compact
- Séparateur `·` retiré (l'encadrement suffit visuellement)
- Label désormais coloré par équipe (au lieu du dot + neutre) : pastille 22px min, fond 14% + bordure 40% de la couleur équipe

## [3.8.4] - 2026-05-23

### 3 ajustements UX : cal-banner, support, sprint-header
- **cal-banner** : ré-render automatique sur changement de `calendarEvents` / `calendars` / `team` (via `store.on` subscription par wrap, WeakMap pour cleanup). Avant : le bandeau "Aujourd'hui" restait figé après sync. Ajout d'un `console.debug` quand 0 réunion détectée malgré des events filtrés (échantillon `[{title, start, dayKey, team}]`) pour aider au diagnostic. `_dayKey` rendu défensif (NaN/null → '').
- **support-banner** : regroupement par équipe ([sprint.js:80-89](squad-board/static/js/views/sprint.js#L80-L89)). Si > 1 équipe, chaque groupe est précédé d'un mini label discret (chip pastel avec dot couleur équipe), séparés par un `·` discret. Pour 1 seule équipe : rendu identique à avant (pas de label inutile).
- **sprint-header en 2 colonnes** ([sprint.js:127-149](squad-board/static/js/views/sprint.js#L127-L149) + [views.css:660-696](squad-board/static/css/views.css#L660-L696)) :
  - Colonne gauche (1.4fr) : `sprint-info` (nom + dates) + `sprint-goal-bar` intégré
  - Colonne droite (1fr) : `sprint-stats` (pts/tickets/buffer) + `progress` bar pleine largeur
  - Responsive : passe en 1 colonne sous 720px
  - Gain de hauteur vertical → board visible plus haut
- **`view-search-bar` retirée de Sprint** : `qf-search` est désormais le seul champ recherche (déjà mieux placé dans la barre quick-filters)
  - `_qfText` enrichi : matche désormais **clé, titre, leader/assignee, labels, contributors** (ajout labels + contributors)
  - Persistance sessionStorage `sprint-qfText` (compat lecture `sprint-search` pour reprise transparente)
  - Placeholder explicite : `🔍 Filtrer : clé, titre, leader, label, contributeur…`

## [3.8.3] - 2026-05-23

### Calendrier modal — bleu, ticks, indicateurs sprint, Visio
- **Sprint bar passée en bleu** : `--sprint-color` injecté = `var(--primary)` (au lieu de la couleur d'équipe violette)
  - `.cal-week-sprint-bar::before` (bordure gauche), `.cal-week-sprint-goal` (encadré objectif), `.cal-week-sprint-fill` (fill semaine) tous en bleu
  - `--team-color` toujours exposé pour usage futur si besoin
- **Today en rouge** : `.cal-week-sprint-today` (trait + point) passé de `var(--text)` à `var(--danger)` pour ressortir
- **Ticks d'extrémité** (`.cal-week-sprint-tick--edge`) ajoutés au début (0%) et à la fin (100%) du track, plus marqués que les ticks hebdo avec un point d'extrémité
- **Indicateur sprint-start/end dans `.cal-day-hdr`** :
  - Pastille verte ▶ "premier jour du sprint" (start)
  - Pastille orange ◀ "dernier jour du sprint" (end)
  - Discret, à côté du nom du jour, avec tooltip explicatif
- **Lien event location http(s) → "🎥 Visio"** au lieu de "📍 Lieu / Lien" — chip bleu arrondi distinctif (`.cal-ev-link--visio`), title contient l'URL complète

## [3.8.2] - 2026-05-23

### Fix calendrier — décalage horaire DST + doublons récurrence
- **Bug 1 (TZ DST)** : un event récurrent à `10h30 Europe/Paris` créé en hiver (CET +1) s'affichait à `11h30` en été (CEST +2) — drift de 1h
  - **Cause** : `rrulestr(..., dtstart=naive, ignoretz=True)` générait les occurrences en datetime naïf re-taggé UTC, sans tenir compte des transitions DST
  - **Fix** ([main.py:407-432](squad-board/main.py#L407-L432)) : on passe désormais `dtstart` AWARE (avec sa `tzinfo` source) à `rrulestr` ; `dateutil.rrule` gère correctement les transitions été/hiver. Les occurrences sont converties en UTC pour le payload JSON
  - Les EXDATEs sont aussi gardées aware
- **Bug 2 (doublons RECURRENCE-ID)** : un même créneau apparaissait deux fois (l'occurrence générée par RRULE + l'instance modifiée override)
  - **Cause** : ICS supporte `RECURRENCE-ID` pour remplacer une occurrence spécifique d'une récurrence ; le code ajoutait les deux
  - **Fix** : 1er passage collecte les `RECURRENCE-ID` par UID dans `overrides_by_uid` → 2e passage les exclut des occurrences RRULE générées et ajoute le VEVENT override comme événement standalone
  - **Barrière supplémentaire** : déduplication finale par `(uid, start_iso)` via `seen_keys` (protège aussi des autres cas de doublons exotiques)
- Aucun changement frontend nécessaire — le payload reste au format ISO UTC, parsé naturellement par `new Date(...)` côté navigateur

## [3.8.1] - 2026-05-23

### Modal ticket — grille de champs compactée, focus sur la description
- **Passage à 3 colonnes** (`.mdl-grid--3`) pour les champs courts → moins d'espace vertical avant la description
- **Espacement réduit** : row-gap 8px (vs sp-4), column-gap sp-3, font-size 12.5px sur les valeurs, labels 10px
- **Fusion "Créé · maj"** : Leader, Rapporteur, Créé+maj sur une seule ligne de 3 colonnes
  - Format date **"mer. 10 Juin 2026"** (helper `fmtDateLong` exporté dans utils.js) au lieu de DD/MM/YYYY
  - Sub-info "il y a Xj" en plus petit après la date (`<small text-muted>`)
- **Full-width conservé** pour les champs riches : Contributors, Epic, Labels (grid-column 1 / -1)
- **Responsive** : passe à 2 colonnes sous 720px
- Description gagne ~40-60px de hauteur visible — la lecture commence plus haut

## [3.8.0] - 2026-05-23

### Mode Demo fullscreen — présentation TV pour Sprint Review (#15)
- Nouveau bouton **📺 Demo** dans le header de la modal sprint
- Ouvre un **overlay fullscreen** sombre (fond `#0f172a` + radial gradients colorés) adapté affichage TV / vidéoprojecteur
- **Header géant** : badge état, titre du sprint avec gradient text (clamp 36–56px), équipe, objectif en encadré ambre
- **Stats XXL** : Vélocité (gradient bleu→violet avec text-shadow glow), Tickets terminés, % engagement
- **Grid de cards de wins** : tickets done triés par points décroissants
  - Card avec gradient subtil + bordure + hover lift
  - Type icon · clé monospace · chip points vert · titre · leader
- **Auto-scroll lent** des wins (1px/60ms) si overflow, **pause avec Espace**
- **Raccourcis clavier** : <kbd>Esc</kbd> quitter · <kbd>F</kbd> vrai fullscreen navigateur · <kbd>Espace</kbd> pause
- **Bouton fermer rond** en haut à droite

## [3.7.9] - 2026-05-23

### Sprint Review template Confluence-ready (#12)
- Nouveau bouton **📋 Review** dans le header de la modal sprint
- Ouvre dans un nouvel onglet un **compte-rendu HTML autonome** prêt pour réunion / Confluence / impression :
  - **Typo Georgia** (élégante pour un document) + system-ui pour les éléments fonctionnels
  - Header avec titre + badge état + meta (nom, équipe, dates)
  - **🎯 Objectif du sprint** : encadré ambre avec `sprint.goal`, ou état vide explicite si non défini
  - **📊 Métriques** : cards Vélocité (vert) · Engagement · Buffer · Tickets — chiffres en gros
  - **✅ Réalisations** : liste des tickets done triés par points décroissants (gros wins en premier)
  - **🔄 À reporter** : liste des tickets non done
  - **⚠️ Points d'attention pour la rétro** : detect auto blockers + scope creep ≥ 2 (encadré rouge), ou "Sprint propre" vert si rien
  - **🚀 Décisions & prochaines étapes** : zone vide pointillée à remplir en live pendant la réunion
  - **Footer** avec tips Ctrl+P pour imprimer + Ctrl+A/Ctrl+C pour Confluence
- `@media print` : break-after avoid sur les titres, zone notes affichée minimisée
- Utilise `window.open` + blob URL (alerte si popups bloqués)

## [3.7.8] - 2026-05-23

### Vue PI Burnup multi-équipes (#11)
- Nouveau **onglet "📈 Burnup"** dans la vue PI Planning (entre Capacité et Équipes)
- Calcul du burnup PI à partir de `sprintInfo.teamSprints[]` filtrés par numéro de PI :
  - Détecte les sprints du PI courant (regex `{piNumber}.{x}` ou `PI{piNumber}`)
  - Pour chaque (sprint, équipe), récupère la **vélocité JIRA** (priorité) ou fallback **somme des tickets done locaux**
  - Cumule SP livrés par équipe et au total
- **Header** : titre + sous-titre stats + **3 KPIs** (Engagement total · Livré à date · % atteint)
- **Chart Line** (Chart.js) :
  - **1 ligne par équipe** (couleur de l'équipe via `teamObjects`, fallback `TEAM_COLORS`)
  - **Ligne "Total livré"** en gras noir épais avec aire teintée
  - **Ligne "Engagement"** horizontale (gris pointillé) si engagement total connu
  - Tooltip mode `index` (toutes les valeurs au survol d'un sprint)
- **Légende custom HTML** sous le chart avec les noms d'équipes + pts cumulés
- Respect du filtre équipe : si une équipe est sélectionnée dans la topbar, on filtre les sprints
- État vide explicite si pas de PI configuré ou pas de sprints trouvés

## [3.7.7] - 2026-05-23

### Comparaison de sprints — shift+clic sur le chart vélocité (#6)
- **Shift / Ctrl / Cmd + clic** sur une barre du chart vélocité → ajoute le sprint à une sélection multi (sans ouvrir la modal détail)
- **Barre flottante "⚖️ N sprints sélectionnés"** apparaît sous le chart avec :
  - Compteur dynamique + petit rappel "shift+clic pour ajouter/retirer"
  - Bouton **Effacer** (clear)
  - Bouton **Comparer →** (disabled si < 2 sprints)
  - Animation `slideDown` cubic-bezier
- **Nouveau composant** [components/sprint_compare_modal.js](squad-board/static/js/components/sprint_compare_modal.js) :
  - Tableau comparatif côte-à-côte des sprints sélectionnés
  - Lignes : Engagement (estimé) · Vélocité (livrée) · Buffer (réservé) · % réalisé/engagement
  - Colonnes : nom + équipe + état (en cours/clos) + colonne **Moy.** en bout (highlight primary)
  - **Indicateur best/worst** ↑↓ : meilleur en vert, plus faible en orange (avec fond teinté sur la cellule)
  - Légende explicative en footer
- État global `_velocitySelection` (Set d'indices) — réinitialisé à chaque `destroyAllCharts`
- Auto-cleanup : la barre disparaît quand la sélection redevient vide

## [3.7.6] - 2026-05-23

### Export rapport sprint en HTML/Markdown enrichi (#5)
- Deux nouveaux boutons dans le header de la modal sprint à côté du bouton copier :
  - **📝 MD** : télécharge un **rapport Markdown enrichi** (`sprint-<name>-<YYYYMMDD>.md`)
    - Header `# 📊 Sprint name` + blockquote état/équipe/date
    - Tableau Indicateurs (Engagement, Vélocité, Buffer, Tickets, SP)
    - Sections par statut avec tableau Markdown standard (Type · Ticket · Titre · Pts · Assigné·e)
    - Liens JIRA cliquables format `[\`KEY\`](url)`
    - Footer "Généré le … via Squad Board"
    - Compatible **GitHub / GitLab / Confluence (Markdown macro) / VSCode preview**
  - **📥 HTML** : télécharge un **rapport HTML autonome** (`sprint-<name>-<YYYYMMDD>.html`)
    - CSS inline (system-ui, max-width 980px, responsive)
    - Header avec badge état coloré + stats cards (Vélocité, Engagement, Buffer hachuré, Tickets, SP)
    - **Burndown SVG inline** (idéale pointillée + courbe réelle bleue, 880×200) — généré sans dépendance Chart.js
    - Sections par statut avec bordure colorée + tableau complet (tags Buffer/Retro inline)
    - **`@media print`** : page-break-inside avoid pour impression propre
    - Ouvrable navigateur / partageable / copiable dans Confluence / imprimable
- **Téléchargement** via `Blob` + `URL.createObjectURL` + `<a download>` + toast confirmation
- Re-bind dynamique après fetch JIRA pour exporter les tickets fraîchement chargés

## [3.7.5] - 2026-05-23

### Modal d'action sur les alertes — tableau éditable
- **Lignes alertes cliquables** dans le panel aside (chip → `→` au hover) — chaque alerte expose un identifiant `actionable` (unassigned, noPoints, blocked, oldBlockers, stale, wip, scopeCreep)
- **Nouveau composant** [components/alert_modal.js](squad-board/static/js/components/alert_modal.js) avec :
  - Header avec icône + titre + count + intro pédagogique + chip équipe
  - **Tableau éditable** : Type · Ticket (clé + titre cliquable pour ouvrir le détail) · Statut badge · **Assigné·e** (datalist avec membres de l'équipe issus des absences) · **Points** (number input)
  - **Tracking dirty** : lignes modifiées surlignées en jaune (warning bg), compteur dans le bouton Enregistrer
  - **Save batch** : `Promise.all` de `api.updateTicket` + recharge globale + toast résultat
  - État vide ✅ "Plus aucun ticket ne correspond à cette alerte" si filtre vide
- **Hash routing** : `#sprint/Fuego/alert/unassigned` — partageable, supporte back/forward navigateur
  - Extension de `applyHash` dans [app.js:89-130](squad-board/static/js/app.js#L89-L130) pour parser `/alert/<id>` (avant `/ticket/<id>`)
  - Dynamic import du composant pour ne pas charger inutilement
- **Animation** : fade-in + slide-up cohérent avec les autres modales
- **Esc / backdrop** pour fermer

## [3.7.4] - 2026-05-23

### Alertes proactives dans le bandeau aside (#4)
- **`getSprintAlerts` enrichie** ([infopanel.js:540](squad-board/static/js/components/infopanel.js#L540)) avec 3 nouvelles règles :
  - **Blockers anciens > 48h** sans update (compte + ancienneté du plus vieux) → 🔴 danger
  - **Tickets stagnants** : inprog/review/test sans update depuis > 5j → ⚠️ warning
  - **Tickets sans assigné·e** : ≥ 3 hors done → ℹ️ info
  - **Scope creep enrichi** : montre les pts ajoutés (+8 pts → danger, sinon warning)
- **Refonte de la card Alertes du panel aside** ([infopanel.js:294-322](squad-board/static/js/components/infopanel.js#L294-L322)) :
  - Remplace la mini-card limitée (blocked + WIP) par les alertes **complètes de `getSprintAlerts`** (sauf success)
  - Tri par sévérité : danger > warning > info
  - **Pills compteurs** par sévérité dans le titre (🔴 N, ⚠️ N, ℹ️ N)
  - **Lignes alerte** avec bordure gauche colorée + icône + fond teinté

## [3.7.3] - 2026-05-23

### Fix filtres Activité récente — champs rares maintenant trouvables
- **Bug** : le compteur d'un chip filtre pouvait afficher `1` mais le filtre retournait "Aucune activité ne correspond" car les compteurs étaient calculés sur `max × 3` activités tandis que seulement `max` étaient rendues dans le DOM (les filtres ne peuvent agir que sur le DOM)
- **Fix** : on rend désormais TOUTES les activités collectées dans le DOM (jusqu'à `max × 10`), avec les items au-delà de `max` initialement masqués via classe `.activity-item--overflow` (display:none)
  - Quand on active un filtre spécifique : tous les matches sont révélés (sans limite)
  - Quand on revient à "Tout" : on revient à la limite initiale de `max` premiers items (via `data-default-max`)
- Collecte interne passée de `max × 3` à `max × 10` (Dashboard 150, Sprint/Kanban 200)
- Cohérence : ce qui est affiché dans le compteur du chip est toujours ce qui apparaît au clic

## [3.7.2] - 2026-05-23

### Filtres chips dans Activité récente (#2)
- **Barre de filtres** au-dessus de chaque liste d'activité — mono-sélection (un seul filtre actif à la fois)
- **Filtres par champ** (chips colorés cohérents avec les chips de ligne) : 🚦 Statut, 🏃 Sprint, ⚡ Priorité, 👤 Assigné·e, 🏷️ Étiquettes…
  - Affiche seulement les champs qui ont au moins 1 événement (pas de chips vides)
  - Trié par fréquence (le plus actif en premier)
  - **Compteur** dans chaque chip (badge `act-filter-count`)
- **Filtres par auteur** (top 5) : chips sarcelle 👤 séparés par un divider
- **Chip "Tout"** par défaut (état initial actif), permet de revenir à la vue complète
- **Filtrage côté client** sans re-render : on cache les `.activity-item` qui ne matchent pas via `display:none`
- **Message si filtre vide** : "Aucune activité ne correspond au filtre"
- **Scope par vue** (`dashboard` / `sprint` / `kanban`) : les filtres sont isolés entre les vues (pas de contamination)
- Charge **×3 d'activités** initialement pour avoir une marge après filtrage

## [3.7.1] - 2026-05-23

### Activité récente unifiée sur Dashboard / Sprint / Kanban
- **Nouveau composant partagé** [components/activity.js](squad-board/static/js/components/activity.js) qui exporte :
  - `renderActivityList(tickets, opts)` — HTML complet avec gestion de l'état vide
  - `renderActivityRow(activity)` — ligne unitaire (pour intégrations sur mesure)
  - `extractActivities(tickets, max)` — extrait + trie + limite
  - `bindActivityClicks(container)` — délègue le clic ticket vers `openTicketModal`
- **Dashboard** : migré vers le composant (suppression des 70+ lignes de helpers locaux)
- **Sprint** : ancienne `renderDailyActivity` (groupage par jour, format daily-row) remplacée par le composant unifié — même rendu chips que le dashboard, 20 derniers événements
- **Kanban** : section "Activité récente" ajoutée après le board (n'en avait pas) — 20 derniers événements
- Code et CSS factorisés : un seul endroit à maintenir pour l'apparence des activités

## [3.7.0] - 2026-05-23

### Burndown automatique dans la modal sprint (#1)
- Bloc `📉 Burndown` ajouté entre les cards de stats et la liste des tickets de la modal sprint
- Réutilise le `renderBurndown` existant ([charts.js:162](squad-board/static/js/components/charts.js#L162)) avec dataset `Ideal` (gris pointillé), `Reel pts` (bleu plein), `Tickets` (ambre)
- **Sprint actif** : « (temps réel) » avec marqueur « Aujourd'hui »
- **Sprint clos** : « (rétrospectif) » sans marqueur today (todayIdx < 0)
- Helper `_canRenderBurndown(sprint, tickets)` : skip si pas de dates ou pas de points
- Helper `_sprintDurationDays(sprint)` : calcule la durée du sprint depuis start/end
- Injection dynamique via `_maybeInjectBurndown` : si la modal s'ouvre sans tickets (cas fetch JIRA), le bloc burndown est inséré après le fetch
- Style soft : fond `surface-2` + bordure pointillée + titre uppercase 11px

## [3.6.32] - 2026-05-23

### Emoji 🆘 pour les tickets Support
- Emoji 🆘 ajouté pour les types `support` et `incident` dans `_typeIcon` ([sprint_tickets_modal.js:472-473](squad-board/static/js/components/sprint_tickets_modal.js#L472-L473))
- Visible dans la liste des tickets de la modal + dans le rapport copier

## [3.6.31] - 2026-05-23

### Rapport copier — passage en texte simple (Slack-safe)
- **Problème** : le format Markdown Slack `<URL|TEXT>` apparaissait en littéral avec le `|` URL-encodé en `%7C` côté Slack — caractères `*`, `<`, `>` visibles dans le rendu final (capture utilisateur)
- **Cause** : le rendu mrkdwn n'est appliqué que si l'option "Format messages with markup" est activée côté Slack ; le `|` est encodé lors de la copie par certains middlewares
- **Fix** : passage en **texte simple universel** ([sprint_tickets_modal.js:444-518](squad-board/static/js/components/sprint_tickets_modal.js#L444-L518))
  - Suppression de tous les `*` (gras) et `_` (italique)
  - URL en clair (Slack/Teams/Gmail auto-linkifient les URLs nues)
  - Séparateurs visuels par tirets/points : `· — ·`
  - Titre ticket tronqué à 70 caractères pour limiter la verbosité
- Format final compatible **Slack, Teams, Gmail, Outlook** sans configuration :
  ```
  📊 Sprint Fuego - Ité 29.4 — en cours · Fuego · fin 28 Mai 26

  • Engagement : 27 pts  ·  Vélocité : 4 pts (15% réalisé)  ·  🛡️ Buffer : 10 pts (37% de l'engagement)
  • Tickets : 2/12 terminés  ·  Story Points : 4/27

  ◻️ À faire — 3 tickets · 12 pts
    • 📖 https://erpc.atlassian.net/browse/GCOM-4365 — [ICER…] · 5 pts · Sébastien
    • ⚙️ https://erpc.atlassian.net/browse/GCOM-3869 — Semantic versioning · 3 pts
  ```

## [3.6.30] - 2026-05-23

### Rapport copier — emojis type, liens JIRA, "tickets" dans le compteur
- **Emojis par type** ajoutés en préfixe de chaque ligne ticket :
  - 📖 Story (US)  ·  ⚙️ Ops  ·  💸 Debt
  - 🐛 Bug  ·  ✓ Task  ·  🔬 Spike  ·  🧭 Epic  ·  ✨ Feature
  - Les labels prioritaires (🛡️ Buffer, 🔁 ActionRetro, 🩺 Postmortem…) restent prioritaires sur le type
- **Liens JIRA cliquables** au format Slack mrkdwn `<URL|TEXT>` : `<https://jira/browse/GCOM-1234|*GCOM-1234*>` → s'affiche en bleu cliquable dans Slack
  - Fallback gracieux : si `jiraUrl` absent, garde juste l'ID en gras
- **"tickets" dans le compteur des groupes** : `*✅ Terminé* (12 tickets · 38 pts)` (pluriel adapté)
- Format final :
  ```
  *✅ Terminé* (3 tickets · 12 pts)
  • 📖 <https://jira/browse/GCOM-1234|*GCOM-1234*> — US implémentation widget _(5 pts)_ — Sébastien
  • ⚙️ <https://jira/browse/GCOM-1235|*GCOM-1235*> — Déploiement infra _(3 pts)_ — Marie
  ```

## [3.6.29] - 2026-05-23

### Modal sprint — bouton copier (rapport Slack-friendly)
- **Bouton 📋 copier** ajouté dans le header de la modal sprint (à côté du bouton fermer)
- Génère un rapport **Markdown Slack-compatible** ([sprint_tickets_modal.js:444-505](squad-board/static/js/components/sprint_tickets_modal.js#L444-L505)) :
  ```
  *📊 Sprint Fuego 28.3* (clôturé · Fuego · fin 12 Mar 26)

  • Engagement : *50 pts*  ·  Vélocité : *42 pts* _(84% réalisé)_  ·  🛡️ Buffer : *5 pts* _(10% de l'engagement)_
  • Tickets : *12/15* terminés  ·  Story Points : *38/45*

  *✅ Terminé* (12 · 38 pts)
  • *GCOM-1234* — Implémenter le widget X _(5 pts)_ — Sébastien
  • *GCOM-1235* 🛡️ — Couverture buffer _(3 pts)_ — Marie
  ...
  ```
- **Groupes par statut** avec emoji (✅ Terminé, 🔄 En cours, ⛔ Bloqué…)
- **Tags inline** : 🛡️ pour les tickets Buffer, 🔁 pour ActionRetro
- Utilise `copyToClipboard` existant (+ toast confirmation)
- **Re-bind dynamique** après fetch JIRA pour copier les tickets fraîchement chargés (closure mise à jour via `cloneNode` + `replaceWith`)

## [3.6.28] - 2026-05-23

### Hover sprint allégé — focus sur les données attachées au sprint
- Lignes retirées du tooltip vélocité car non attachées au sprint hovré :
  - `Moy. 3-sprints : X pts` (moyenne glissante calculée sur N sprints, pas une donnée du sprint courant)
  - `vs moyenne : ±X pts` (delta calculé)
  - `vs objectif : ±X pts` (delta calculé)
- Datasets `Moyenne (X pts)` et `Moy. glissante (3)` **filtrés du tooltip** via `tooltip.filter: item => !/^Moy/i.test(item.dataset?.label)` — les lignes restent visibles sur le graphique (en cyan)
- Tooltip final = uniquement les données **attachées au sprint** : Engagement · Vélocité · Buffer · Objectif · Réalisé % · Buffer %

## [3.6.27] - 2026-05-23

### Activité récente — chips colorés par type de champ
- **Chip "champ"** discret coloré pour chaque type d'activité ([dashboard.js:391-461](squad-board/static/js/views/dashboard.js#L391-L461)) :
  - 🚦 Statut · bleu  ·  👤 Assigné·e · sarcelle  ·  ⚡ Priorité · ambre  ·  🏃 Sprint · violet  ·  🏷️ Étiquettes · rose
  - 🎯 Version · cyan  ·  📅 Date d'échéance · ambre  ·  🧭 Epic/Parent · violet foncé
  - 📊 Story points · bleu primary  ·  ↕️ Rang · slate  ·  👥 Équipe · orange
- **Chip "valeur"** (from/to) avec mise en forme spécifique :
  - **Statut** → couleurs des badges statut existants (badge-todo, badge-inprog, etc.) via `_statusKeyForBadge()`
  - **Priorité** → couleur par niveau (highest/blocker rouge, high orange, low/lowest atténué)
  - **Autre** → chip neutre avec bordure + tronqué à 240px
  - **Vide** → "—" italique pointillé
- **Chip ticket cliquable** : ID en monospace primary, fond `color-mix` → clic ouvre la modal du ticket
- Layout `flex-wrap` + gap 5px : les chips se positionnent naturellement et s'adaptent en mobile
- Format final : `<author> [🚦 Statut] sur [GCOM-1234] [En cours] → [Terminé]`

## [3.6.26] - 2026-05-23

### Emojis carrés colorés en préfixe dans le tooltip vélocité
- Lignes du `afterBody` (compléments sans pastille Chart.js native) préfixées par un carré coloré Unicode pour matcher la couleur de l'élément graphique correspondant :
  - **⬜ Réalisé : X% de l'engagement** (gris = engagement)
  - **🟪 Buffer = X% de l'engagement** (violet = buffer)
  - **🟦 Moy. 3-sprints : X pts** (cyan = moyennes)
  - **🟦 vs moyenne : ±X pts** (cyan)
  - **🟧 vs objectif : ±X pts** (ambre = objectif)
  - **⏳ Sprint en cours — non compté dans les stats**
- Les datasets (barres/lignes principales) gardent leur pastille colorée native Chart.js — on n'ajoute pas d'emoji là où il y aurait redondance

## [3.6.25] - 2026-05-22

### Moy. glissante en cyan (même couleur que Moyenne globale)
- Ligne `Moy. glissante (3)` passée du violet `#8b5cf6` au **cyan-600** `#0891b2` — même couleur que la Moyenne globale
- Cohérence visuelle : toutes les lignes "moyenne" sont en cyan ; le violet reste exclusivement réservé au Buffer
- Distinction entre les deux moyennes via le style : moyenne globale = pointillée (`[4,3]`) ; moy. glissante = ligne pleine avec courbure

## [3.6.24] - 2026-05-22

### Couleur "Moyenne" distincte de l'Engagement
- Ligne `Moyenne (X pts)` du chart vélocité passée du gris (`#94a3b8`) au **cyan-600** (`#0891b2`)
- Évite la confusion avec la barre `Engagement (estimé)` qui reste en gris clair
- Palette finale du chart : gris = engagement · couleur perf = vélocité · violet = buffer · cyan pointillé = moyenne · violet plein = moy. glissante 3 sprints · ambre pointillé = objectif

## [3.6.23] - 2026-05-22

### Barre Buffer violette visible sur le chart
- **3e barre overlay** dans le chart vélocité ([charts.js:680-694](squad-board/static/js/components/charts.js#L680-L694)) : barre **violette étroite au centre** (`barPercentage: 0.28`) — concentrique avec engagement (gris large) et vélocité (couleur moyenne)
- Couleur saturée `rgba(139,92,246,0.85)` + bordure `#6d28d9` (sprint clos) / plus claire pour le sprint courant
- Affichée uniquement si `data[i].bufferPoints > 0` (sprints sans buffer en base ne génèrent pas de barre)
- **Toggleable via clic légende** (comportement Chart.js natif, défaut visible)
- Order = 2 → s'affiche **au-dessus** de la vélocité (3) mais en dessous des lignes (≤ 1)
- **Tooltip déclutté** : Chart.js affiche désormais auto `[pastille violette] Buffer (réservé) : X` ; mon `afterBody` se contente d'ajouter `Buffer = Y% de l'engagement` (le ratio, pas de doublon)

## [3.6.22] - 2026-05-22

### Buffer historique pour TOUS les sprints clos
- **Nouvelle passe sync** ([sync.js:640-678](squad-board/static/js/sync.js#L640-L678)) : JQL global `labels = "Buffer"` (1 seule requête, cap 5000) → récupère TOUS les tickets buffer
- Pour chaque ticket : trouve le **dernier sprint clos** (par `endDate`) et y agrège ses Story Points dans `bufferBySprintId`
- `teamSprints[]` est patché : chaque sprint clos reçoit son `bufferPoints` réel
- `computeVelocityHistory` ([utils.js:476-481](squad-board/static/js/utils.js#L476-L481)) utilise `s.bufferPoints` en priorité (sinon fallback sur calcul depuis tickets locaux)
- **Résultat** : la ligne `🟪 Buffer (réservé) : X pts` apparaît désormais dans le hover de TOUS les sprints du chart (passés inclus), pas seulement le sprint actif
- Coût réseau marginal : 1 JQL au lieu de N appels par sprint clos

## [3.6.21] - 2026-05-22

### Activité récente — alimentée depuis JIRA + 🟪 buffer hover + accents FR
- **🟪 Carré violet** ajouté devant `Buffer (réservé)` dans le tooltip du chart vélocité — cohérent avec la couleur du concept Buffer dans toute l'app
- **Fix activité récente vide** : `recentChanges` était hardcodé à `[]` dans sync.js → ne récupérait jamais le changelog JIRA
  - Nouveau helper `_extractRecentChanges(issue)` ([sync.js:826-851](squad-board/static/js/sync.js#L826-L851)) qui aplatit `issue.changelog.histories[]` (8 derniers événements max)
  - Filtre les champs non pertinents (description, attachment, comment, link, workratio…)
  - Garde les clés techniques (status, assignee, sprint…) pour ne pas casser les filtres (`c.field === 'status'` dans sprint.js)
  - **`expand=changelog`** ajouté au helper `_paginateJql` (param optionnel) + activé pour les passes future sprints + PI-named sprints (déjà actif sur le sprint actif)
- **Accents français** sur toute l'activité récente :
  - Helper `fieldLabelFr(field)` exporté depuis [utils.js:27-55](squad-board/static/js/utils.js#L27-L55) : `status` → `Statut`, `assignee` → `Assigné·e`, `priority` → `Priorité`, `sprint` → `Sprint`, `labels` → `Étiquettes`, etc.
  - Dashboard `Activite recente` → `Activité récente` + phrase reformulée : `<author> a modifié <champ FR> sur <ticketId> : X → Y`
  - Sprint daily activity : `Aucune activite recente` → `Aucune activité récente` + traduction du champ
  - Modal ticket → Historique : même formulation avec traduction

## [3.6.20] - 2026-05-22

### Fix : doublon "Engagement (estimé)" dans le hover chart
- Chart.js affiche **automatiquement** le label du dataset dans le tooltip (`Engagement (estimé) : 50`)
- Je rajoutais en plus dans `afterBody` une ligne `Engagement estimé : 50 pts (réalisé 80%)` → **duplication visible**
- Fix : ligne afterBody reformulée en simple `Réalisé : X% de l'engagement` (information de % qui complète sans répéter)
- **Buffer (réservé) : X pts (Y% de l'engagement)** conservé tel quel dans afterBody — c'est la seule source d'affichage de l'info Buffer dans le tooltip

## [3.6.19] - 2026-05-22

### Engagement gris + Buffer dans le hover du chart
- **Couleurs harmonisées** :
  - Chart : barre `Engagement (estimé)` passée du violet au **gris clair** (`#94a3b8`)
  - Modal : card Engagement passée en gris (gradient slate + texte `#475569`, picto ▮ gris)
  - **Buffer reste totalement violet** (#8b5cf6) : card hachurée, icône 🛡️, lignes ticket teintées — sémantique visuelle claire
- **Buffer (réservé) ajouté au hover graphique** :
  - `computeVelocityHistory` calcule `bufferPoints` = somme des SP des tickets `label='Buffer'` du sprint
  - `computeCurrentSprintEntry` idem pour le sprint courant
  - Tooltip chart : `Buffer (réservé) : X pts (Y% de l'engagement)` — ligne affichée uniquement si bufferPoints > 0
  - Limitations : pour les sprints clos non chargés en base, bufferPoints = 0 (besoin d'un fetch JIRA pour avoir les tickets) ; affiché correctement pour le sprint actif et les sprints PI-named

## [3.6.18] - 2026-05-22

### Engagement en gris clair, Buffer reste violet
- **Chart** : barre `Engagement (estimé)` passée du violet au **gris clair** (`#94a3b8` slate-400) — couleur neutre cohérente avec la ligne "Moyenne" mais distincte du Buffer
- **Modal** : card `Engagement (estimé)` passée du violet au gris clair (gradient `#94a3b8` 16% + texte `#475569`) + picto ▮ gris
- **Buffer (réservé)** reste totalement violet (#8b5cf6 / #7c3aed / #6d28d9) : card hachurée, icône 🛡️, lignes ticket teintées
- Sémantique visuelle claire : violet = Buffer (capacité réservée label) ; gris = Engagement (snapshot commitment)

## [3.6.17] - 2026-05-22

### Fix : désambiguïsation Buffer / Engagement
- **Problème** : le hover du chart affichait "Buffer estimé" = **total estimé du sprint** (snapshot JIRA Velocity), incohérent avec le label "Buffer" des tickets (capacité réservée, souvent une fraction du total)
- **Chart** : la barre violette + tooltip renommés `Engagement (estimé)` — c'est sémantiquement ce qui est mesuré (commitment JIRA)
- **Modal** :
  - Card existante renommée `Buffer (estimé)` → **`Engagement (estimé)`** + nouveau picto ▮ violet (cohérent chart) + label "X% réalisé"
  - **Nouvelle card `Buffer (réservé)`** ([sprint_tickets_modal.js:55-58](squad-board/static/js/components/sprint_tickets_modal.js#L55-L58)) : somme des Story Points des tickets ayant le label `Buffer`
    - Sub-label : `N tickets · X% de l'engagement`
    - Visuel distinctif : **pattern hachuré violet** + icône 🛡️ avant le label
    - Apparaît dynamiquement après fetch JIRA aussi (gestion dans `_rerenderBody`)
- Maintenant le hover graphique et la modal sont cohérents : `Engagement` désigne le commitment, `Buffer` désigne les tickets-label réservés

## [3.6.16] - 2026-05-22

### Modal vélocité — label Buffer en violet
- **Icône 🛡️** pour les tickets ayant le label `Buffer` (capacité réservée pour imprévus) — priorité sur l'icône par type
- **Chip "Buffer"** violet à côté du leader (pill arrondie, cohérent avec les autres tags)
- **Ligne ticket teintée violet** : gradient horizontal `#8b5cf6` 8% → 2% → transparent + bordure gauche violette pleine 3px (via `box-shadow: inset 3px 0 0`)
- **Hover renforcé** : gradient un peu plus opaque pour rester lisible
- **Drop-shadow violet** sur l'icône 🛡️ pour la mettre en valeur
- Cohérence visuelle totale avec la barre **Buffer (estimé)** du chart vélocité (même couleur `#8b5cf6`)

## [3.6.15] - 2026-05-22

### Modal vélocité — fetch des sprints clos + icône ActionRetro
- **Sprints passés cliquables** : les tickets d'un sprint clos ne sont pas en base (la sync préserve la perf en ignorant les sprints clos) → au clic, **fetch à la demande** depuis JIRA via `/rest/agile/1.0/sprint/{id}/issue`
  - Spinner animé pendant le chargement (`.sb-modal-spinner` + animation `sb-spin`)
  - Pagination jusqu'à 2000 tickets / sprint (hard cap 20 pages × 100)
  - **Parallélisation** : `Promise.allSettled` quand plusieurs sprint IDs (cas cross-team)
  - **Chip "⚡ Chargé depuis JIRA"** ajoutée dans le header pour signaler l'origine des données
  - **Clic ticket fetched** = ouvre dans un nouvel onglet JIRA (`/browse/{key}`) via `window.open` (vs `openTicketModal` pour les tickets en base)
  - Gestion d'erreur réseau avec carte d'erreur dédiée
- **Icône ActionRetro** : 🔁 affichée pour les tickets ayant le label `ActionRetro` (priorité sur l'icône par type)
  - Bonus : 🩺 pour `Postmortem`, 🤝 pour `CoP`/`CommunityOfPractice`, 🔧 pour `Adapt`
  - Tooltip enrichi : « task · Action Retro »
- **Données enrichies** : `computeVelocityHistory` et `computeCurrentSprintEntry` exposent maintenant `jiraId`, `jiraIds[]` et `state` (utilisés par la modal)

## [3.6.14] - 2026-05-22

### Carte Vélocité — clic sur barre = modal de détails du sprint
- **Click handler** ajouté sur le chart vélocité ([charts.js:728-738](squad-board/static/js/components/charts.js#L728-L738)) : clic sur une barre (Vélocité ou Buffer) ouvre une modale dédiée
- **Curseur pointer** au hover via `onHover` pour signaler l'interaction
- **Nouveau composant** [sprint_tickets_modal.js](squad-board/static/js/components/sprint_tickets_modal.js) :
  - **Header** : icône + nom du sprint + badge état (en cours / clôturé) + chips équipe + date fin + chip warning si sprint en cours
  - **Cards stats** (auto-fit grid) : Vélocité primaire, Tickets, Story Points, Buffer (si dispo) — gradient violet sur la card Buffer pour cohérence
  - **Liste des tickets groupés par statut** (todo / inprog / review / test / blocked / done) avec :
    - Header de groupe coloré (gradient à la couleur du statut) avec dot pulsé, nom, count, total pts
    - Lignes ticket : icône type, clé monospace, titre, leader (initiales rondes), priorité (chip coloré), points (chip primary)
    - **Hover** = padding-left animé + fond teinté statut + cursor pointer
    - **Clic ticket** = ferme la modal + ouvre la modal de détail du ticket (`window.__squadBoard.openTicketModal`)
  - **État vide** : message d'aide expliquant que les sprints clos n'ont pas leurs tickets en base (la sync ne charge que actif/futurs/PI-named) — pédagogique
- **Animation** : fade-in overlay + slide-up modal via `cubic-bezier(0.16, 1, 0.3, 1)`
- **Esc** ou clic backdrop pour fermer

## [3.6.13] - 2026-05-22

### Carte Vélocité — Buffer (estimé) + sprint en cours
- **Buffer (estimé)** affiché en barre violette translucide en arrière-plan de chaque vélocité (overlay grâce à `grouped: false` Chart.js + `barPercentage` 0.95 vs 0.6)
  - **Toggleable via clic dans la légende** (comportement Chart.js natif, défaut visible)
  - Données issues de `velocityStatEntries[*].estimated.value` du Velocity Chart JIRA (capturé dans sync.js)
- **Sprint en cours en bout de chart** : dérivé du sprint actif via nouveau helper `computeCurrentSprintEntry(tickets, sprintInfo, team)`
  - Vélocité = somme des points done locaux (live, plus à jour que la snapshot JIRA)
  - Estimé = somme totale des points du sprint
  - **Exclu de tous les KPIs** : moy. 3 derniers, tendance, record, stabilité, % vs cible (les stats restent stables même quand le sprint courant change)
  - Barre vélocité affichée en **gris muté** (au lieu de la palette rouge/orange/bleu/vert qui code la performance)
  - Tooltip dédié : « Sprint en cours — non compté dans les stats »
- **Sparkline** : sprint courant en hachures gris (style `.velocity-spark-bar--current`)
- **KPI Dernier renommé "dernier clos"** — clarifie qu'on ne montre PAS le sprint en cours
- **Sous-titre carte** : `N sprints clos + 1 en cours (non comptés) · moy. X pts/sprint`
- **Tooltip enrichi** : affiche le buffer + ratio réalisé en plus des écarts moyenne/objectif

## [3.6.12] - 2026-05-22

### Fix : endpoint Velocity JIRA corrigé
- L'URL `rest/agile/1.0/board/{id}/velocity` retournait **404** : cet endpoint n'existe pas dans l'API publique JIRA
- Remplacé par l'endpoint Greenhopper qui alimente le Velocity Chart natif : `rest/greenhopper/1.0/rapid/charts/velocity.json?rapidViewId={boardId}`
- Backend : `rest/greenhopper/` ajouté à l'allowlist du proxy `/jira/*` dans [main.py:1881](squad-board/main.py#L1881)
- Optim : appel seulement si le board a au moins un sprint clos (évite les requêtes inutiles)
- Catch silencieux pour les boards sans estimation activée

## [3.6.11] - 2026-05-22

### Vélocité historique récupérée directement depuis JIRA
- **Problème** : la sync ne charge que les tickets du sprint actif + futurs + PI-named ; les tickets des sprints **clôturés** ne sont jamais récupérés, donc la dérivation `tickets[done] × sprintName` retournait toujours 0 sprint
- **Solution** : appel de l'endpoint dédié `/rest/agile/1.0/board/{boardId}/velocity` pendant le scan des boards scrum → récupère les **story points complétés** par sprint (les ~7 derniers clos) **sans charger les tickets**
- **Enrichissement de `teamSprints[]`** : chaque sprint clos a maintenant un champ `velocity` (SP livrés) en plus de `state`, `startDate`, `endDate`, etc.
- **Helper `computeVelocityHistory` mis à jour** : priorité 1 = `sprint.velocity` (JIRA) ; priorité 2 = somme des points done des tickets locaux (fallback pour setups sans estimation activée)
- **Log de sync** : `Sprints collectés : N entrées | M avec vélocité JIRA | sprintInfo global : ...`
- Persistance transparente : `team_sprints` est déjà une colonne JSON dans `sprintconfig` → aucune migration nécessaire

## [3.6.10] - 2026-05-22

### Fix : historique de vélocité jamais alimenté
- **Bug** : `store.velocityHistory` initialisé à `[]` n'était **jamais** alimenté par la synchro JIRA ni nulle part — résultat : carte "Pas encore d'historique de vélocité" affichée même avec des sprints clôturés en base
- **Solution** : nouveau helper `computeVelocityHistory(tickets, sprintInfo, team)` dans [utils.js](squad-board/static/js/utils.js) qui dérive la vélocité à la volée depuis `sprintInfo.teamSprints[]` (state='closed') et les tickets locaux `status='done'` (somme des points par sprint)
- **Comportement par équipe** :
  - Équipe sélectionnée : sprints de cette équipe uniquement (key = `name|team`)
  - "Toutes les équipes" / aucune : agrégation cross-team par nom de sprint (somme des points livrés par PI/sprint)
- **Filtrage** : sprints à vélocité 0 masqués (tickets purgés ou jamais done)
- **Tri** : ancien → récent par `endDate` (le chart prend `lastIdx` = dernier sprint = plus récent)
- **Branché dans** : [dashboard.js](squad-board/static/js/views/dashboard.js), [roadmap.js](squad-board/static/js/views/roadmap.js), [infopanel.js](squad-board/static/js/components/infopanel.js) (alerte "vélocité en baisse")
- Suppression des `[...velocityHistory].reverse()` désormais inutiles (helper retourne déjà l'ordre attendu par le chart)
- `store.velocityHistory` conservé comme champ d'état legacy (commenté)

## [3.6.9] - 2026-05-22

### Carte Vélocité — refonte avec KPIs et chart enrichi
- **Header KPIs** (6 chips compacts) au-dessus du chart :
  - **Moy. 3 derniers** (KPI primaire, fond bleu)
  - **Tendance** (↗/↘ % vs 3 sprints précédents) — couleur vert/orange selon le sens
  - **Dernier sprint** (valeur brute)
  - **Record** ⭐ (meilleure vélocité observée)
  - **Stabilité** (label + coefficient de variation CV%) — vert si très stable, rouge si instable
  - **vs Objectif** 🎯 (% du dernier sprint vs `piInfo.velocityTarget`) si défini
- **Sparkline** sous le chart : mini-barres pour tous les sprints, dernier sprint en couleur primaire pleine, record en vert
- **Bordure gauche colorée** (gradient) selon la tendance générale : vert si en hausse ≥10%, orange si baisse ≥10%, bleu sinon
- **Chart enrichi (`renderVelocityChart`)** :
  - **Barres colorées** selon performance vs moyenne globale : vert ≥+10%, bleu entre ±10%, orange entre −10/−20%, rouge < −20%
  - **Ligne horizontale "Moyenne"** (gris pointillé) — référence visuelle immédiate
  - **Moyenne glissante 3 sprints** (ligne violette)
  - **Objectif** (ligne ambre pointillée) si `velocityTarget` défini
  - **Tooltip enrichi** : moy. 3-sprints, écart vs moyenne, écart vs objectif

## [3.6.8] - 2026-05-22

### PI Objectives attainment — refonte esthétique cohérente
- **Bordure gauche en gradient** sur la card `.pi-obj-attain` (cohérent sprint-header), couleur dynamique selon le score (vert/orange/rouge/violet)
- **Track 12px** avec `inset shadow` (au lieu de 10px plat)
- **Fill avec gradient + drop-shadow** colorés selon le score
- **Bonus zone (>100%)** : rayures plus larges (5px), `border-radius`, ombre verte subtile
- **Marqueur cible 80%** : trait + point 10×10 avec ring blanc + shadow (cohérent today marker)
- **Échelle scale repositionnée** : "80% cible" centré sur le marqueur (au lieu de réparti à part égale) — alignement vertical avec la ligne
- **Variables CSS `--accent-color`** pour découpler couleur logique de classe (plus DRY)

## [3.6.7] - 2026-05-22

### Modal calendrier — barre sprint alignée sur le style dashboard
- Layout vertical (head au-dessus, track en dessous full-width) pour cohérence visuelle avec le sprint-header dashboard
- **Bordure gauche colorée** (gradient à la couleur de l'équipe) — identité forte
- **Émoji 📌** devant le nom du sprint, taille de police harmonisée
- **Chips dates** et **chip J-N coloré** (pastilles arrondies) — remplace les spans inline disparates
- **Badge état pastille** (Clos / Actif / À venir) en pill arrondi
- **Track plus haut** (12px) avec gradient + ombre portée à la couleur de l'équipe
- **Today marker** : point 10×10 avec ring blanc + drop-shadow (cohérent avec dashboard)
- **Échelle dates** plus lisible : 10px avec tabular-nums, label centré sur fond blanc
- **Bandeau objectif 🎯** : padding/radius cohérents

## [3.6.6] - 2026-05-22

### Sprint header dashboard — refonte esthétique
- Layout vertical (au lieu d'un flex justify-between) → meilleure homogénéité, occupe toute la largeur disponible
- **Bordure gauche colorée** (gradient violet) sur le sprint-header pour une identité visuelle forte
- **Chip "J-N"** en pastille violette (ou orange si retard) à côté du nom du sprint
- **Chips stats** : `4/184 pts` en gros + chip écart coloré (vert avance / orange retard) — plus de petit texte aligné à droite
- **Objectif sprint** affiché en bandeau dédié avec emoji 🎯 et bordure gauche violet clair
- Barre de progression plus haute (12px) avec **gradient sur les fills** et **ombre portée** subtile à la couleur du statut
- **Label % accolé** à la fin du fill points (pastille blanche avec bordure) — lecture instantanée du pourcentage
- **Marqueur "aujourd'hui"** : point noir 10×10 avec ring blanc + shadow pour bien ressortir, label date du jour en gras avec puce
- Animations cubic-bezier(0.16, 1, 0.3, 1) pour les transitions de largeur

## [3.6.5] - 2026-05-22

### UX panneau latéral + dashboard
- **`+N autres` cliquable** dans le panneau aside (groupes de tickets par statut + buffer) : expand/collapse de la liste cachée avec animation chevron ▾/▴
- **Clic sur un mini-ticket** dans le panneau aside → ouvre la modale du ticket (la zone redevient interactive)
- **Barre sprint dashboard enrichie** : barre simple `width:X%` remplacée par un track avec :
  - **Fond temps écoulé** (violet clair) — visualise où on en est dans la durée
  - **Avant-plan points livrés** (vert/orange/rouge selon %)
  - **Marqueur "aujourd'hui"** (trait vertical noir + point) à la position temporelle exacte
  - **Échelle dates** sous la barre : `12 mai`, `aujourd'hui (22 mai)`, `25 mai`
  - **Texte d'écart** : `+8% d'avance` (vert) ou `-15% de retard` (orange) — comparaison instantanée pts vs temps

## [3.6.4] - 2026-05-22

### Dashboard — atteinte des objectifs PI
- Nouvelle section **Objectifs PI** dans le dashboard (filtre équipe respecté) avec calcul du **score de prédictibilité SAFe** : `(BV commis livrés + BV stretch livrés) / BV commis total`
- Score affiché en grand (vert ≥100%, orange ≥80%, rouge sinon) avec libellé détaillé `Atteinte X/Y BV commis +Z BV stretch`
- **Barre d'atteinte** avec marqueur "cible 80%" et zone bonus hachurée pour les stretch livrés au-delà de 100%
- **Récap chips** : nb commis / stretch / atteints / en cours / à faire
- **Liste détaillée** triée (commis d'abord, puis par BV décroissant) : icône statut, texte, équipe, type (Commis/Stretch), BV

## [3.6.3] - 2026-05-22

### Fix
- **Doublons d'équipes en sync rapide** : la sync incrémentale (mode merge) créait une nouvelle ligne Team à chaque sync au lieu de mettre à jour l'existante, car sync.js n'envoie pas d'`id` pour les teams. Lookup par nom ajouté en fallback dans le merge handler.
- **Dédoublonnage automatique** des teams existantes au début de chaque merge — garde le plus ancien par nom, supprime les doublons accumulés des anciennes versions.

## [3.6.2] - 2026-05-22

### Configurable + lisibilité
- **Période de sync rapide configurable** dans Paramètres → Plugin JIRA (`sb-sync-quickDays`, default 14). Le bouton topbar reflète dynamiquement la valeur (`JIRA 7j` / `JIRA 30j` / ...) et l'item correspondant du dropdown est mis en évidence
- **Graduation temporelle** sur la barre sprint de la modal calendrier : ticks verticaux toutes les semaines + échelle dates concises (`12 mai`, `19 mai`, `25 mai`) sous le track — permet de se repérer rapidement dans la durée du sprint
- Fix : la barre sprint ne se cachait plus si la semaine navigée tombait juste après/avant le sprint (puisque `getSprintForTeam` gère déjà le sprint le plus proche)

## [3.6.1] - 2026-05-22

### Sync JIRA incrémentale
- **Sync rapide** par défaut sur le bouton JIRA topbar : filtre les JQL sur `updated >= -14d` + mode `merge` (préserve l'existant non touché)
- **Split button** avec dropdown : choix entre 7j / 14j / 30j / Sync complète
- **Sync complète** (replace) accessible via le dropdown, avec confirmation stylée (action destructrice — efface puis ré-importe tout)
- Toast adapté : `Sync rapide 14j terminée — X tickets, Y features`
- Affichage initial : `JIRA 14j` pour faire comprendre le mode par défaut

### Cohérence sprint passé / présent / futur dans la modal calendrier
- Sync collecte désormais TOUS les sprints du board (state=closed,active,future, max 50 par board) avec fallback 3 appels séparés si le state combiné échoue
- `getSprintForTeam(team, sprintInfo, targetDate)` retourne le sprint qui contient la date cible (semaine navigée)
- Navigation ← / → dans la modal : la barre suit avec le bon sprint, badge état (Clos / Actif / À venir), objectif d'époque
- Fix bug : `String(Date).slice(0,10)` ne donnait pas une ISO date → matching toujours faux. Remplacé par helper `_toIso(d)` qui gère Date et string

## [3.6.0] - 2026-05-21

### Sync JIRA - robustesse et couverture
- **Pagination réécrite** via helper `_paginateJql` : utilise `nextPageToken` (API moderne JIRA Cloud) avec fallback `startAt`, dédoublonnage `seenKeys`, hard cap 100 itérations. Corrige les imports plafonnés à 100 items
- **Passe PI-named-sprint** : récupère les issues dont le sprint s'appelle directement `"PI30"` / `"PI#30"` (cas GCOM) — couvre les projets qui ne créent pas d'issues type `Feature`
- **Normalisation auto des équipes** : `"GCOM - Fuego"` (JIRA Team[Team]) → `"Fuego"` via match avec les boards locaux (aucune config manuelle)
- **Sprints multiples par équipe** : `teamSprints[]` collecté pendant la sync, un sprint actif par board scrum. `getSprintForTeam(team, sprintInfo, targetDate)` pour la sélection contextuelle
- **Champ Story Points propagé** côté backend (`Feature.points`) + helper `f.points || childPts || 0` dans les vues
- **Rang JIRA préservé** : assignation séquentielle dans l'ordre `ORDER BY rank ASC`, persisté en base
- **Field discovery élargi** : Sprint, Team[Team], Story Points résolus par `clauseNames` ou nom (accepte input JQL `"Sprint"` ou ID `customfield_10021`)
- **Push sprint vers JIRA** : bouton dans Paramètres avec confirmation détaillée (PUT `/rest/agile/1.0/sprint/{id}`)

### Roadmap PI suivant
- **Vue Liste** (collapsible accordions) en plus de la vue Cartes (toggle Cartes/Liste)
- **Drag-and-drop** sur les 3 vues (current + next cartes + next liste) via helper factorisé `_wireFeatureDrag`
- **Statut "rollup" parent** : badge dérivé des enfants (blocked > done > inprog > todo)
- **Features héritées** : remontée auto via la chaîne `ticket → epic → feature` quand la feature est tagguée PI-1 mais a des tickets PI suivant
- **Proxy-epics** : epics avec children PI suivant mais sans feature parente, affichés comme proxy-features (badge violet `epic`)
- **Carte Prédictibilité** : moyenne SP livrés sur 2 PI précédents, capacité jours-homme nette (membres × sprints × jours - absences), tooltip détaillé
- **Lien JIRA externe** sur chaque clé de la vue liste, opacité 0 → 1 au survol

### Calendrier (modal cal-week)
- **Pagination semaine** : boutons `‹ • ›`, badge "Cette semaine"/"Semaine prochaine", raccourcis clavier `← → T Échap`
- **Barre sprint** sous le header : nom + dates + badge J-N + visualisation position semaine dans le sprint + marqueur "aujourd'hui"
- **Objectif sprint** affiché en bandeau coloré avec bordure gauche à la couleur de l'équipe
- **Bouton sync** dans le header avec tooltip "Dernière synchro : …"
- **Demi-journées OFF** (`"Elsa - 1/2 OFF"`, `"Marc - PM OFF"`) reconnues et affichées comme chip avec badge `½` (au lieu d'une ligne event)
- **Sprints passés/futurs** affichés selon la semaine navigée — cohérence du contexte

### Info-panel (sidebar)
- **Carte action "Voir le calendrier"** au-dessus de la card Features, avec compteur calendriers + dernière sync
- **Compteur Features filtré par équipe** (bug : affichait le total global)

### Page de test `/tests/jira-explorer.html`
- Refonte UX avec tabs (Inspection / Snapshot / JQL), topbar sticky, presets chips colorés (Fuego PI#30, Features GCOM, Epics sans parent…)
- **Hash routing** : `#tab=jql&jql=…`, `#tab=inspect&key=GCOM-1234&chain=1` (back/forward navigateur supporté)
- **Comparaison locale ↔ JIRA** : bannière `N / M synchro` + colonne "Local" par ligne (✓ type / ✗ absent)
- **Bouton Synchro** : upsert via `/api/import?mode=merge` (préserve rank/points existants)
- **Historique JQL** : 15 dernières requêtes en localStorage, panneau toggle + datalist autocomplete
- **Colonne SP** dans le tableau JQL, fetch story points field

### UX globale
- **Bouton "Mes tickets"** (topbar) : filtre par `leader === currentUser`, prompt initial pour saisir son nom (stocké localStorage)
- **Recherche temps réel** sur Sprint et Kanban : input avec debounce 200ms (id, titre, leader, labels), restauration focus après re-render
- **Confirmations destructives stylées** : helper `confirmDanger(title, msg)` remplace `confirm()` natifs (modale avec bouton rouge, raccourcis `Échap`/`Entrée`)
- **Bouton "Copier"** sur l'en-tête modal : copie `GEX-17193 - Titre` dans le presse-papier
- **Membres dérivés des absences** : agenda, support, PI Planning, Roadmap utilisent `deriveMembersFromAbsences(absences, members)` (source de vérité CSV RH)
- **Statut feature dérivé** : badge utilise le rollup des enfants au lieu du statut JIRA propre (cohérence d'avancée)
- **Bouton ouvrir epic/feature** dans la modal ticket (à côté du dropdown Epic)

### Paramètres
- **Configuration sync JIRA** repensée : Max tickets/features/epics, Max boards (vide = illimité), Champ Sprint, Champ Équipe (accepte JQL ou customfield_XXXXX)
- **Lien Board JIRA** depuis le formulaire Sprint
- **Rotation support** : membres autocomplétés depuis les absences (CSV RH)

### Backend
- Nouvelles colonnes : `feature.rank`, `feature.points`, `sprintconfig.jira_id`, `sprintconfig.jira_board_id`, `sprintconfig.team_sprints`
- Proxy `/jira/*` gère les réponses vides (204 No Content) — fix pour PUT sprint
- Epic `feature_id` correctement persisté depuis sync (`epic.parent.key` envoyé en `"feature"` au lieu de `"epic"`)

## [3.5.3] - 2026-04-15

### Rapports - Message Slack fun pour le sondage
- Bloc "Message Slack - Sondage Mood Meter" en haut de la section Mood Meter / ROTI
- 10 templates thématiques (roller coaster, film, énergie, cuisine, musique, jeu vidéo, météo, GIF, course, avion) avec rotation automatique par numéro de sprint (sprintNum % 10)
- Layout 2 colonnes : message brut copiable (codes emoji Slack) + aperçu visuel dark (fond #1a1d21)
- Bouton "📋 Copier" pour envoyer directement dans Slack
- Bannière info "À envoyer au plus tard le…" calculée 2 jours ouvrés avant la fin du sprint

## [3.5.2] - 2026-04-15

### Rapports - section Mood Meter / ROTI
- Nouvelle section non-exportable dans les Rapports : sondage de satisfaction par equipe
- Vote emoji 😡😟😐🙂😍 (1-5) persisté en base (`MoodVote`, clé `team × piSprint`)
- Barres de distribution par niveau pour chaque equipe
- Score moyen large (X/5) coloré vert/orange/rouge selon seuil
- Badge global (moyenne toutes equipes + total votes)
- Sparkline historique si votes sur plusieurs sprints/PI
- Bouton "↩ Annuler" pour retirer son dernier vote
- Backend : ajout `DELETE /api/mood/{id}` + chargement dans `loadAllData`

## [3.5.1] - 2026-04-14

### Corrections
- **Vue Amelioration** : affiche desormais les tickets ordinaires categorises par labels (retro, postmortem, cop, adapt) en plus des RetroItems crees directement dans le board
- **Sync JIRA** : nouvelle etape 6 qui fetche via JQL les tickets avec labels amelioration (Retro, Amelioration, postmortem, Adapt, CoP-methodo…) independamment du sprint actif
- **Normalisation labels** : les accents dans les labels JIRA (Retro, Amelioration, CoP-methodo) sont normalises avant la categorisation  
- **Demo data** : ajout de 8 tickets retro-tagges (2 par categorie) et 5 tickets support pour peupler ces vues des le premier lancement

## [3.5.0] - 2026-04-14

### Nouvelles vues
- **Support dashboard** (`S`) : rotation actuelle, tickets support par priorite/equipe, metriques SLA (age moyen, critiques)
- **ROAM board** (`R`) : matrice 5 quadrants (Non traites / Pris en charge / Acceptes / Mitiges / Resolus) avec CRUD complet
- **PI Calendrier** (`5`) : vue timeline du PI avec blocs de sprints par equipe, events, rotation support et marqueur "Aujourd'hui"

### Ameliorations existantes
- **Notifications** : badge rouge sur Dashboard/Sprint/Kanban indiquant les tickets modifies depuis la derniere visite
- **Export PDF** : bouton dans la vue Rapports (`window.print()` + CSS `@media print`)
- **Epic Burndown** : nouvelle section dans Rapports avec barre de progression par epic (tickets + points)
- **PI Objectifs BV** : champs Business Value (0-10) et Commis/Stretch sur chaque objectif PI dans Parametres
- **Backlog ranking** : drag & drop sur la liste des features dans Roadmap, rank persiste en base
- **Graphe de dependances** : visualisation SVG des liens entre features dans Roadmap

### Backend
- Nouveau modele `Risk` (quadrant, impact, probabilite, mitigation) avec CRUD `/api/risks`
- Champs `rank` et `dependencies[]` sur `Feature` (migration automatique SQLite)
- Route `/api/features/rank` (POST) pour mise a jour bulk du rang
- Export JSON inclut maintenant les risques

### Frontend
- 3 nouveaux NAV_ITEMS : Support (`S`), ROAM (`R`), PI Calendrier (`5`), Parametres passe a `9`
- Nouvelles icones SVG : `i-shield`, `i-clock`, `i-git-branch`, `i-download`
- 14 tables SQLite au total

## [3.4.0] - 2026-04-12

### Scrum Master features (6/6)
- **Drag & drop** : deplacer les tickets entre colonnes par glisser-deposer sur le board Sprint
- **Scope creep detection** : alerte quand des tickets sont ajoutes apres le debut du sprint
- **Velocity trend alert** : alerte quand la velocity baisse de >15% sur les 3 derniers sprints
- **Retro board** : nouvelle vue Amelioration (`6`) avec 4 swimlanes (Retro, Post-mortem, CoP, Adapt), CRUD complet
- **Mood meter / ROTI** : vote de satisfaction (1-5) par equipe dans PI Planning → onglet Mood
- **Fist of Five** : vote de confiance PI par equipe dans PI Planning → onglet Fist of Five

### Backend
- Nouveau modele `RetroItem` (source, status, team, owner) avec CRUD `/api/retro`
- Nouveau modele `MoodVote` (type mood/fist, team, value 1-5) avec CRUD `/api/mood`
- 13 tables SQLite au total

## [3.3.0] - 2026-04-12

### Inline styles cleanup
- 40+ classes CSS utilitaires creees (text-danger, inline-flex-center, chart-h-sm, etc.)
- ~90 inline styles statiques remplaces par des classes dans 14 fichiers JS

### Settings collapsibles
- Toutes les sections Parametres sont collapsibles avec chevron
- Membres, Absences, Events, Support plies par defaut

### Sidebar equipes groupees
- Les equipes sont regroupees par ligne produit dans la sidebar
- Bouton "Tous" renomme, plus compact

### Equipes en grille
- Section Equipes dans Parametres affichee en grille multi-colonnes

### Documentation
- 6 guides persona : Scrum Master, Product Owner, RTE, Developpeur, Support, Project Manager
- Backlog de 46 features classees par persona et priorite

## [3.2.0] - 2026-04-11

### Rapports enrichis
- 7 sections : Sprint, Flow, Support, Roadmap, Equipes, PI, Complet
- 3 formats visuels : Texte, Slack (preview dark), Confluence (preview table)
- Preview Slack fidele (fond #1a1d21, badges colores, emojis)
- Preview Confluence fidele (tableaux, lozenges de statut)
- Copier par section, sticky controls

### KPI colorises
- Cartes metriques avec bordure gauche coloree + icone emoji
- Couleur dynamique selon la valeur (vert/jaune/rouge)
- Dashboard, Kanban, PI Planning, Roadmap

### Icone Roadmap
- Nouvelle icone carte (i-map) distincte de l'icone Rapports

## [3.1.0] - 2026-04-11

### Sprint view enrichie
- **3 modes de board** : Colonnes, Swimlanes (par assignee), Liste compacte - persiste en localStorage
- **Quick filters** : Bloques, Non assignes, Critique/High + recherche texte
- **Banniere support** : qui est au support cette semaine
- **Activite du jour** : changements groupes par jour avec badges de transition
- **Charts collapsibles** : section metriques avec etat persiste
- **Sticky header** : sprint info + filtres colles sous le topbar

### Modal enrichie
- Cycle time + Lead time en chips dans la barre meta
- Barre de progression sprint avec marqueurs debut/fin ticket
- Navigation prev/next (boutons + fleches ←→)
- Priorite colorisee avec emoji
- Epic avec titre resolu

### Cartes
- Compteur de commentaires (badge 💬)
- Alerte synchro si >2h (banniere jaune)

### Sidebar
- Tooltips hover sur les compteurs de statut (liste des tickets)
- Buffer tracking dans le sprint header

### Events (Faits marquants)
- Modele Event : incident, gel, jalon, periode, info
- CRUD complet + UI dans Parametres

### Support rotation avancee
- Verrouillage, mode semaine (Lun→Ven / Ven→Jeu / Mer→Mar)
- Effectif par semaine configurable
- Shuffle automatique sur 4 semaines

### Config PI
- Numero PI, nom, sprints/PI, duree sprint, objectif velocity

## [3.0.0] - 2026-04-10

### Migration SQLite
- Remplacement des fichiers JSON par SQLite via SQLModel
- 1 fichier `data/board.db` pour toutes les entites
- Transactions ACID, requetes SQL ciblees

### Leader + Contributors
- Champ `leader` (responsable principal) et `contributors[]` (secondaires)
- Avatars empiles sur les cartes, multi-select dans les formulaires
- Retrocompat `assignee` = alias de `leader`

### Groupes (Lignes produit)
- Modele TeamGroup : nom, couleur, equipes[]
- Filtre topbar par groupe ou equipe individuelle

### Absences + Support rotation
- Modeles Absence et SupportRotation avec CRUD + import bulk

## [2.0.0] - 2026-04-09

### Board autoporteur
- CRUD complet pour tickets, features, epics, membres, equipes
- Commentaires sur les tickets
- Sprint et PI configurables
- Import/Export JSON
- JIRA comme plugin d'import optionnel

## [1.0.0] - 2026-04-09

### Version initiale
- FastAPI backend + proxy JIRA
- 6 vues : Dashboard, Sprint, Kanban, PI, Rapports, Parametres
- Mode demo automatique
- Dark mode, responsive, raccourcis clavier
