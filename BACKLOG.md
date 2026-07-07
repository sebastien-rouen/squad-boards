# BACKLOG — Squad Board

> Document de reprise pour une nouvelle conversation Claude. Lire en premier : [CLAUDE.md](CLAUDE.md) (conventions codebase) puis ce fichier.
> Dernière mise à jour : 2026-06-23 — version courante `3.50.0` (cf. [CHANGELOG.md](CHANGELOG.md)).

---

## ✅ TODO

- [ ] **#13 — Confidence vote → tendance (début vs fin de PI)** — le vote de confiance par objectif (#4, 3.13.0) est instantané. Stocker un horodatage / phase (`start|end`) pour tracer la **courbe de confiance** sur le PI. Réutiliser le stockage `type=confidence` existant en ajoutant un champ phase.
- [ ] **Historique des niveaux Atlas** (évolution dans le temps d'une compétence) — nécessiterait une table d'historique.
- [ ] **Refonte design du Dashboard** — retenir une direction parmi les maquettes ([static/mockups/dashboard-directions.html](static/mockups/dashboard-directions.html), 7 pistes A→G) et la répercuter sur le vrai Dashboard. Piste favorite pressentie : **G · Flux éditorial** (sections aérées + deux flux Pilotage / Équipe-risques). Principe : aéré entre sections, resserré entre cards.
- [ ] **Généraliser les helpers « ? » + tooltips** sur les cards/KPI du Dashboard (popover avec schéma SVG explicatif, **bordure conique « en spirale »**, fond `--surface-3` ; tooltips au survol des indicateurs) — prototypés dans la maquette ci-dessus, à porter dans l'app (réutiliser [help_popover.js](static/js/components/help_popover.js) + [tooltip.js](static/js/components/tooltip.js)).

<details>
<summary>✅ Items TODO terminés</summary>

- [x] **#31 — Cycle Time & Lead Time : analyse enrichie en zoom** (3.50.0) — vue nuage de points temporel + tendance (moy. mobile N tickets), filtres type/équipe/lead, tri configurable, outliers ⚠ (LT > P85) avec légende, part d'attente dans le footer. Barre d'outils générique dans la popin de zoom (`getChartControls`).
- [x] **#30 — Graphiques : vue zoom enrichie & lisibilité** (3.49.0) — limite ~40 barres en zoom (Cycle Time / WIP Age), états vides non destructeurs (overlay au lieu d'écraser le canvas), export PNG depuis la popin.
- [x] Optimiser la navigation précédent/suivant dans la modal des détails de ticket (éviter l'empilement de plusieurs modals lors de clics successifs).
- [x] Permettre de compléter un jeu de données pour une démo complète dans les pages "Paramètres" et "Données".
- [x] Optimiser la modale de création de ticket (ergonomie, couleur, chips, listes déroulantes).
- [x] Créer une page Backlog (filtres, regroupement par sprint/PI).

</details>

---

## 🔐 PROPOSITION — Export / Import de configuration locale (`.local`)

> Idée discutée le 2026-06-08. **Verdict : utile, mais à cadrer** (P2). À arbitrer avec l'utilisateur avant implémentation.

### Pourquoi (problème réel)

- `/api/export` existe déjà mais c'est un **dump complet** : il mélange les données **re-synchronisables depuis JIRA** (tickets/features/epics, volumineux) avec la config curée, **n'inclut pas les calendriers** (`TeamCalendar`) et **rien du localStorage**.
- Beaucoup de config **fragile vit uniquement en localStorage** et n'est aujourd'hui ni sauvegardable ni portable :
  `pi-cfg-<N>` (date début PI + `pipDates`), `rot-mode-<team>` / `rot-mpw-<team>` (rotation support), `sb-charge-<sprint>` (charge prévue PI Planning), `sb-sync-*` (réglages sync JIRA), `sb-cal-*` (prefs modale calendrier), `sb-favorites`, historique commandes.
- Le repo est **public (GitHub) + synchronisé OneDrive** et les **absences = vrais noms RH** → ces données ne doivent pas être versionnées. D'où l'intérêt de fichiers **`.local` gitignorés**.

### Ce qui est proposé

Un **bundle de configuration curée** (≠ dump complet), exportable/importable **par domaine** (cases à cocher) :

| Domaine | Source | Contenu |
|---------|--------|---------|
| Équipes & groupes | DB | `Team`, `TeamGroup` (noms, couleurs) |
| Sprint & PI | DB + localStorage | `SprintConfig`, `PIConfig` (objectifs, snapshots), `pi-cfg-<N>` (startDate, pipDates, sprintsPerPI…) |
| Absences / Congés | DB | `Absence` (⚠ données perso → justifie le `.local`) |
| Calendriers | DB | `TeamCalendar` (URL ICS + équipe — ⚠ URLs parfois tokenisées) |
| Faits marquants | DB | `Event` (incident/gel/jalon/période) |
| Rotation support | DB + localStorage | `SupportRotation` + `rot-mode-*`, `rot-mpw-*` |
| Atlas | DB | catalogue `Skill`/`Appetence`, `MemberSkill/Appetence`, `MemberMobility` |
| Préférences locales | localStorage | `sb-sync-*`, `sb-cal-*`, `sb-charge-*`, `sb-favorites`… |

- **Exclu volontairement** : tickets / features / epics (re-fetchables via sync JIRA → garde le bundle léger et sans gros volume de données perso).
- **Backend** : `GET /api/config/export?domains=teams,pi,absences…` (sous-ensemble curé) + `POST /api/config/import` (merge sélectif, réutilise les `_xxx_dict` et la logique merge existante). `TeamCalendar` à ajouter à l'export (manque aujourd'hui).
- **Frontend** : section Settings « 💾 Sauvegarde & restauration » → cases à cocher par domaine, bouton Exporter (télécharge `squad-config.local.json`) / Importer (upload + preview + merge). Le **localStorage est dumpé/restauré côté client** (le backend ne le voit pas).
- **`.gitignore`** : ajouter `*.local`, `*.local.json`, `config/*.local*` (le `.gitignore` ignore déjà `data/*.json`, mais pas un `config/` ni la racine).

### Risques / points de vigilance

- **Drift de schéma** : chaque nouvelle table/clé localStorage devra être ajoutée à la liste des domaines → centraliser cette liste (un seul endroit `CONFIG_DOMAINS`).
- **Doublon avec `/api/export`** : garder les deux mais documenter clairement « snapshot complet » vs « bundle config ». Ne pas dupliquer la logique merge.
- **URLs ICS tokenisées** dans les calendriers = quasi-secrets → raison de plus pour `.local` + ne jamais committer.
- _(non concerné : le `.local` n'a pas vocation à être synchronisé, juste un export/sauvegarde manuel local.)_

### 🚀 MVP à implémenter (validé 2026-06-08)

**Objectif** : pouvoir exporter toute la config curée dans un fichier `.local` et la réimporter (reprise après reset / changement de poste). Le format prévoit déjà tous les domaines ; le MVP les couvre tous, l'UI reste simple (un bouton export, un bouton import).

**Format du bundle** — `squad-config.local.json` :

```jsonc
{
  "_meta": { "app": "squad-board", "version": "1", "exportedAt": "<iso>" },
  "db": {            // sous-ensemble curé (PAS de tickets/features/epics)
    "teams": [...], "groups": [...],
    "sprint": {...}, "pi": {...},
    "absences": [...], "support": [...],
    "events": [...], "calendars": [...],
    "skills": [...], "appetences": [...],
    "memberSkills": [...], "memberAppetences": [...], "mobility": [...]
  },
  "local": {         // snapshot localStorage (clés ciblées par préfixe)
    "pi-cfg-29": "…", "rot-mode-Fuego": "…", "sb-charge-…": "…",
    "sb-sync-…": "…", "sb-cal-…": "…", "sb-favorites": "…"
  }
}
```

**Backend** ([main.py](main.py))
- [ ] `GET /api/config/export` → renvoie le bloc `db` (réutilise les `_xxx_dict`). **Ajouter `calendars`** (`TeamCalendar` → inclure `icalUrl`, `team`, `name` ; absent de `/api/export` aujourd'hui).
- [ ] `POST /api/config/import` (body = bloc `db`, mode `merge` par défaut) → upsert par domaine en réutilisant la logique de `import_all` ; **ne touche pas** tickets/features/epics. Renvoie un récap `{domaine: nb importés}`.
- [ ] Constante `CONFIG_DOMAINS` centralisée (liste des tables/clés) pour éviter le drift — source unique pour export + import.

**Frontend** — section Settings « 💾 Sauvegarde & restauration »
- [ ] Bouton **Exporter** : `GET /api/config/export` + dump des clés localStorage matchant les préfixes (`pi-cfg-`, `rot-mode-`, `rot-mpw-`, `sb-charge-`, `sb-sync-`, `sb-cal-`, `sb-favorites`) → fusionne en un seul JSON → `download` `squad-config.local.json`.
- [ ] Bouton **Importer** : `<input type=file>` → lit le JSON → **preview** (compte par domaine) → confirm → `POST /api/config/import` (bloc `db`) **puis** restaure le bloc `local` dans `localStorage` → `toast` récap + reload de l'état (`loadAllData` / `renderView`).
- [ ] Helper `_localConfigSnapshot()` / `_restoreLocalConfig(obj)` (filtre par préfixes — liste centralisée côté front aussi).

**Divers**
- [ ] `.gitignore` : ajouter `*.local`, `*.local.json` (la racine ; `data/*.json` ne couvre pas un export hors `data/`).
- [ ] CHANGELOG : entrée dédiée (feat `settings`), bump mineur.
- [ ] Doc CLAUDE.md : noter la distinction `/api/export` (snapshot complet) vs `/api/config/*` (bundle config curée).

**Critère de done** : reset `data/board.db` + vider le localStorage → import du `.local` → l'app retrouve équipes, PI/sprint (dates + pipDates), absences, calendriers, faits marquants, rotation et préférences, **sans re-saisie** (tickets re-synchronisés via JIRA séparément).

---

## 🎯 Contexte de la session en cours — Atlas

Développement de la **vue Atlas** (menu `Atlas`, raccourci `A`) : outil de pilotage humain (coaching / RH / onboarding) combinant 3 artefacts liés :
1. **Carte unFIX** zoomable (Programme → Équipes → Membres) — visuel type framework unFIX
2. **Skills Matrix** (compétences × entités, niveaux 1-4 + appétences)
3. **Tableau de suivi de mobilité** (trajectoires, exportable CSV)

### Décisions d'architecture validées avec l'utilisateur
- **Stockage** : tables backend dédiées (pas localStorage)
- **Granularité** : compétences ET appétences existent aux 2 niveaux — **membre ET équipe** (champ `scope` = `member|team`)
- **Référentiel niveaux** (NE PAS modifier) : `1=exécutant spécialisé · 2=opérationnel structuré · 3=ingénieur cloud ready · 4=référent/architecte`
- **Appétence** : `faible / neutre / forte` · **Potentiel** : `faible / moyen / fort` · **Risque** : `aucun / moyen / critique`

### 📂 Fichiers clés de la feature Atlas
| Fichier | Rôle |
|---------|------|
| [main.py](main.py) | tables (`class Skill` ~L270), dict helpers (`_skill_dict` ~L660), endpoints (`# Atlas:` ~L1182), seed (`_seed_atlas_catalog` ~L402), import (`import_all` ~L1961) |
| [static/js/views/atlas.js](static/js/views/atlas.js) | toute la vue (carte + matrix + 3 modals + actions) |
| [static/css/atlas.css](static/css/atlas.css) | styles |
| [static/js/api.js](static/js/api.js) | fonctions API Atlas (section "Atlas :") |
| [static/js/state.js](static/js/state.js) | clés de state |
| [static/js/app.js](static/js/app.js) | registration vue + chargement données |
| [static/js/config.js](static/js/config.js) | `NAV_ITEMS` (entrée `atlas`) |

---

## ⚠️ Pièges & conventions à respecter (cf. CLAUDE.md)

- **Source de vérité membres** = table `absences` (CSV RH), via `deriveMembersFromAbsences(absences, members)`. NE PAS utiliser `store.get('members')` brut pour lister les personnes.
- **Échapper avec `esc()`** avant tout `innerHTML` (XSS).
- **Mapping snake/camel** : backend renvoie camelCase via les `_xxx_dict()`. Vérifier la correspondance (ex: `scope_key` → `scopeKey`, `member_name` → `memberName`).
- **Filtre topbar** : `store.get('team')` (équipe ou `'all'`) + `store.get('group')` (id de ligne produit). La carte ET la matrix doivent respecter ce filtre — déjà implémenté dans `_buildHierarchy()` et `_matrixEntities()`.
- **Toujours mettre à jour [CHANGELOG.md](CHANGELOG.md)** lors de modifs conséquentes (format : version sémantique en tête, plus récente en haut).
- **Pas de Co-Authored-By** dans les commits.
- **Tester via curl** après modif backend (lancer `python main.py`, port 3000, tester les routes, nettoyer les données de test, arrêter le serveur).

### 🧪 Comment tester
```bash
cd squad-board
python main.py            # port 3000
# Ouvrir http://localhost:3000 → menu Atlas (A)
# Backend : curl http://localhost:3000/api/skills  (12 seedées)
#           curl http://localhost:3000/docs         (Swagger)
```

---

## 📦 Historique livré (archives)

<details>
<summary>💡 PISTES D'AMÉLIORATION — PI Planning & Atlas (discutées 2026-06-04) — toutes livrées en 3.13.0</summary>

### 🧭 Navigation rapide
- [x] **#1 — Comparateur d'équipes (Atlas, split view)** · ✅ 3.13.0 — bouton ⚖️ : radar superposé + tableau comparatif 2-3 équipes.
- [x] **#2 — Mini-heatmap capacité en topbar (PI)** · ✅ 3.13.0 — strip compact entre tabs et contenu, pastille vert/orange/rouge par équipe, clic → onglet capacité.
- [x] **#3 — Raccourcis onglets PI (touches 1-9)** · ✅ 3.13.0 — keydown 1-9 → onglets PI, désactivé si focus sur un champ.

### 📊 Lisibilité PI Planning
- [x] **#4 — Vote de confiance PI (commit/confidence)** · ✅ 3.13.0 — panneau "Confiance par objectif" sous le Fist of Five, vote 1-5 par objectif stocké (`type=confidence`), moyennes et distributions.
- [x] **#5 — Progression des objectifs PI (rollup)** · ✅ 3.13.0 — barre de progression par objectif (features done/total de l'équipe), jauge globale en haut.
- [x] **#6 — États vides illustrés** · ✅ 3.13.0 — empty state illustré dans Features (hint JIRA), hint dans Capacité (hint CSV absences).

### 🗺️ Atlas interactif
- [x] **#7 — Drag & drop membre entre équipes (simulation staffing)** · ✅ 3.13.0 — bouton 🔄, mode simulation, glisser pastille → crew cible, bandeau récap, Annuler.
- [x] **#8 — Recherche de compétence "qui sait faire X ?"** · ✅ 3.13.0 — barre dans la map bar, highlight pulsant des membres niveau ≥ 2, compteur, effacement via Échap ou ✕.
- [x] **#9 — Heatmap de couverture des compétences requises** · ⭐ déjà implémenté en 3.12.0.

### 🎉 Moments d'équipe
- [x] **#10 — Mode présentation PI Planning plein écran** · ✅ 3.13.0 — bouton ⊞ dans l'en-tête PI, fullscreen navigateur avec fallback position:fixed.
- [x] **#11 — Animations de révélation (poker & confiance)** · ✅ 3.13.0 — confettis canvas sur consensus parfait (valeur identique pour tous, ≥ 4), 2,5 s sans librairie externe.

</details>

<details>
<summary>🔍 AUDIT 2026-06-22 — PI Planning, navigation, agenda, redondances, roadmap (items livrés)</summary>

> Pistes issues de l'audit du 2026-06-22 (README mis à jour en `3.38.1`). Toutes validées par l'utilisateur. #13 (tendance confidence vote) reste ouvert — voir section TODO en tête de fichier.

### 🎯 PI Planning : préparation & suivi
- [x] **#12 — Snapshot de commitment (baseline PI)** · ✅ 3.47.0 — colonne `pi_baselines` (JSON `{ "30": {capturedAt, committedPts, features[]} }`) sur `PIConfig` ([planning.py](app/models/planning.py)) + migration + sérialiseur `piBaselines` + endpoint `PUT /api/pi/baseline/{n}` (fusion) + round-trip import ([data.py](app/routers/data.py)). Helper `computeCommitment()` ([utils.js](static/js/utils.js)). UI dans PI Planning › onglet **Objectifs** : bouton **📌 Figer la baseline** (capture manuelle, vue « toutes équipes » uniquement = niveau PI) + panneau *Engagé / Livré / +ajoutés / −retirés / Say/Do*, comparaison filtrable par équipe à l'affichage. ⚠️ Backend non testé localement (deps FastAPI absentes) — commandes curl fournies pour vérif homelab.
- [x] **#14 — Dépendances inter-équipes (programme board)** · ✅ 3.45.0 — nouvel onglet **🔗 Dépendances** dans PI Planning ([pi.js](static/js/views/pi.js)) : matrice équipe (dépend) × équipe (dont elle dépend), liens inter-équipes en rouge, compteur dans le libellé d'onglet, clic sur une cellule → liste détaillée des liens (clé → clé, ouvre le ticket). Items = périmètre du PI **toutes équipes** (sinon l'autre bout d'un lien inter-équipes serait masqué). Vraie source = liens JIRA `links` (et non le champ mort `dependencies`).

### 🧭 Navigation
- [x] **#15 — Raccourcis chiffres uniquement (plus de lettres nues)** · ✅ 3.44.0 — [config.js](static/js/config.js) : Pilotage = `1`-`8` dans l'ordre du menu, groupe « Équipe & RH » sans raccourci (accès `Ctrl+K`). Plus de `B H S A G` → taper du texte hors champ ne navigue plus. Garde clavier ([sidebar.js](static/js/components/sidebar.js)) : ignore les `shortcut` vides, gère `contentEditable`, et **cède les chiffres à la vue PI** (qui a ses propres raccourcis d'onglets 1-9 — conflit historique résolu). README mis à jour.
- [x] **#16 — Drag-to-reorder découvrable** · ✅ 3.44.0 — poignée ⠿ révélée au survol des items Pilotage (+ `title` « Maintenir puis glisser pour réordonner »), styles [base.css](static/css/base.css). Le badge raccourci s'efface au survol pour laisser place à la poignée.
- [~] **#17 — Désencombrer la topbar** · 🔍 investigué 2026-06-22, **différé** — la piste « contextualiser le sélecteur PI » est **caduque** : les 8 vues où il s'affiche (dont `agenda` et `support`) consomment toutes réellement `piOffset` pour calculer la période PI affichée → le retirer casserait l'affichage. Le reste (regroupement visuel topbar) est subjectif et nécessite un retour visuel ⇒ à traiter dans une passe UI dédiée, pas à l'aveugle.

### 📅 Synchronisation agenda (header)
- [x] **#18 — Badge de fraîcheur ICS à côté du Sync JIRA** · ✅ 3.40.0 — bouton `#btn-cal-sync` ([index.html](static/index.html)) entre « Nouveau » et le split JIRA. Pastille warning quand la dernière synchro ICS dépasse 6 h (logique dans [topbar.js](static/js/components/topbar.js), styles dans [calendar-banner.css](static/css/views/calendar-banner.css)). Clic → `syncCalendars()` headless exporté de [cal_banner.js](static/js/components/cal_banner.js). Tooltip = date de dernière synchro.
- [x] **#19 — Bandeau agenda du jour global (pas seulement sur Board)** · ✅ 3.40.0 — `#global-cal-banner` monté sous le header dans [index.html](static/index.html), rendu une fois dans [app.js](static/js/app.js) (hors `#content`, survit aux re-renders, auto-refresh via abonnements). Montages par-vue retirés de [sprint.js](static/js/views/sprint.js) et [kanban.js](static/js/views/kanban.js). Reste vide si aucun calendrier ICS.
- [x] **#20 — Dédupliquer la logique « dernière synchro calendrier »** · ✅ 3.40.0 — helpers `relevantCalendars(calendars, team)` + `lastCalendarSync(calendars, team)` dans [utils.js](static/js/utils.js), réutilisés par la modale semaine, le bandeau, l'infopanel et le badge topbar.

### ♻️ Redondances (contenu & sidebar)
- [x] **#21 — Factoriser le jeu de graphiques Board** · ✅ 3.41.0 — nouveau module [board_charts.js](static/js/components/board_charts.js) (`renderBoardChartsSection` + `mountBoardCharts`) consommé par [sprint.js](static/js/views/sprint.js) et [kanban.js](static/js/views/kanban.js). IDs de canvas canoniques `board-chart-*` (les 2 modes ne coexistent jamais). Swatches WIP Age passés en classes CSS ([support.css](static/css/views/support.css)) pour respecter « pas de CSS en dur dans le JS ».
- [x] **#22 — « Activité récente » en composant unique réutilisable** · ✅ 3.41.0 — le composant [activity.js](static/js/components/activity.js) existait déjà ; ajout de `renderActivityCard()` (shell `<details>` + liste) qui mutualise le boilerplate dupliqué dans dashboard/sprint/kanban. Les 3 vues l'appellent désormais en une ligne + `bindActivityClicks(container)`.
- [x] **#23 — Objectifs PI : source unique de résolution** · ✅ 3.42.0 — `resolvePiObjectives({ piInfo, piNum, isCurrentPi, legacyLsKey })` ajouté à [utils.js](static/js/utils.js), adopté par [dashboard.js](static/js/views/dashboard.js) et [pi.js](static/js/views/pi.js) `renderObjectives`. Supprime le footgun « doit rester cohérent entre les 2 vues » (sélection courant-vs-snapshot dupliquée). Le score d'atteinte BV (Dashboard) et la jauge de comptage (PI) restent volontairement distincts mais lisent la même liste. Bonus : `_ticketPiNum` local du Dashboard remplacé par `extractPiNum`.
- [x] **#24 — Bloqués / WIP / Throughput : indicateurs canoniques** · ✅ 3.43.0 — helpers `countBlocked()`, `countWip()`, `throughputSince()` + constante `WIP_STATUSES` ([config.js](static/js/config.js)/[utils.js](static/js/utils.js)). Adoptés par Dashboard, Board (sprint+kanban). **Bug corrigé** : le « Throughput » du Kanban affichait le total des tickets done (`// simplified`) au lieu d'un vrai débit → désormais débit 7 j aligné sur le Dashboard (label « Throughput 7j »).
- [x] **#25 — Vélocité / Buffer : source unique** · ✅ 3.42.0 — helpers `isBufferItem(item)` + `computeVelocityBreakdown(tickets)` dans [utils.js](static/js/utils.js). **Divergence corrigée** : Roadmap/PI/Dashboard/Reports/Infopanel utilisaient un match sous-chaîne `/buffer/i` (faux positifs `buffer-xxx`) alors que Santé utilisait `/^buffer$/i` (exact) → tous convergent désormais sur la sémantique **stricte** (label exactement « buffer »). `computeVelocityBreakdown` adopté par Roadmap + PI. ⚠️ Effet : un libellé type `buffer-sprint` n'est plus compté comme buffer (numbers légèrement plus précis). _(Santé backlog noEpic/noPoints/noPriority : pas de duplication réelle, propre à la Roadmap — laissé tel quel.)_
- [x] **#26 — Sidebar : regroupement des vues** · ✅ 3.43.0 — 2 groupes via le champ `section` ([config.js](static/js/config.js)) : **Pilotage** (Dashboard, Board, Backlog, PI, Roadmap, Santé, Rapports, Paramètres — réordonnable par glisser) + **Équipe & RH** repliable (Amélioration, Support, Atlas, Agenda). Replié par défaut (déclutter), auto-déploiement si la vue courante en fait partie, état persisté (`sb-nav-team-collapsed`). Drag-and-drop scopé au seul groupe Pilotage ([sidebar.js](static/js/components/sidebar.js)), styles dans [base.css](static/css/base.css). Lié à #15.

### 🗺️ Roadmap
- [x] **#27 — Roadmap en vue multi-PI / long terme** · ✅ 3.46.0 — **timeline horizontale PI-2 → PI+2** en tête de la Roadmap ([roadmap.js](static/js/views/roadmap.js)) : une colonne par PI (centre = PI courant réel), features groupées par PI (triées par rang, badge statut, bande couleur équipe). Clic sur l'en-tête d'un PI → pilote `piOffset` (le détail mono-PI sous la timeline s'actualise) ; clic carte → ouvre la feature. Styles [roadmap.css](static/css/views/roadmap.css). Distingue clairement la Roadmap (survol long terme) de PI Planning (mono-PI).
- [x] **#28 — Réaligner le matching PI sur `getCurrentPi`/`extractPI` + retirer les `console.log`** · ✅ 3.39.0 — [roadmap.js](static/js/views/roadmap.js) : `_extractPiNum` local remplacé par `getCurrentPi({ sprintInfo, piInfo })`, `_matchPi`/`_normPi` remplacés par `extractPiNum(raw) === currentPiNum` (source unique, gère aussi `Fuego - Ite 30.3`), bloc diagnostic `console.log` supprimé. `console.debug` retiré de [cal_banner.js](static/js/components/cal_banner.js).
- [x] **#29 — Graphe de dépendances mutualisé** · ✅ 3.45.0 — composant partagé [dep_graph.js](static/js/components/dep_graph.js) (`extractDependencyEdges`, `renderItemDepGraph`, `computeTeamDependencies`, `renderTeamDepBoard`). Le `_renderDepGraph` local de la Roadmap (basé sur le champ **mort** `dependencies`) est supprimé : le graphe Roadmap utilise désormais les vrais liens JIRA, colonnes par équipe, arêtes inter-équipes en rouge. Même socle réutilisé par le programme board #14.

</details>

<details>
<summary>✅ Atlas — DÉJÀ LIVRÉ ET VÉRIFIÉ (ne pas refaire)</summary>

### Backend ([main.py](main.py)) — testé via curl
- 5 tables : `Skill`, `Appetence`, `MemberSkill`, `MemberAppetence`, `MemberMobility`
  - `MemberSkill`/`MemberAppetence` ont un champ `scope` (`member`|`team`) + `scope_key` (nom membre ou équipe)
  - Clé logique upsert : `scope|scope_key|skill_id` (resp. `appetence_id`)
- Endpoints REST : `/api/skills`, `/api/appetences` (CRUD), `/api/member-skills` (PUT upsert, `level=0` supprime), `/api/member-appetences` (PUT upsert), `/api/mobility` (PUT upsert par `memberName` + DELETE)
- **Seed automatique** au démarrage (`_seed_atlas_catalog`) : 12 compétences + 6 appétences si catalogue vide
- Intégré dans `/api/export` ET `/api/import`

### Frontend
- [static/js/views/atlas.js](static/js/views/atlas.js) — vue complète 2 onglets
- [static/css/atlas.css](static/css/atlas.css) — styles dédiés, responsive < 900px
- Câblage : `state.js` (clés `skills/appetences/memberSkills/memberAppetences/mobility`), `api.js` (fonctions), `app.js` (chargement non bloquant + registration `atlas: renderAtlas`), `config.js` (`NAV_ITEMS`)
- Icônes ajoutées au sprite [static/index.html](static/index.html) : `i-network`, `i-minus`
- CSS importé dans index.html : `<link rel="stylesheet" href="/css/atlas.css">`

### Fonctionnalités opérationnelles
- **Carte unFIX** : zoom 3 niveaux, pastilles membres colorées + halo appétence, tags appétences fortes au niveau équipe, breadcrumb, clic membre → Skills Matrix focalisée
- **Skills Matrix** : grille éditable (clic = +1 niveau cycle 0→4, clic droit = -1, appétences cycle), scope membre/équipe, ligne couverture (heatmap SPoF), état vide enrichi avec ajout inline + "catalogue type"
- **Gestion catalogue** (modal ⚙️) : ajouter/supprimer compétences + appétences par catégorie
- **Action A** : double-clic cellule faible (≤2) → ticket `skill-up` pré-rempli (board, leader, plan, labels)
- **Action B** : modal 🧭 Affectation → score `niveau×25 − charge×8 − absence + appétence forte`, top 8 classé
- **Tableau mobilité** (modal 📋) : tableau exact demandé + export CSV
- **Persistance optimiste** : store mis à jour avant l'API (`_saveSkill`, `_saveAppetence`)
- Toutes les tâches P1-P4 du plan initial (robustesse, UX, fonctionnel avancé, nice-to-have) sont livrées, sauf l'historique des niveaux (voir section TODO).

</details>
