# BACKLOG — Squad Board

> Document de reprise pour une nouvelle conversation Claude. Lire en premier : [CLAUDE.md](CLAUDE.md) (conventions codebase) puis ce fichier.

---

## ✅ TODO

- [ ] **#13 — Confidence vote → tendance (début vs fin de PI)** — le vote de confiance par objectif (#4, 3.13.0) est instantané. Stocker un horodatage / phase (`start|end`) pour tracer la **courbe de confiance** sur le PI. Réutiliser le stockage `type=confidence` existant en ajoutant un champ phase.
- [ ] **Historique des niveaux Atlas** (évolution dans le temps d'une compétence) — nécessiterait une table d'historique.
- [ ] **Refonte design du Dashboard** — répercuter sur le vrai Dashboard la direction retenue dans les maquettes ([static/mockups/dashboard-directions.html](static/mockups/dashboard-directions.html), 7 pistes A→G). **Direction retenue par l'utilisateur : F · Deux flux** (2 colonnes équilibrées : *Pilotage & flux* à gauche, *Équipe & risques* à droite). Principe : aéré entre sections, resserré entre cards.
  - ⭐ **Conserver le contenu riche de `pi-sprints-strip-cards`** (mini-cartes de sprint du PI avec tickets groupés US / Buffer / Action, glissés, points — cf. `_renderPiSprintsStrip` dans [dashboard.js](static/js/views/dashboard.js)) : l'utilisateur l'apprécie et veut pouvoir le réutiliser tel quel sur le Dashboard (la version dans la maquette est simplifiée).
- [ ] **Généraliser les helpers « ? » + tooltips** sur les cards/KPI du Dashboard (popover avec schéma SVG explicatif, **bordure conique « en spirale »**, fond `--surface-3` ; tooltips au survol des indicateurs) — prototypés dans la maquette ci-dessus, à porter dans l'app (réutiliser [help_popover.js](static/js/components/help_popover.js) + [tooltip.js](static/js/components/tooltip.js)).

<details>
<summary>✅ Items TODO terminés</summary>

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
