# Règles métier — Squad Board

> Détail des conventions et règles métier. `CLAUDE.md` n'en garde que les footguns
> critiques + un pointeur vers ce fichier. Pour le plugin JIRA, voir [plugin-jira.md](plugin-jira.md).

## Tables SQLite
- **ticket** : id, title, type, status, team, leader, contributors[], points, priority, epic_id, labels[], comments[], recent_changes[], sprint_name, pi_sprint
- **feature** : id, title, status, team, leader, priority, pi_sprint, **rank** (ordre backlog JIRA, 0 = priorité haute), **points** (Story Points propres à la feature côté JIRA)
- **epic** : id, title, status, team, **feature_id** (parent feature, mapping `epic.parent.key` → `feature_id` côté JIRA), pi_sprint
- **member** : id, name, team, role
- **team** : id, name, color
- **teamgroup** : id, name, color, teams[] (noms d'equipes)
- **absence** : id, member_name, team, start_date, end_date, type, days, note
- **supportrotation** : id, team, week_label, week_start, week_end, members[]
- **sprintconfig** : name, start_date, end_date, goal
- **piconfig** : number, name, objectives[] (PI courant), pi_objectives{} (snapshot par PI), pi_members{} (snapshot par PI)

## Conventions de données
- `leader` = responsable principal (anciennement "assignee")
- `contributors` = membres secondaires (JSON array)
- `teamgroup.teams` = liste de noms d'equipes (pas d'IDs)
- Toujours echapper avec `esc()` avant innerHTML (XSS)
- `__table_args__ = {"extend_existing": True}` sur tous les modeles (hot reload)
- **Source de vérité des membres d'équipe** = la table `absence` (importée d'un CSV RH à jour).
  Pour les vues qui listent les personnes ou calculent une capacité (agenda, support, PI Planning,
  Roadmap, PI Calendrier), utiliser `deriveMembersFromAbsences(absences, members)` depuis `utils.js`.
  Garder `store.get('members')` brut uniquement pour l'autocomplete de modales et la recherche globale.
  La table `members` peut contenir des artefacts JIRA (assignees/reporters d'autres équipes).
- **Statut "rollup" des parents** (feature, epic) = dérivé de leurs enfants via `rollupStatus(children, fallback)` :
  `blocked` si un enfant bloqué > `done` si tous terminés > `inprog` si progression > `todo` sinon.
  Fallback sur le statut propre JIRA quand pas d'enfants. Appliqué aux badges des features dans roadmap
  (current + next PI cards/list) et pi.js (onglet Features). Le tooltip explique l'origine.

## Convention PI (sélecteur topbar + matching features)
- **Sélecteur PI topbar** (`piOffset` dans le store, valeurs -2..+2) — visible sur les vues du set `PI_VIEWS`
  (`pi`, `picalendar`, `roadmap`, `settings`, `support`, `dashboard`) dans [topbar.js](../static/js/components/topbar.js).
  `0 = courant`, `>0 = futur`, `<0 = passé`.
- **⚠ SOURCE UNIQUE du PI courant** = `getCurrentPi({ sprintInfo, piInfo })` ([utils.js](../static/js/utils.js)). **Toujours l'utiliser**,
  ne jamais réimplémenter la regex localement (cause historique de bugs d'affichage entre vues). Règle : **PI du sprint actif JIRA
  en priorité** (`extractPiNum(sprintInfo.name)` via `(\d+)\.\d+` ou `PI\s*#?\s*(\d+)`) **> fallback `piInfo.number`** (la config
  Settings peut être obsolète). `extractPiNum(name)` est le helper bas niveau d'extraction. Le sélecteur écoute `store.on('sprintInfo')`
  pour se rafraîchir après sync JIRA ; masqué si PI = 0.
- **Désync config/sprint** : si `piInfo.number` ≠ PI du sprint actif, un bandeau ⚠️ « Recaler sur PI#xx » s'affiche dans
  Settings → Sprint & PI (bouton `#pi-desync-realign`). Le N° est la source de vérité de la config ; le champ « Nom du PI » reste libre.
- **Objectifs PI historisés** : `piInfo.objectives` = jeu VIVANT du PI courant ; `piInfo.piObjectives` = `{ "29": [...], "30": [...] }`
  snapshot par PI (backend `PIConfig.pi_objectives`). `PUT /api/pi` snapshot auto sous `[number]` à chaque save ;
  `PUT /api/pi/objectives/{pi}` pour un PI passé/futur sans toucher au courant. Dashboard/PI Planning lisent le snapshot pour les PI ≠ courant.
- **Matching feature ↔ PI** : utiliser `_matchFeaturePi(f, piTag)` (roadmap.js) — tolérant multi-source dans cet ordre :
  `f.piSprint` (priorité, format `PI#NN`) > `f.sprintName` > chaque label de `f.labels` > pattern `NN.x` (sprint `Fuego - Ite 29.3` → PI 29).
  Normalisation casse + espaces. **Règle métier** : une feature sans `piSprint` (champ Sprint JIRA absent) n'apparaît dans
  **aucun** PI — c'est voulu. Pour la rendre visible, ajouter un Sprint sur le ticket Feature côté JIRA + resync.

## Filtrage par équipe : tickets ET features
- Toute vue affichant tickets OU features par équipe doit utiliser `filterByTeam(items, team)` ([utils.js](../static/js/utils.js)).
  `filterByTeam` gère les 3 cas : équipe spécifique → `t.team === team`, `'all' + groupe sélectionné` → équipes du groupe,
  `'all' + pas de groupe` → tout (vue globale RTE).
- **Footgun récurrent** : oublier de filtrer les features (parce qu'on pense "tickets" par réflexe). Le champ `feature.team`
  vient de `Team[Team]` JIRA (équipe agile responsable, sémantique SAFe — cf. section ci-dessous), donc le filtre fait sens.
- Quand on ajoute un compteur/onglet "Features (N)", N doit être la longueur de la liste **filtrée**, pas du store brut.
  Le `featureList` enrichi (progress, rolledStatus) doit `.map` sur la liste filtrée, pas sur le store global.

## Import CSV Absences (formats supportés)
Deux formats auto-détectés dans [settings.js](../static/js/views/settings.js) :

1. **Pivot RH** (prioritaire si ≥ 3 colonnes date dans l'en-tête) :
   ```
   NOMS, Prénom	Équipes	Entité	Rôles	03/04	06/04	07/04	…
   LENOM, Alain	Team Ami	Capgemini	Data		1		…
   ```
   - Une absence créée par cellule non-vide. Cellule = nombre de jours (1, 0.5, 0,5).
   - **Consolidation auto** : les jours consécutifs d'un même membre sont regroupés en
     une seule absence avec `startDate`/`endDate`/`days` (somme). Vendredi → lundi est
     considéré contigu (gap calendaire ≤ 3j = week-end). Cf. `_consolidateConsecutive`.
   - Année saisie via champ dédié (défaut année courante). Si la date inclut l'année (`03/04/2026`), elle prime.
   - Split TAB ou `;` uniquement — **jamais sur virgule** (les noms RH ont la forme `"NOM, Prénom"`).
   - Members synchronisés en upsert via `bulkMergeMembers` (entité + rôle enrichis sur les Members existants).

2. **Ligne par absence** (fallback) : `Nom;Equipe;Debut;Fin;Type;Jours`.

### Équipes transverses
Les patterns `"Team X"`, `"TRV"`, `transverse`, `pool`, `shared` (regex casse-insensible dans `_isTransverseTeam`) sont **enregistrés tels quels** dans la table absences. Ils n'apparaissent **pas** dans la rotation support ni dans la capacité par équipe car le filtre `m.team === <équipe agile>` ne matche pas. C'est voulu — ces personnes sont trackées (utile pour l'agenda global) mais pas comptabilisées dans une équipe agile spécifique.

## Mode semaine Support (jour de début)
Constante `SUPPORT_WEEK_MODES` dans [utils.js](../static/js/utils.js) — 3 modes supportés (cf. backend `SupportRotation.week_mode`) :
| Clé | Jour de début | Plage |
|-----|---------------|-------|
| `monday`    | Lundi    | Lun → Dim |
| `wednesday` | Mercredi | Mer → Mar |
| `friday` (défaut) | Vendredi | Ven → Jeu |

- **Default** = `friday` (= 1er jour de sprint sur la plupart des équipes — cf. `SUPPORT_WEEK_MODE_DEFAULT`).
- **Stockage par équipe** : `localStorage.rot-mode-<team>` lu via `getSupportWeekMode(team)`.
- `buildSupportPiWeeks(piInfo, sprintInfo, weekMode)` snap le début du PI au jour cible (recul max 6 jours) puis itère sur 7 jours par semaine.
- **UI** : sélecteur dans Settings → Rotation Support (par panneau équipe) et dans Support → timeline (par panneau équipe). Changer le mode déclenche un re-render local.
- Les semaines sont recalculées **par équipe** dans le rendu (chaque équipe peut avoir son propre mode) — les rotations générées portent le mode dans leur champ `weekMode`.

## Règles métier Rotation Support
Centralisées dans `utils.generateSupportRotation` ([utils.js](../static/js/utils.js)) — utilisées par Settings (grille) et la vue Support (timeline + bouton de génération). **Une seule source de vérité, modifier ici uniquement.**

1. **Absence ≥ 3 jours dans la semaine → exclu** (source = table `absences` = CSV RH, cf. `supportAbsenceDays`).
2. **Pas 2 semaines consécutives** : un membre affecté en semaine N est exclu en N+1. Contrainte **relâchée** si pool insuffisant (`pool.length < membersPerWeek`) — mieux vaut quelqu'un que personne.
3. **Verrouillage DUR du passé** : toute semaine dont `weekEnd < today` n'est **JAMAIS** shuffle/réécrite, **même sans entrée existante** (une semaine passée vide est émise vide + `_autoLocked: true`). Garantie au niveau algorithme → s'applique à TOUS les points de shuffle (Settings, Support, et toute page future). Cadenas 🔒 non cliquable dans l'UI ; cellules `disabled`.
4. **Verrouillage manuel** : `rotation.locked === true` → préservée même dans le futur. Toggle 🔓/🔒 par semaine dans la grille Settings ([data-rot-lock]) — crée une entrée vide `locked:true` si la semaine n'existait pas. Backend : champ `SupportRotation.locked`, modifiable via `update_support` / `create_support`.
5. **Équité** : compteur d'affectations cumulées (passé inclus). Tri ascendant, tirage aléatoire pour les ex-aequos.
6. **membersPerWeek** : configurable via `localStorage.rot-mpw-<team>` (défaut 2).

### Préservation lors d'un shuffle PI suivant
Le endpoint `/api/support/bulk` clear par `team` avant insert → quand on régénère uniquement le PI suivant, **il faut renvoyer le PI courant existant** dans le payload pour ne pas le perdre. Cf. `_shuffle` dans [support.js](../static/js/views/support.js) qui concatène `otherPiSupport + rotations`.

### Semaines du PI
Construites par `buildSupportPiWeeks(piInfo, sprintInfo)` — utilise `piInfo.sprintsPerPI` et `piInfo.sprintDuration` (défauts 5 × 14j). Le PI courant est ancré sur le sprint actif via regex `/(\d+)\.(\d+)/` sur `sprintInfo.name`.

## Convention team mapping (features JIRA)
- Priorité dans `transformIssue` ([sync.js](../static/js/sync.js)) : **`Team[Team]` JIRA > nom du board > `extractTeam(sprint)` > `'Autre'`**.
- Sémantique SAFe : `Team[Team]` = équipe agile responsable ; un board peut être cross-team (ex: `"PI Board Features ERPC"`)
  donc ne doit pas écraser l'équipe métier. La passe features JQL **réévalue** `team` des features déjà importées par la passe per-board.
- `extractTeam(sprint)` ignore les sprints qui sont juste un tag PI (`/^PI\s*#?\s*\d+\s*$/i`) pour éviter de créer des équipes
  fantômes nommées `"PI#29"`.

## Règles métier (exclusions et conventions ticket)
- **Tickets `ActionRetro`** (label `ActionRetro`) = actions issues des rétros, **pas d'estimation attendue**.
  → Exclus de l'anomalie `noPoints` (carte Health + modal). Toute nouvelle règle/anomalie portant sur les Story Points
  doit appliquer cette exclusion. Convention JIRA documentée dans `project_jira_sprint_conventions` (mémoire) :
  `Cadrage_PIXX` = cadrage, `PI#XX` = features, `PIXX` = tickets standalone.
- **Statut `done` exclu par défaut** des anomalies actives (`unassigned`, `noPoints`, `stale`, `scopeCreep`).
  Les vues "actives" doivent toujours filtrer `t.status !== 'done'`.
- **`leader` ou `assignee`** : le legacy `assignee` peut encore exister sur d'anciens tickets — toujours tester
  `t.leader || t.assignee` quand on lit le responsable principal.

### ⚠ Filtres d'anomalies définis à 2 endroits — garder en sync
La règle de matching d'une anomalie est dupliquée :
- [health.js](../static/js/views/health.js) — `ANOMALIES[].match` (utilisé par card globale + matrice équipe × anomalie)
- [alert_modal.js](../static/js/components/alert_modal.js) — `_ACTIONABLES[].filter` (utilisé par la modal d'action)

Quand on ajoute/modifie une règle (exclusion, statut, label...), **modifier les 2 endroits** sous peine que le compteur
de la card ne corresponde pas au contenu de la modal (cas réel : `noPoints` filtrait `ActionRetro` dans la modal mais
pas dans la card). Si une 3e duplication apparaît, extraire dans un module `business_rules.js` partagé.

## Raccourcis globaux et discoverabilité
- **Ctrl+K** → Command Palette ([cmdpalette.js](../static/js/components/cmdpalette.js)) : tickets, features, epics, membres,
  vues, actions. Historique localStorage `sb-cmd-history`.
- **N** → ouvre la modale de création (avec équipe pré-remplie si filtre actif).
- **Ctrl+K** dans search box → focus search input (déjà géré).
- **Favoris de vue** ([favorites.js](../static/js/components/favorites.js)) : capture `view + team + group + filtres`
  (sprint-qfText, kanban-search). Persistance `sb-favorites`. Bouton dans le topbar.
- **Breadcrumb topbar** = `Vue › Équipe/Groupe › Sprint name` — chaque segment cliquable (clear filtre, ouvrir team switcher).
  Le segment Sprint n'apparaît que sur `sprint`/`kanban`/`dashboard` avec une équipe spécifique.

## Vues
- **dashboard** : metriques generales + tickets recents
- **sprint** : tickets du sprint courant
- **kanban** : board par colonnes
- **pi** : PI Planning (tabs : objectives, fist, mood, vote)
- **picalendar** : calendrier PI avec sprints
- **roadmap** : features sur timeline
- **health** : pilotage agrégé toutes équipes (score 0-100 + anomalies cliquables) — tour matinal RTE/SM
- **retro** : retrospective
- **support** : rotation support + tickets
- **roam** : risques ROAM
- **agenda** : calendrier semaine lundi-vendredi, membres par equipe, absences colorees par type (conge/maladie/formation/autre), filtre autocomplete
- **reports** : rapports exportables
- **settings** : parametres
