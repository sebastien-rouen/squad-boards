# BACKLOG — Squad Board

> Dernière mise à jour : 2026-08-29
>
> Ce fichier ne contient que **ce qui reste à faire**. Les items soldés sont
> dans [`docs/BACKLOG-ARCHIVE.md`](docs/BACKLOG-ARCHIVE.md) ; leur récit complet
> vit dans [`CHANGELOG.md`](CHANGELOG.md).

> Document de reprise pour une nouvelle conversation Claude. Lire en premier : [CLAUDE.md](CLAUDE.md) (conventions codebase) puis ce fichier.

---

## ✅ TODO

- [~] **#13 — Confidence vote → tendance (début vs fin de PI)** — **partiel depuis 3.154.0** : la fiche équipe (Dashboard filtré) trace la tendance Mood & ✊ **sprint par sprint** sans nouvelle table ([meteo_fiche.js](static/js/components/meteo_fiche.js)). Reste la version *par objectif* avec phase `start|end` (stockage `type=confidence` + champ phase) — utile seulement si la tendance par sprint ne suffit pas à l'usage.
- [ ] **Historique des niveaux Atlas** (évolution dans le temps d'une compétence) — nécessiterait une table d'historique.
- [ ] **Généraliser les helpers « ? » + tooltips** sur les cards/KPI du Dashboard (popover avec schéma SVG explicatif, **bordure conique « en spirale »**, fond `--surface-3` ; tooltips au survol des indicateurs) — prototypés dans [static/mockups/dashboard-directions.html](static/mockups/dashboard-directions.html), à porter dans l'app (réutiliser [help_popover.js](static/js/components/help_popover.js) + [tooltip.js](static/js/components/tooltip.js)). Les « ? » météo (3.152.0) utilisent déjà `HELP_REGISTRY` : c'est le mécanisme à étendre, pas à doubler. Les schémas des maquettes de refonte (`static/mockups/refonte/_gen/ui-flows.js`, `SCHEMAS`) sont réutilisables tels quels.
- [ ] **Identité Météo sur Board / Backlog** (`static/mockups/refonte/mockup-3/08-board.html`) — cosmétique : météo du sprint dans le titre du Board, vieillissement qui colore la carte entière en Kanban. **À décider après usage** de la matrice et de la fiche ; ne pas lancer sans demande.
- [ ] **TV : écran « Sprint review »** dans la rotation (le rapport du dernier sprint clos, lecture seule) — la maquette `12-tv-rotation.html` le prévoit, `views/tv.js` a la place (`SCREENS`). Petit, mais attendre un retour sur la rotation actuelle (3 écrans + alerte) avant d'en ajouter un quatrième.
- [ ] **Tolérance de démarrage réglable** (`METEO_START_TOLERANCE`, 15 %) et bandes relatives (`METEO_REL_BAND`) dans Paramètres → Météo — seulement si une équipe se plaint d'un 🌧️ en J2 ; aujourd'hui constantes de `utils/meteo.js`.

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
