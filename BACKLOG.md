# BACKLOG — Squad Board

> Document de reprise pour une nouvelle conversation Claude. Lire en premier : [CLAUDE.md](CLAUDE.md) (conventions codebase) puis ce fichier.
> Dernière mise à jour : 2026-06-08 — version courante `3.17.0` (cf. [CHANGELOG.md](CHANGELOG.md)).

---

## TODO :
- [x] Optimiser sur les modal des détails des tickets. Si on passe d'un ticket à l'autre via la navigation précédente et suivante (<button class="mdl-nav-btn" id="mdl-prev" title="Precedent (←)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>) il ne faut pas que cela crée plusieurs modal (car si je clique 5x sur pagination précédentes, donc 5 tickets, le hash change aussi ce qui est normal, mais si je veux sortir de la modal, cela retire la modal du dernier ticket, puis je vois la modal du 4e ticket, etc...).
- [x] Permet de compléter un jeu de données pour une démo un peu complète dans la page "Paramètres" et "Données".
- [x] Optimiser au mieux la modale de création de ticket de façon ergonomique, colorée, et intuitive et simple (utilise chip, liste déroulante si besoin, ...).
- [x] Créer une page Backlog : afin de pouvoir visualiser de manière ergonomique et intuitive tous les tickets via des filtres, regrouper par sprint si existant, et/ou par PI. Propose-moi avant, comment tu comptes l'afficher et développer avant.
- [ ] Ajouter le moyen de mettre le TOKEN et URL de JIRA dans la page Paramètres au lieu du .env pour le rendre plus facilement modifiable par l'utilisateur.
- [ ] Dans la modal Calendrier, ajouter un séparateur aussi pour les évènements qui sont sur la journée, et les afficher en haut sur une petite ligne, tronquée mais avec du détail lors du hover.

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

### Risques / points de vigilance (à ne pas sous-estimer)
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

## 💡 PISTES D'AMÉLIORATION — PI Planning & Atlas (à arbitrer)

> Idées discutées le 2026-06-04 pour améliorer **ergonomie / navigation / UI**. Non priorisées définitivement — à reprendre avec l'utilisateur. Classées par axe, avec impact estimé.
> **Recommandations top 3** (fort impact) : #8 recherche compétence · #7 drag&drop staffing · #4 vote de confiance PI.

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

---

## 🎯 Contexte de la session en cours

Développement de la **vue Atlas** (menu `Atlas`, raccourci `A`) : outil de pilotage humain (coaching / RH / onboarding) combinant 3 artefacts liés :
1. **Carte unFIX** zoomable (Programme → Équipes → Membres) — visuel type framework unFIX
2. **Skills Matrix** (compétences × entités, niveaux 1-4 + appétences)
3. **Tableau de suivi de mobilité** (trajectoires, exportable CSV)

### Décisions d'architecture validées avec l'utilisateur
- **Stockage** : tables backend dédiées (pas localStorage)
- **Granularité** : compétences ET appétences existent aux 2 niveaux — **membre ET équipe** (champ `scope` = `member|team`)
- **Référentiel niveaux** (NE PAS modifier) : `1=exécutant spécialisé · 2=opérationnel structuré · 3=ingénieur cloud ready · 4=référent/architecte`
- **Appétence** : `faible / neutre / forte` · **Potentiel** : `faible / moyen / fort` · **Risque** : `aucun / moyen / critique`

---

## ✅ DÉJÀ LIVRÉ ET VÉRIFIÉ (ne pas refaire)

### Backend ([main.py](main.py)) — testé via curl
- 5 tables : `Skill`, `Appetence`, `MemberSkill`, `MemberAppetence`, `MemberMobility`
  - `MemberSkill`/`MemberAppetence` ont un champ `scope` (`member`|`team`) + `scope_key` (nom membre ou équipe)
  - Clé logique upsert : `scope|scope_key|skill_id` (resp. `appetence_id`)
- Endpoints REST : `/api/skills`, `/api/appetences` (CRUD), `/api/member-skills` (PUT upsert, `level=0` supprime), `/api/member-appetences` (PUT upsert), `/api/mobility` (PUT upsert par `memberName` + DELETE)
- **Seed automatique** au démarrage (`_seed_atlas_catalog`) : 12 compétences + 6 appétences si catalogue vide
- Intégrés dans `/api/export` (PAS encore dans `/api/import` — voir TODO)

### Frontend
- [static/js/views/atlas.js](static/js/views/atlas.js) — vue complète 2 onglets
- [static/css/atlas.css](static/css/atlas.css) — styles dédiés, responsive < 900px
- Câblage : `state.js` (clés `skills/appetences/memberSkills/memberAppetences/mobility`), `api.js` (fonctions), `app.js` (chargement non bloquant + registration `atlas: renderAtlas`), `config.js` (`NAV_ITEMS`)
- Icônes ajoutées au sprite [static/index.html](static/index.html) : `i-network`, `i-minus`
- CSS importé dans index.html : `<link rel="stylesheet" href="/css/atlas.css">`

### Fonctionnalités opérationnelles
- **Carte unFIX** : zoom 3 niveaux, pastilles membres colorées + halo appétence, tags appétences fortes au niveau équipe, breadcrumb, clic membre → Skills Matrix focalisée
- **Skills Matrix** : grille éditable (clic = +1 niveau cycle 0→4, clic droit = -1, appétences cycle), scope membre/équipe, ligne couverture (heatmap SPoF), **état vide enrichi** avec ajout inline + "catalogue type"
- **Gestion catalogue** (modal ⚙️) : ajouter/supprimer compétences + appétences par catégorie
- **Action A** : double-clic cellule faible (≤2) → ticket `skill-up` pré-rempli (board, leader, plan, labels)
- **Action B** : modal 🧭 Affectation → score `niveau×25 − charge×8 − absence + appétence forte`, top 8 classé
- **Tableau mobilité** (modal 📋) : tableau exact demandé + export CSV
- **Persistance optimiste** : store mis à jour avant l'API (`_saveSkill`, `_saveAppetence`)

---

## 📋 RESTE À FAIRE (priorisé)

### P1 — Robustesse / cohérence
- [x] ~~**Import** : ajouter Atlas dans `/api/import`~~ ✅ FAIT (3.11.1) — merge/replace testé, pas de doublon.
- [x] ~~**Migration tables existantes**~~ ✅ VÉRIFIÉ (3.11.6) — testé sur la vraie `data/board.db` (6,6 Mo, 20 tables) : les 5 tables Atlas sont créées par `create_all` (CREATE IF NOT EXISTS, n'affecte pas l'existant), seed OK (12 skills + 6 appétences), colonnes conformes. Pas de migration ALTER nécessaire (tables entièrement nouvelles).
- [x] ~~**Nettoyage orphelins**~~ ✅ FAIT (3.11.6) — bandeau + bouton "Nettoyer" dans le tableau de mobilité (lignes dont le membre est absent du CSV RH). Les niveaux/appétences orphelins étaient déjà ignorés sans plantage. Reste éventuellement : nettoyage des `member_skills`/`member_appetences` orphelins via le catalogue (mineur).

### P2 — UX / ergonomie
- [x] ~~**Bouton "＋" dans l'en-tête de la grille**~~ ✅ FAIT (3.11.1) — popover dans le coin de la grille.
- [x] ~~**Édition d'une compétence existante**~~ ✅ FAIT (3.11.1) — clic sur l'en-tête de colonne → popover (renommer/catégorie/couleur/supprimer).
- [x] ~~**Tooltip pédagogique** sur les niveaux 1-4~~ ✅ FAIT (3.11.1) — descriptions au survol + rappel raccourcis.
- [x] ~~**Réordonner les compétences**~~ ✅ FAIT (3.11.2) — flèches ← → dans le popover d'édition.

### P3 — Fonctionnel avancé
- [x] ~~**Action B → assigner réellement**~~ ✅ FAIT (3.11.2) — bouton "Assigner" → popover sélecteur de ticket → définit le membre comme leader.
- [x] ~~**Vue radar par membre**~~ ✅ FAIT (3.11.2) — modal fiche membre (clic pastille carte) avec radar Chart.js.
- [x] ~~**Lien Skills Matrix ↔ Mobilité**~~ ✅ FAIT (3.11.5) — badge ≈N (moyenne des compétences) dans le tableau de mobilité, clic = reprendre la valeur.
- [x] ~~**Filtre/recherche** dans la Skills Matrix~~ ✅ FAIT (3.11.3) — recherche par nom + masquer non-évalués (lignes ET colonnes).
- [x] ~~**Heatmap d'appétence au niveau équipe**~~ ✅ FAIT (3.11.5) — fortes (plein) + faibles (atténué/tireté) sur la carte ; neutres masquées.

### P4 — Nice to have
- [x] ~~**Mode présentation / onboarding**~~ ✅ FAIT (3.11.3) — bouton plein écran sur la carte unFIX (Fullscreen API + fallback), éléments agrandis. Navigation guidée auto (séquence) reste à faire si besoin.
- [x] ~~**Export de la carte unFIX** en image~~ ✅ FAIT (3.11.6) — bouton ⬇ → PNG via html2canvas (niveau de zoom courant, fond thème).
- [x] ~~**Navigation guidée auto**~~ ✅ FAIT (3.11.7) — bouton ▶ Visite guidée : séquence Programme → groupes → équipes auto (~4s/étape), contrôles + barre de progression + raccourcis clavier.
- [ ] **Historique des niveaux** (évolution dans le temps d'une compétence) — nécessiterait une table d'historique.

---

## ⚠️ Pièges & conventions à respecter (cf. CLAUDE.md)

- **Source de vérité membres** = table `absences` (CSV RH), via `deriveMembersFromAbsences(absences, members)`. NE PAS utiliser `store.get('members')` brut pour lister les personnes.
- **Échapper avec `esc()`** avant tout `innerHTML` (XSS).
- **Mapping snake/camel** : backend renvoie camelCase via les `_xxx_dict()`. Vérifier la correspondance (ex: `scope_key` → `scopeKey`, `member_name` → `memberName`).
- **Filtre topbar** : `store.get('team')` (équipe ou `'all'`) + `store.get('group')` (id de ligne produit). La carte ET la matrix doivent respecter ce filtre — déjà implémenté dans `_buildHierarchy()` et `_matrixEntities()`.
- **Toujours mettre à jour [CHANGELOG.md](CHANGELOG.md)** lors de modifs conséquentes (format : version sémantique en tête, plus récente en haut). Atlas = `3.11.0`.
- **Pas de Co-Authored-By** dans les commits.
- **Tester via curl** après modif backend (lancer `python main.py`, port 3000, tester les routes, nettoyer les données de test, arrêter le serveur).

## 🧪 Comment tester
```bash
cd squad-board
python main.py            # port 3000
# Ouvrir http://localhost:3000 → menu Atlas (A)
# Backend : curl http://localhost:3000/api/skills  (12 seedées)
#           curl http://localhost:3000/docs         (Swagger)
```

## 📂 Fichiers clés de la feature Atlas
| Fichier | Rôle |
|---------|------|
| [main.py](main.py) | tables (`class Skill` ~L270), dict helpers (`_skill_dict` ~L660), endpoints (`# Atlas:` ~L1182), seed (`_seed_atlas_catalog` ~L402), import à compléter (`import_all` ~L1961) |
| [static/js/views/atlas.js](static/js/views/atlas.js) | toute la vue (carte + matrix + 3 modals + actions) |
| [static/css/atlas.css](static/css/atlas.css) | styles |
| [static/js/api.js](static/js/api.js) | fonctions API Atlas (section "Atlas :") |
| [static/js/state.js](static/js/state.js) | clés de state |
| [static/js/app.js](static/js/app.js) | registration vue + chargement données |
| [static/js/config.js](static/js/config.js) | `NAV_ITEMS` (entrée `atlas`) |
