# BACKLOG — squad-boards

> Dernière mise à jour : 2026-10-21 (#A1 soldé en 3.238.0 — renouveler le jeton JIRA)
>
> Ce fichier ne contient que **ce qui reste à faire**. Les items soldés sont
> dans [`docs/BACKLOG-ARCHIVE.md`](docs/BACKLOG-ARCHIVE.md) ; leur récit complet
> vit dans [`CHANGELOG.md`](CHANGELOG.md).

> Document de reprise pour une nouvelle conversation Claude. Lire en premier : [CLAUDE.md](CLAUDE.md) (conventions codebase) puis ce fichier.

---

## 🔥 Todo (prêt à coder)

### 🚨 Audit du 2026-10-21 — top 5 par impact

- [ ] **🔴 #A2 — API sans authentification, exposée sur `0.0.0.0:3010`** — aucune route protégée : `POST /api/import` (mode remplacer) efface la base, `/api/export` livre absences RH et membres, `/docs` (Swagger) ouvert. Lancé sous PM2 avec `reload=True` (mode dev, 2 processus). **À faire** : écouter sur `127.0.0.1` derrière Nginx, raccorder le SSO `auth` BastaVerse (skill `/auth-sso`) ou au minimum une clé, fermer `/docs`, retirer `reload` en exploitation. — *2026-10-21*
- [ ] **🟠 #A3 — `/api/all` : alléger la 1ʳᵉ ouverture** — ✅ fait en 3.245.0 : gzip (17,6 → 2,85 Mo), cache serveur + ETag (304 à l'actualisation), encodage direct, JS / CSS versionnés en cache. **Reste** : 62 % du poids des tickets = `description` + `comments` + `recentChanges` → `description` et `comments` pourraient se charger à l'ouverture d'un ticket (PAS `recentChanges`, lu par le périmètre de sprint). ⚠️ Golden test `/api/all` + aller-retour `_ticket_dict` ↔ `import_all` (cf. CLAUDE.md). — *2026-10-22*
- [ ] **🟠 #A4 — Backend : validation des entrées et journalisation** — 0 modèle Pydantic, 48 corps `await request.json()` lus bruts ; `crud.py:52-55` fait `setattr` de toute clé reçue (y compris `id`, `created_at`). Aucun journal applicatif ; 20 `except` muets + 12 `except Exception`. **À faire** : modèles d'entrée sur les routes d'écriture, `logging` à la place des silences. — *2026-10-21*
- [ ] **🟡 #A5 — Petits correctifs de cohérence** — (a) thème **clair** par défaut (`state.js:52`, `<html data-theme="light">`) ≠ règle BastaVerse n° 7 (sombre) ; (c) ports incohérents dans la doc (CLAUDE.md 3001, README / docs 3000, réel 3010) et « 161 tests » annoncés pour 406 ; (d) 7 `data/*.bak.db` (~110 Mo) à archiver ; (f) titres JIRA non échappés dans la copie HTML de `pi.js:1122-1127` (`<` / `&` cassent le collage). — *2026-10-21*

### Suite

- [ ] **#13 — Confidence vote → tendance (début vs fin de PI)** — **partiel depuis 3.154.0** : la fiche équipe (Dashboard filtré) trace la tendance Mood & ✊ **sprint par sprint** sans nouvelle table ([meteo_fiche.js](static/js/components/meteo_fiche.js)). Reste la version *par objectif* avec phase `start|end` (stockage `type=confidence` + champ phase) — utile seulement si la tendance par sprint ne suffit pas à l'usage. — *2026-10-18*
- [ ] **Tolérance de démarrage réglable** (`METEO_START_TOLERANCE`, 15 %) et bandes relatives (`METEO_REL_BAND`) dans Paramètres → Météo — seulement si une équipe se plaint d'un 🌧️ en J2 ; aujourd'hui constantes de `utils/meteo.js`. — *2026-10-18*
- [ ] **Page 403 explicite — à appliquer** : le bloc est prêt dans [docs/nginx-403.md](docs/nginx-403.md) (Nginx Proxy Manager → hôte → *Advanced*). Geste d'infra, hors du site (préparé en 3.197.0). — *2026-10-18*
- [ ] **Vérifier sur le serveur** ce qui a été ajouté le 2026-10-03 — le banc local simule l'API : `curl -s https://squad-boards-drafts.bastou.dev/api/config/export | head -c 300`, une vraie sauvegarde / restauration (Paramètres → Données → 💾), un changement de niveau Atlas puis `GET /api/skill-history`, et le bandeau « données obsolètes » après une synchro (auteur affiché). — *2026-10-18*
- [ ] **Dette : fichiers de plus de 800 lignes — 25 fichiers au 2026-10-21** — les plus gros : settings.js (3 691), pi.js (3 232), modal.js (2 967), atlas.js (2 711), sprint_tickets_modal.js (2 638), charts.js (2 262), calendar-banner.css (1 759), dashboard.css (1 664), cal_banner.js (1 644), health.js (1 624), utils.js (1 382, « barrel » qui porte encore du code), sync.js (1 130), app.js (905). Découper par blocs consécutifs, preuve `cmp` (méthode de settings.css en 3.197.0), un fichier par session. — *2026-10-18, chiffres 2026-10-21*
- [ ] 💡 **États vides restants** → `emptyStateHtml` (Rapports : Sprint et PI Planning — Flow, Support, Roadmap, Burnup faits en 3.212.0 ; PI, Roadmap, Support, Atlas `atlas-empty-sm`…), au fil des retouches de ces vues. — *2026-10-18*

## 💡 Idées (à affiner)

- [x] 🎙️ **Démos vidéo : voix off en français** — fait en 3.258.0 (2026-10-24) : Piper en local dans
  `tools/demo-video/.venv` (voix `fr_FR-siwis-medium`), une réplique par sous-titre synthétisée AVANT la capture et
  calée à l'instant du sous-titre, piste AAC mixée dans le MP4 (un seul fichier, `muted` par défaut dans les pages ;
  le lecteur `/demo/` l'active à la demande, touche `M`). Proposé le 2026-10-22.

## 🧊 Someday/Maybe

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
