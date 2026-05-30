# Squad Board - Contexte developpeur

## Stack
- Backend: FastAPI + SQLModel/SQLite - fichier unique `main.py`
- Frontend: Vanilla JS ES modules, CSS custom properties, Chart.js
- Stockage: `data/board.db` (SQLite, 10 tables)
- Pas de build, pas de framework JS

## Principes
- **Autoporteur** : tout fonctionne sans JIRA ni service externe
- JIRA = plugin d'import optionnel (sync.js + proxy /jira/*)
- CRUD complet via API REST pour toutes les entites
- Le filtre topbar supporte equipe individuelle OU groupe (ligne produit)

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
- **piconfig** : number, name, objectives[]

## Conventions
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
- **Sélecteur PI topbar** (`piOffset` dans le store, valeurs -2..+2) — visible uniquement sur vues `pi`, `picalendar`, `roadmap`
  (set `PI_VIEWS` dans [topbar.js](static/js/components/topbar.js)). `0 = courant`, `>0 = futur`, `<0 = passé`.
- **Détection du PI courant (`basePi`)** = `piInfo.number` (configuré dans Settings) > fallback extraction du nom du sprint
  actif (`piInfo.name` ou `sprintInfo.name`) via regex `(\d+)\.\d+` ou `PI\s*#?\s*(\d+)`. Le sélecteur écoute donc
  `store.on('sprintInfo')` pour se rafraîchir après sync JIRA. Le sélecteur est masqué si `basePi = 0` (aucun PI dérivable).
- **Matching feature ↔ PI** : utiliser `_matchFeaturePi(f, piTag)` (roadmap.js) — tolérant multi-source dans cet ordre :
  `f.piSprint` (priorité, format `PI#NN`) > `f.sprintName` > chaque label de `f.labels` > pattern `NN.x` (sprint `Fuego - Ite 29.3` → PI 29).
  Normalisation casse + espaces. **Règle métier** : une feature sans `piSprint` (champ Sprint JIRA absent) n'apparaît dans
  **aucun** PI — c'est voulu. Pour la rendre visible, ajouter un Sprint sur le ticket Feature côté JIRA + resync.

## Filtrage par équipe : tickets ET features
- Toute vue affichant tickets OU features par équipe doit utiliser `filterByTeam(items, team)` ([utils.js](static/js/utils.js)).
  `filterByTeam` gère les 3 cas : équipe spécifique → `t.team === team`, `'all' + groupe sélectionné` → équipes du groupe,
  `'all' + pas de groupe` → tout (vue globale RTE).
- **Footgun récurrent** : oublier de filtrer les features (parce qu'on pense "tickets" par réflexe). Le champ `feature.team`
  vient de `Team[Team]` JIRA (équipe agile responsable, sémantique SAFe — cf. section ci-dessous), donc le filtre fait sens.
- Quand on ajoute un compteur/onglet "Features (N)", N doit être la longueur de la liste **filtrée**, pas du store brut.
  Le `featureList` enrichi (progress, rolledStatus) doit `.map` sur la liste filtrée, pas sur le store global.

## Import CSV Absences (formats supportés)
Deux formats auto-détectés dans [settings.js](static/js/views/settings.js) :

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
Constante `SUPPORT_WEEK_MODES` dans [utils.js](static/js/utils.js) — 3 modes supportés (cf. backend `SupportRotation.week_mode`) :
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
Centralisées dans `utils.generateSupportRotation` ([utils.js](static/js/utils.js)) — utilisées par Settings (grille) et la vue Support (timeline + bouton de génération). **Une seule source de vérité, modifier ici uniquement.**

1. **Absence ≥ 3 jours dans la semaine → exclu** (source = table `absences` = CSV RH, cf. `supportAbsenceDays`).
2. **Pas 2 semaines consécutives** : un membre affecté en semaine N est exclu en N+1. Contrainte **relâchée** si pool insuffisant (`pool.length < membersPerWeek`) — mieux vaut quelqu'un que personne.
3. **Verrouillage auto du passé** : toute semaine dont `weekEnd < today` est préservée intacte (jamais réécrite). Marquée `_autoLocked: true` côté UI (cadenas).
4. **Verrouillage manuel** : `rotation.locked === true` → préservée même si dans le futur.
5. **Équité** : compteur d'affectations cumulées (passé inclus). Tri ascendant, tirage aléatoire pour les ex-aequos.
6. **membersPerWeek** : configurable via `localStorage.rot-mpw-<team>` (défaut 2).

### Préservation lors d'un shuffle PI suivant
Le endpoint `/api/support/bulk` clear par `team` avant insert → quand on régénère uniquement le PI suivant, **il faut renvoyer le PI courant existant** dans le payload pour ne pas le perdre. Cf. `_shuffle` dans [support.js](static/js/views/support.js) qui concatène `otherPiSupport + rotations`.

### Semaines du PI
Construites par `buildSupportPiWeeks(piInfo, sprintInfo)` — utilise `piInfo.sprintsPerPI` et `piInfo.sprintDuration` (défauts 5 × 14j). Le PI courant est ancré sur le sprint actif via regex `/(\d+)\.(\d+)/` sur `sprintInfo.name`.

## Convention team mapping (features JIRA)
- Priorité dans `transformIssue` ([sync.js](static/js/sync.js)) : **`Team[Team]` JIRA > nom du board > `extractTeam(sprint)` > `'Autre'`**.
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
- [health.js](static/js/views/health.js) — `ANOMALIES[].match` (utilisé par card globale + matrice équipe × anomalie)
- [alert_modal.js](static/js/components/alert_modal.js) — `_ACTIONABLES[].filter` (utilisé par la modal d'action)

Quand on ajoute/modifie une règle (exclusion, statut, label...), **modifier les 2 endroits** sous peine que le compteur
de la card ne corresponde pas au contenu de la modal (cas réel : `noPoints` filtrait `ActionRetro` dans la modal mais
pas dans la card). Si une 3e duplication apparaît, extraire dans un module `business_rules.js` partagé.

## Raccourcis globaux et discoverabilité
- **Ctrl+K** → Command Palette ([cmdpalette.js](static/js/components/cmdpalette.js)) : tickets, features, epics, membres,
  vues, actions. Historique localStorage `sb-cmd-history`.
- **N** → ouvre la modale de création (avec équipe pré-remplie si filtre actif).
- **Ctrl+K** dans search box → focus search input (déjà géré).
- **Favoris de vue** ([favorites.js](static/js/components/favorites.js)) : capture `view + team + group + filtres`
  (sprint-qfText, kanban-search). Persistance `sb-favorites`. Bouton dans le topbar.
- **Breadcrumb topbar** = `Vue › Équipe/Groupe › Sprint name` — chaque segment cliquable (clear filtre, ouvrir team switcher).
  Le segment Sprint n'apparaît que sur `sprint`/`kanban`/`dashboard` avec une équipe spécifique.

## API
- CRUD: /api/tickets, /api/features, /api/epics, /api/members, /api/teams
- Groupes: /api/groups
- Absences: /api/absences, /api/absences/bulk
- Support: /api/support, /api/support/bulk
- Sprint/PI: GET/PUT /api/sprint, /api/pi
- Export/Import: /api/export, /api/import
- Swagger: http://localhost:3000/docs

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

## Plugin JIRA (sync.js)

### 5 passes d'import paginées via le helper `_paginateJql`
1. **Per-board active sprint** (`/rest/agile/1.0/sprint/{id}/issue`) — tickets du sprint actif de chaque board scrum
2. **Future sprints** (`sprint in futureSprints() AND issuetype NOT IN (Feature, Fonctionnalite, Epic)`) — tickets PI suivant
3. **Features JQL** (`issuetype IN (Feature, "Fonctionnalite") ORDER BY rank ASC`) — features avec leur rang JIRA
4. **Epics JQL** (`issuetype=Epic ORDER BY rank ASC`)
5. **PI-named-sprint** (`Sprint in ("PI28","PI#28",...,"PI31","PI#31") ORDER BY Rank ASC`) — récupère les projets qui planifient via des sprints nommés directement `"PI30"` (cas GCOM). Tourne après features/epics JQL pour ne pas écraser le rank standard.
6. **Amélioration continue** (labels Retro, Postmortem, CoP, Adapt...) — tickets transverses

### Pagination robuste (`_paginateJql`)
JIRA Cloud `/rest/api/3/search/jql` utilise `nextPageToken` (préféré) avec fallback `startAt`. `total` est non fiable (souvent capé à `maxResults`). Le helper sort sur : page vide, page entièrement dédoublonnée (`seenKeys`), `isLast === true`, page courte, ou hard cap 100 itérations.

### Détection des champs custom
Au démarrage : `/rest/api/3/field` est fetché pour résoudre Sprint et Team[Team] vers leur `customfield_XXXXX` via `clauseNames`. Le user peut entrer le nom JQL (`"Sprint"`, `"Team[Team]"`) ou l'ID dans Paramètres — la résolution est automatique.

### Normalisation des équipes
JIRA Team[Team] renvoie `{id: UUID, name: "GCOM - Fuego"}`. Les boards locaux sont nommés sans préfixe (`"Fuego"`). Le helper `_normalizeTeamName` matche les noms longs avec les courts via regex `(^|[\s\-_\/\]\)])${team}\s*$` (sorting par longueur descendante pour éviter les collisions partielles). Aucun préfixe à configurer manuellement.

### Extraction du PI (`piSprint`)
Chaîne de fallback dans `transformIssue` : nom du sprint (regex `\d+\.\d+` ou `PI\s*#?\s*\d+`) → champ PI custom → `fixVersions` → `labels` (pattern `PI30`, `PI#30`).

### Héritage de features dans la vue PI suivant (`roadmap.js`)
4 sources combinées dans `nextPiFeatureData` :
1. Features explicites en PI suivant
2. Tickets typés feature en PI suivant
3. **Features héritées** : children tickets en PI suivant via chaîne `ticket.epic → epic.feature → feature.id` (badge orange `héritée`)
4. **Epics proxy** : epics avec children PI suivant mais sans feature parente (badge violet `epic`) — utile pour les projets qui planifient au niveau epic

### Settings disponibles (localStorage)
- `sb-sync-maxFeatures` — cap par JQL (vide = illimité, hard cap interne 10 000)
- `sb-sync-maxBoards` — cap total boards scannés (vide = illimité)
- `sb-sync-sprintField` — nom JQL ou customfield (auto-détecté si vide)
- `sb-sync-teamField` — idem

### Page de debug `/tests/jira-explorer.html`
Outil standalone (zéro dépendance sur le bundle principal) :
- **Inspection** : compare une issue JIRA brute vs base locale (champs, chaîne hiérarchique, PI détecté avec source)
- **Snapshot** : counts/distributions par projet/PI/équipe/type ; détection des orphelins
- **JQL** : exécution directe ; bannière de comparaison local/JIRA avec bouton **Synchro** qui upsert dans la base via `/api/import mode=merge`
- **Hash routing** : `#tab=jql&jql=...`, `#tab=inspect&key=GCOM-1234&chain=1` — back/forward navigateur supporté
- **Presets chips** : Fuego·PI#30, Features GCOM, Epics sans parent, etc.

## Commandes
```bash
pip install -r requirements.txt
python main.py
```

## Agent de debug local
Un agent `squad-board-debugger` est défini dans [.claude/agents/squad-board-debugger.md](.claude/agents/squad-board-debugger.md).
Il connaît les pièges récurrents de la codebase (mapping snake/camel, filtres dupliqués health/alert_modal,
sources de vérité absences vs members, lazy-fetch JIRA pour enfants de features hors base) et fournit
des recettes `curl + node` prêtes à copier pour diagnostiquer local vs JIRA.

**À invoquer dès qu'un compteur, une liste ou une autocomplete semble incohérent** — gagne en moyenne
2-3 allers-retours d'investigation.
