# BACKLOG — archive des items faits · squad-boards

> Extrait de `BACKLOG.md`. **Rien à coder ici.** Le récit complet de chaque
> item vit dans [`CHANGELOG.md`](../CHANGELOG.md) — y chercher son *(vNNN)*.


## 📦 Historique livré (archives)
<details>
<summary>💡 PISTES D'AMÉLIORATION — PI Planning & Atlas (discutées 2026-06-04) — toutes livrées en 3.13.0</summary>
### 🧭 Navigation rapide
### 📊 Lisibilité PI Planning
### 🗺️ Atlas interactif
### 🎉 Moments d'équipe
</details>
<details>
<summary>🔍 AUDIT 2026-06-22 — PI Planning, navigation, agenda, redondances, roadmap (items livrés)</summary>
> Pistes issues de l'audit du 2026-06-22 (README mis à jour en `3.38.1`). Toutes validées par l'utilisateur. #13 (tendance confidence vote) reste ouvert — voir section TODO en tête de fichier.
### 🎯 PI Planning : préparation & suivi
### 🧭 Navigation
- [~] **#17 — Désencombrer la topbar** · 🔍 investigué 2026-06-22, **différé** — la piste « contextualiser le sélecteur PI » est **caduque** : les 8 vues où il s'affiche (dont `agenda` et `support`) consomment toutes réellement `piOffset` pour calculer la période PI affichée → le retirer casserait l'affichage. Le reste (regroupement visuel topbar) est subjectif et nécessite un retour visuel ⇒ à traiter dans une passe UI dédiée, pas à l'aveugle.
### 📅 Synchronisation agenda (header)
### ♻️ Redondances (contenu & sidebar)
### 🗺️ Roadmap
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

## Soldé, sorti de « ✅ TODO »

- [x] **#1 — Comparateur d'équipes (Atlas, split view)** · ✅ 3.13.0 — bouton ⚖️ : radar superposé + tableau comparatif 2-3 équipes.
- [x] **#2 — Mini-heatmap capacité en topbar (PI)** · ✅ 3.13.0 — strip compact entre tabs et contenu, pastille vert/orange/rouge par équipe, clic → onglet capacité.
- [x] **#3 — Raccourcis onglets PI (touches 1-9)** · ✅ 3.13.0 — keydown 1-9 → onglets PI, désactivé si focus sur un champ.
- [x] **#4 — Vote de confiance PI (commit/confidence)** · ✅ 3.13.0 — panneau "Confiance par objectif" sous le Fist of Five, vote 1-5 par objectif stocké (`type=confidence`), moyennes et distributions.
- [x] **#5 — Progression des objectifs PI (rollup)** · ✅ 3.13.0 — barre de progression par objectif (features done/total de l'équipe), jauge globale en haut.
- [x] **#6 — États vides illustrés** · ✅ 3.13.0 — empty state illustré dans Features (hint JIRA), hint dans Capacité (hint CSV absences).
- [x] **#7 — Drag & drop membre entre équipes (simulation staffing)** · ✅ 3.13.0 — bouton 🔄, mode simulation, glisser pastille → crew cible, bandeau récap, Annuler.
- [x] **#8 — Recherche de compétence "qui sait faire X ?"** · ✅ 3.13.0 — barre dans la map bar, highlight pulsant des membres niveau ≥ 2, compteur, effacement via Échap ou ✕.
- [x] **#9 — Heatmap de couverture des compétences requises** · ⭐ déjà implémenté en 3.12.0.
- [x] **#10 — Mode présentation PI Planning plein écran** · ✅ 3.13.0 — bouton ⊞ dans l'en-tête PI, fullscreen navigateur avec fallback position:fixed.
- [x] **#11 — Animations de révélation (poker & confiance)** · ✅ 3.13.0 — confettis canvas sur consensus parfait (valeur identique pour tous, ≥ 4), 2,5 s sans librairie externe.
- [x] **#12 — Snapshot de commitment (baseline PI)** · ✅ 3.47.0 — colonne `pi_baselines` (JSON `{ "30": {capturedAt, committedPts, features[]} }`) sur `PIConfig` ([planning.py](app/models/planning.py)) + migration + sérialiseur `piBaselines` + endpoint `PUT /api/pi/baseline/{n}` (fusion) + round-trip import ([data.py](app/routers/data.py)). Helper `computeCommitment()` ([utils.js](static/js/utils.js)). UI dans PI Planning › onglet **Objectifs** : bouton **📌 Figer la baseline** (capture manuelle, vue « toutes équipes » uniquement = niveau PI) + panneau *Engagé / Livré / +ajoutés / −retirés / Say/Do*, comparaison filtrable par équipe à l'affichage. ⚠️ Backend non testé localement (deps FastAPI absentes) — commandes curl fournies pour vérif homelab.
- [x] **#14 — Dépendances inter-équipes (programme board)** · ✅ 3.45.0 — nouvel onglet **🔗 Dépendances** dans PI Planning ([pi.js](static/js/views/pi.js)) : matrice équipe (dépend) × équipe (dont elle dépend), liens inter-équipes en rouge, compteur dans le libellé d'onglet, clic sur une cellule → liste détaillée des liens (clé → clé, ouvre le ticket). Items = périmètre du PI **toutes équipes** (sinon l'autre bout d'un lien inter-équipes serait masqué). Vraie source = liens JIRA `links` (et non le champ mort `dependencies`).
- [x] **#15 — Raccourcis chiffres uniquement (plus de lettres nues)** · ✅ 3.44.0 — [config.js](static/js/config.js) : Pilotage = `1`-`8` dans l'ordre du menu, groupe « Équipe & RH » sans raccourci (accès `Ctrl+K`). Plus de `B H S A G` → taper du texte hors champ ne navigue plus. Garde clavier ([sidebar.js](static/js/components/sidebar.js)) : ignore les `shortcut` vides, gère `contentEditable`, et **cède les chiffres à la vue PI** (qui a ses propres raccourcis d'onglets 1-9 — conflit historique résolu). README mis à jour.
- [x] **#16 — Drag-to-reorder découvrable** · ✅ 3.44.0 — poignée ⠿ révélée au survol des items Pilotage (+ `title` « Maintenir puis glisser pour réordonner »), styles [base.css](static/css/base.css). Le badge raccourci s'efface au survol pour laisser place à la poignée.
- [x] **#18 — Badge de fraîcheur ICS à côté du Sync JIRA** · ✅ 3.40.0 — bouton `#btn-cal-sync` ([index.html](static/index.html)) entre « Nouveau » et le split JIRA. Pastille warning quand la dernière synchro ICS dépasse 6 h (logique dans [topbar.js](static/js/components/topbar.js), styles dans [calendar-banner.css](static/css/views/calendar-banner.css)). Clic → `syncCalendars()` headless exporté de [cal_banner.js](static/js/components/cal_banner.js). Tooltip = date de dernière synchro.
- [x] **#19 — Bandeau agenda du jour global (pas seulement sur Board)** · ✅ 3.40.0 — `#global-cal-banner` monté sous le header dans [index.html](static/index.html), rendu une fois dans [app.js](static/js/app.js) (hors `#content`, survit aux re-renders, auto-refresh via abonnements). Montages par-vue retirés de [sprint.js](static/js/views/sprint.js) et [kanban.js](static/js/views/kanban.js). Reste vide si aucun calendrier ICS.
- [x] **#20 — Dédupliquer la logique « dernière synchro calendrier »** · ✅ 3.40.0 — helpers `relevantCalendars(calendars, team)` + `lastCalendarSync(calendars, team)` dans [utils.js](static/js/utils.js), réutilisés par la modale semaine, le bandeau, l'infopanel et le badge topbar.
- [x] **#21 — Factoriser le jeu de graphiques Board** · ✅ 3.41.0 — nouveau module [board_charts.js](static/js/components/board_charts.js) (`renderBoardChartsSection` + `mountBoardCharts`) consommé par [sprint.js](static/js/views/sprint.js) et [kanban.js](static/js/views/kanban.js). IDs de canvas canoniques `board-chart-*` (les 2 modes ne coexistent jamais). Swatches WIP Age passés en classes CSS ([support.css](static/css/views/support.css)) pour respecter « pas de CSS en dur dans le JS ».
- [x] **#22 — « Activité récente » en composant unique réutilisable** · ✅ 3.41.0 — le composant [activity.js](static/js/components/activity.js) existait déjà ; ajout de `renderActivityCard()` (shell `<details>` + liste) qui mutualise le boilerplate dupliqué dans dashboard/sprint/kanban. Les 3 vues l'appellent désormais en une ligne + `bindActivityClicks(container)`.
- [x] **#23 — Objectifs PI : source unique de résolution** · ✅ 3.42.0 — `resolvePiObjectives({ piInfo, piNum, isCurrentPi, legacyLsKey })` ajouté à [utils.js](static/js/utils.js), adopté par [dashboard.js](static/js/views/dashboard.js) et [pi.js](static/js/views/pi.js) `renderObjectives`. Supprime le footgun « doit rester cohérent entre les 2 vues » (sélection courant-vs-snapshot dupliquée). Le score d'atteinte BV (Dashboard) et la jauge de comptage (PI) restent volontairement distincts mais lisent la même liste. Bonus : `_ticketPiNum` local du Dashboard remplacé par `extractPiNum`.
- [x] **#24 — Bloqués / WIP / Throughput : indicateurs canoniques** · ✅ 3.43.0 — helpers `countBlocked()`, `countWip()`, `throughputSince()` + constante `WIP_STATUSES` ([config.js](static/js/config.js)/[utils.js](static/js/utils.js)). Adoptés par Dashboard, Board (sprint+kanban). **Bug corrigé** : le « Throughput » du Kanban affichait le total des tickets done (`// simplified`) au lieu d'un vrai débit → désormais débit 7 j aligné sur le Dashboard (label « Throughput 7j »).
- [x] **#25 — Vélocité / Buffer : source unique** · ✅ 3.42.0 — helpers `isBufferItem(item)` + `computeVelocityBreakdown(tickets)` dans [utils.js](static/js/utils.js). **Divergence corrigée** : Roadmap/PI/Dashboard/Reports/Infopanel utilisaient un match sous-chaîne `/buffer/i` (faux positifs `buffer-xxx`) alors que Santé utilisait `/^buffer$/i` (exact) → tous convergent désormais sur la sémantique **stricte** (label exactement « buffer »). `computeVelocityBreakdown` adopté par Roadmap + PI. ⚠️ Effet : un libellé type `buffer-sprint` n'est plus compté comme buffer (numbers légèrement plus précis). _(Santé backlog noEpic/noPoints/noPriority : pas de duplication réelle, propre à la Roadmap — laissé tel quel.)_
- [x] **Refonte design du Dashboard** · ✅ 3.152.0 → 3.157.0 — la direction **F · Deux flux** (maquette `dashboard-directions.html`, retenue en juillet) est **remplacée** par la **Météo des équipes**, choisie le 2026-08-29 dans la galerie [static/mockups/refonte/](../static/mockups/refonte/README.md) (4 directions desktop/TV, la 3 approfondie en 12 pages) puis portée en six lots : matrice équipes × domaines + pastilles (3.152), plan d'action de la fiche (3.153), tendance des votes + roster (3.154), seuils dans Paramètres (3.155), mode TV `#tv` avec alerte blockers > 48 h (3.156), prévisions multi-PI sur la Roadmap + lignes produit + nuit TV (3.157). Les deux flux *Pilotage & flux* / *Équipe & risques* restent en place sous la météo. ⭐ La bande `pi-sprints-strip-cards` (US / Buffer / Action, glissés) est **conservée telle quelle**, comme demandé. Source unique de l'échelle : `utils/meteo.js` ; du score de santé : `healthScore()` dans `business_rules.js`.
- [x] **#26 — Sidebar : regroupement des vues** · ✅ 3.43.0 — 2 groupes via le champ `section` ([config.js](static/js/config.js)) : **Pilotage** (Dashboard, Board, Backlog, PI, Roadmap, Santé, Rapports, Paramètres — réordonnable par glisser) + **Équipe & RH** repliable (Amélioration, Support, Atlas, Agenda). Replié par défaut (déclutter), auto-déploiement si la vue courante en fait partie, état persisté (`sb-nav-team-collapsed`). Drag-and-drop scopé au seul groupe Pilotage ([sidebar.js](static/js/components/sidebar.js)), styles dans [base.css](static/css/base.css). Lié à #15.
- [x] **#27 — Roadmap en vue multi-PI / long terme** · ✅ 3.46.0 — **timeline horizontale PI-2 → PI+2** en tête de la Roadmap ([roadmap.js](static/js/views/roadmap.js)) : une colonne par PI (centre = PI courant réel), features groupées par PI (triées par rang, badge statut, bande couleur équipe). Clic sur l'en-tête d'un PI → pilote `piOffset` (le détail mono-PI sous la timeline s'actualise) ; clic carte → ouvre la feature. Styles [roadmap.css](static/css/views/roadmap.css). Distingue clairement la Roadmap (survol long terme) de PI Planning (mono-PI).
- [x] **#28 — Réaligner le matching PI sur `getCurrentPi`/`extractPI` + retirer les `console.log`** · ✅ 3.39.0 — [roadmap.js](static/js/views/roadmap.js) : `_extractPiNum` local remplacé par `getCurrentPi({ sprintInfo, piInfo })`, `_matchPi`/`_normPi` remplacés par `extractPiNum(raw) === currentPiNum` (source unique, gère aussi `Fuego - Ite 30.3`), bloc diagnostic `console.log` supprimé. `console.debug` retiré de [cal_banner.js](static/js/components/cal_banner.js).
- [x] **#29 — Graphe de dépendances mutualisé** · ✅ 3.45.0 — composant partagé [dep_graph.js](static/js/components/dep_graph.js) (`extractDependencyEdges`, `renderItemDepGraph`, `computeTeamDependencies`, `renderTeamDepBoard`). Le `_renderDepGraph` local de la Roadmap (basé sur le champ **mort** `dependencies`) est supprimé : le graphe Roadmap utilise désormais les vrais liens JIRA, colonnes par équipe, arêtes inter-équipes en rouge. Même socle réutilisé par le programme board #14.

- [x] **#31 — Cycle Time & Lead Time : analyse enrichie en zoom** (3.50.0) — vue nuage de points temporel + tendance (moy. mobile N tickets), filtres type/équipe/lead, tri configurable, outliers ⚠ (LT > P85) avec légende, part d'attente dans le footer. Barre d'outils générique dans la popin de zoom (`getChartControls`).
- [x] **#30 — Graphiques : vue zoom enrichie & lisibilité** (3.49.0) — limite ~40 barres en zoom (Cycle Time / WIP Age), états vides non destructeurs (overlay au lieu d'écraser le canvas), export PNG depuis la popin.
- [x] Optimiser la navigation précédent/suivant dans la modal des détails de ticket (éviter l'empilement de plusieurs modals lors de clics successifs).
- [x] Permettre de compléter un jeu de données pour une démo complète dans les pages "Paramètres" et "Données".
- [x] Optimiser la modale de création de ticket (ergonomie, couleur, chips, listes déroulantes).
- [x] Créer une page Backlog (filtres, regroupement par sprint/PI).

</details>

## Soldé le 2026-10-03 (3.195.0 → 3.198.0)

> « Réalise le BACKLOG » : la section *🎨 Améliorations visuelles & UX* du 2026-10-03, le MVP
> *Export / Import de configuration `.local`* (proposé le 2026-06-08) et trois items de « ✅ TODO ».

- [x] **Burndown du Dashboard = vraie courbe** · ✅ 3.195.0 — `utils/burn.js` (`burnSeries`), source unique Board / Rapports / modale / TV.
- [x] **Cellules météo explicites au Dashboard** · ✅ 3.195.0 — bascule ▤ Détaillé / ▭ Compact (`sb-meteo-rich`).
- [x] **Panneau de détail météo → lien vers la vue** · ✅ 3.195.0 — Sprint, PI, Santé, Dashboard, votes.
- [x] **Bandeau « données obsolètes » plus utile** · ✅ 3.197.0 — auteur et mode de la synchro (`sprintconfig.synced_by` / `sync_kind`), ⚡ Synchro rapide + Synchro complète.
- [x] **Repère 🎯 « rangé par la règle »** · ✅ 3.195.0 — `overrideReason`.
- [x] **En-tête de colonne : statuts JIRA regroupés** · ✅ 3.195.0 — `columnStatusesTip`.
- [x] **Identité Météo sur le Board** · ✅ déjà livré en 3.159.0 (météo dans l'en-tête, teinte d'âge des cartes en Scrum et Kanban) — l'item du TODO était périmé.
- [x] **TV : Sprint en cours en 1366 × 768** · ✅ 3.195.0 — carte ultra-compacte, 4 sprints par page.
- [x] **TV : écran « 0 blocker »** · ✅ 3.196.0 — série par équipe (`sb-tv-blocker-seen`).
- [x] **TV : « Qui est là » cliquable** · ✅ 3.196.0 — fiche membre.
- [x] **TV : La semaine navigable + détail d'un jour** · ✅ 3.196.0.
- [x] **TV : fantôme du sprint précédent** · ✅ 3.196.0.
- [x] **TV : mode nuit = vraie palette** · ✅ 3.196.0 — plus de `filter: brightness`.
- [x] **TV : thème forcé sombre** · ✅ 3.196.0 — ⚙ Thème (sombre par défaut), `~tv=theme:`.
- [x] **TV : écran « Sprint review »** · ✅ déjà livré (3.161.0, repris par le mode TV de 3.182.0) — l'item du TODO était périmé.
- [x] **Paramètres → JIRA trop longue** · ✅ 3.195.0 — onglets Connexion · Synchro · Équipes masquées · Statuts forcés.
- [x] **Recherche dans les équipes masquées** · ✅ 3.195.0 — dès 10 équipes.
- [x] **Confirmation en place (statuts forcés)** · ✅ 3.195.0.
- [x] **Styles inline de settings-jira.js + découpage de settings.css** · ✅ 3.195.0 / 3.197.0 — `settings-history-import.css`.
- [x] **Frise — Récit : personnes cliquables** · ✅ 3.197.0 — puces et prénoms des 1v1.
- [x] **Frise — Export : personnes de chaque 1v1, avec lien vers leur fiche** · ✅ 3.197.0 — marqueur `~membre=`.
- [x] **Page 403 explicite** · 🟡 préparée en 3.197.0 ([nginx-403.md](nginx-403.md)) — reste à l'appliquer dans NPM (item ouvert du BACKLOG).
- [x] **États vides homogènes** · ✅ 3.197.0 — `emptyStateHtml` (TV, Paramètres → JIRA, frise) ; reste au fil de l'eau (item ouvert).
- [x] **MVP Export / Import de configuration `.local`** · ✅ 3.198.0 — `/api/config/export|import`, `CONFIG_DOMAINS`, Paramètres → Données → 💾, `*.local.json` ignoré par git. Écart au MVP : la config **sprint** n'est pas dans le bundle (la synchro JIRA la réécrit) ; règles d'agenda et historique Atlas en plus.
- [x] **Généraliser les « ? » + tooltips du Dashboard** · ✅ 3.198.0 — 4 schémas de plus dans `HELP_REGISTRY`, KPI en `data-tooltip`.
- [x] **Historique des niveaux Atlas** · ✅ 3.198.0 — table `skill_level_history`, bloc « 📈 Évolution » de la fiche membre.

