# BACKLOG — squad-boards

> Dernière mise à jour : 2026-10-28 (campagne d'évaluation et palette en mots libres en 3.265.0 ; analyse « site paramétrable »)
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
- [ ] **Dette : fichiers de plus de 800 lignes — 15 au 2026-10-24** (25 le 2026-10-21) — `npm run check:size` les liste.
  Restent : charts.js (2 285), utils.js (1 384, « barrel » qui porte encore du code), reports.js (1 453), backlog.js
  (1 095), roadmap.js (964), sprint.js (918), app.js (917), agenda.js (840) ; CSS : calendar-banner (1 759), dashboard
  (1 664), sprint-tickets-modal (1 466), sprint (1 198), support (1 070), modal-detail (1 008), health (937).
  Méthode éprouvée (3.257.0 → 3.261.0) : modèle calculé une fois + blocs `xxxHtml(m)` + câblage, HTML comparé à
  l'ancien rendu dans Chromium (hasard figé), un fichier par session. — *2026-10-18, chiffres 2026-10-24*
- [ ] **Dette : fonctions de plus de 150 lignes — 59** (règle ajoutée le 2026-10-24) — les plus grosses :
  `_openSprintModal` (675, health-sprint-modal.js), `renderCapacity` (672, pi-capacity.js), `renderAgenda` (658),
  `wireSprintPiSection` (559), `_doImport` (549, sync.js), `_openPokerModal` (544), `renderReports` (525), `renderPI`
  (511), `updateInfoPanel` (489). — *2026-10-24*
- [ ] 💡 **États vides restants** → `emptyStateHtml` (Rapports : Sprint et PI Planning — Flow, Support, Roadmap, Burnup faits en 3.212.0 ; Atlas fait en 3.264.0 ; restent PI, Roadmap, Support, et `atlas-empty-sm` d'atlas_history.js), au fil des retouches de ces vues. — *2026-10-24*

### 🧬 Atlas — suites de la refonte (3.263.0)

- [ ] **🔥 Mener la campagne pilote** — l'OUTIL est livré en 3.265.0 (📋 Campagne : bandeau de l'Atlas, bouton de la
  matrice, palette Ctrl+K) ; reste à l'utiliser : une équipe pilote, ses ⭐ requises, ses personnes (~2 min chacune),
  puis relire les signaux sur données réelles et ajuster les seuils (sachant = niveau ≥ 2, bus factor ≤ 1 sachant —
  cf. « Seuils métier réglables » plus bas). La base n'a encore AUCUNE évaluation. — *2026-10-24, outil 2026-10-28*
- [ ] **Auto-évaluation par la personne** — aujourd'hui seul un manager évalue (depuis la matrice). Proposer « ✏️ Mon
  profil » : la personne note niveaux + envies, le manager VALIDE (statut `proposé` → `validé` sur `member_skill`). Sans
  ça, la matrice repose sur une seule personne et vieillit vite. — *2026-10-24*
- [ ] **Fraîcheur des évaluations** — `member_skill.updated_at` existe : griser les cases de plus de 6 mois, signal
  « 7 évaluations > 6 mois » (KPI déjà dessiné dans les maquettes Signaux), filtre « à réévaluer ». — *2026-10-24*
- [ ] **Import CSV des évaluations** — une campagne se fait souvent dans un tableur : colonnes `Nom;Compétence;Niveau;Envie`,
  aperçu + rapprochement des noms par `findPerson` (person-name.js) avant écriture. — *2026-10-24*
- [ ] **Profil cible par rôle** pour les trajectoires (Scrum Master, Tech Lead…) : radar « personne vs profil cible »
  dessiné dans les maquettes (`mockups/atlas/*/05-mobilite.html`) mais pas de donnée. Table `role_profile` (rôle →
  niveaux attendus) éditable dans le Catalogue. — *2026-10-24*
- [ ] **Atelier : plusieurs déplacements** — la simulation n'en gère qu'un ; un PI Planning en enchaîne souvent 2-3.
  Liste des déplacements, impact cumulé, puis « Appliquer au roster du PI suivant » (`piInfo.piMembers`, cf.
  `effectiveRosterForPi`) au lieu d'une simple copie de texte. — *2026-10-24*
- [ ] **Objectifs d'équipe de l'Atlas en base** — encore en localStorage `sb-team-objectives-*` (propres à chaque
  navigateur, même défaut que les compétences requises avant 3.262.0). Les rapprocher des objectifs de PI ? — *2026-10-24*
- [ ] **Sachant unique bientôt absent → info-panel et TV** — le signal 🚌 + 🌴 existe dans l'Atlas ; le remonter dans
  les alertes de l'info-panel et l'écran TV du daily, où l'équipe le verrait à temps. — *2026-10-24*
- [ ] **Couverture des compétences par PI** — instantané par PI (comme `skill_level_history`) pour tracer « trous de
  couverture : 3 → 2 → 1 » (graphe dessiné dans les maquettes Signaux). — *2026-10-24*
- [ ] **Tests de `atlas-model.js`** — fonctions pures (coverage, signals, suggest, simImpact, firstName) : golden dataset
  synthétique comme `tests/status-map.test.mjs` (tests sur demande uniquement). — *2026-10-24*

### 🧹 Qualité — repérée pendant les découpages (2026-10-23 / 24)

- [ ] **Smoke test navigateur par vue** — le plantage de la modale d'alerte Health (`opts is not defined`, de 3.244.0 à
  3.261.0) n'a été vu que par un test Playwright : aucun test unitaire ne rend les vues. Un script `npm run smoke`
  (Chromium, écritures interceptées) qui ouvre chaque vue et ses modales principales et échoue sur toute erreur JS. — *2026-10-24*
- [ ] **ESLint à zéro avertissement** — les modules découpés (Paramètres, PI, Dashboard, Health, Atlas) sont propres ;
  il reste les anciens fichiers (settings-rotation.js : imports inutilisés, etc.). Puis `eslint` + `check:size --strict`
  en garde avant commit. — *2026-10-24*
- [ ] **`core` (628 Mo) à la racine** — vidage mémoire d'un processus Python (`multiprocessing.spawn` = uvicorn en
  `reload`, cf. #A2) ; le checkpoint automatique du 26/10 l'avait commité (retiré avant push en 3.265.0, désormais
  dans `.gitignore`). À supprimer du disque quand tu veux (`rm -f core`). — *2026-10-28*

### 🧩 Rendre le site paramétrable pour n'importe quel projet (analyse du 2026-10-28)

Constat : le moteur est générique (JIRA optionnel, saisie manuelle possible, démo semée), mais une partie des règles
du client actuel vit **dans le code** et une partie des réglages de projet vit **dans le navigateur** (localStorage,
un comportement par PC). Ordre conseillé : **P1-1 → P1-3 → P1-2 → P2-5** (la table de réglages est le socle du reste) ;
#A2 (authentification) reste préalable à tout ce qui touche aux secrets ou au multi-projets.

**🔴 P1 — bloquant pour brancher un autre projet**
- [x] **P1-1 · Réglages de projet en base** · ✅ 3.266.0 — `projectStorage` (project-settings.js), table `project_setting`.
- [x] **P1-2 · Correspondance des statuts et types JIRA** · ✅ 3.268.0 — onglet 🗂️ Correspondance, inconnus notés à la synchro.
- [x] **P1-3 · Défauts du client sortis du code** · ✅ 3.267.0 — statuts forcés vides, cadrage en réglage (✏️), story points détectés.
- [ ] **P1-4 · Secrets hors du navigateur** — jeton JIRA (`sb-jira-token`) et webhook Slack (`sb-slack-webhook`) en
  localStorage : exclus des sauvegardes, mais lisibles par tout script de la page et à ressaisir sur chaque PC. Après
  #A2 : côté serveur (`.env` ou table chiffrée), le navigateur ne connaît plus que l'URL. — *2026-10-28*

**🟠 P2 — adopter sans développeur**
- [ ] **P2-5 · Assistant de mise en route** — `first_launch.js` propose démo / JIRA / à la main, sans guider la suite.
  Parcours en 5 étapes qui écrit les réglages P1 : nom du projet, cadence (durée de sprint, sprints par PI, IP),
  lignes produit + équipes, source des personnes, statuts JIRA. — *2026-10-28*
- [ ] **P2-6 · Personnes sans export RH du client** — source de vérité = import Congés RH à SON format (pivot
  `NOMS, Prénom · Équipes · Entité · Rôles · dd/mm…` ou `Nom;Equipe;Debut;Fin;Type;Jours`, « Jours PIP exclus »).
  Vérifier qu'une saisie manuelle des membres suffit PARTOUT (Atlas, capacité, météo, rotation), et ajouter un
  rapprochement de colonnes à l'import (quelle colonne = nom, équipe, début, fin). — *2026-10-28*
- [ ] **P2-7 · Modules activables + vocabulaire** — PI Planning, Roadmap, Support, Atlas, Poker, Affinage, TV toujours
  affichés ; une équipe Scrum hors SAFe n'a ni PI ni train. Réglage « modules actifs » (navigation, palette, Dashboard)
  et libellés « PI → Release / Trimestre », « Train → Programme », « Ligne produit → Domaine ». — *2026-10-28*
- [ ] **P2-8 · Seuils métier réglables, réunis** — Atlas (sachant `EXPERT_MIN = 2`, bus factor ≤ 1, absence « bientôt »
  14 j), météo (`METEO_START_TOLERANCE`, item plus haut), stagnation (Dashboard réglable, mais l'alerte de
  l'info-panel garde son propre « > 5 j » en dur — infopanel.js), SLA support, échelle du poker figée côté
  serveur (`poker.py _ALLOWED = 1,2,3,5,8,13,21,?` : ni 0, ni ½, ni tailles de t-shirt). Un écran « Règles » qui les
  rassemble avec leur effet. — *2026-10-28*
- [ ] **P2-9 · Jours fériés par pays** — `utils/holidays.js` = France métropole en dur. Choix FR / Alsace-Moselle /
  BE / CH / aucun + jours de fermeture de l'entreprise (ponts). — *2026-10-28*
- [ ] **P2-10 · Référentiel de niveaux Atlas éditable** — les 4 libellés actuels sont une décision du client (à NE PAS
  changer pour lui) ; pour un autre projet : libellés et descriptions éditables dans le Catalogue, échelle 0-4
  conservée (les calculs en dépendent). — *2026-10-28*

**🟡 P3 — confort, plusieurs instances**
- [ ] **P3-11 · Identité de l'instance** — « Squad Board » en dur (`index.html`, `first_launch.js`) : nom, logo,
  couleur primaire en réglages ; `<title>` dynamique — utile dès que deux instances tournent côte à côte. — *2026-10-28*
- [ ] **P3-12 · Nommage des boards → équipes** — `extractTeam()` connaît `Sprint|Équipe|Team|Board|Kanban` et les
  suffixes « Ité 31.2 » du client ; exposer une table « board → équipe » (existe en partie : `sb-jiraProjectTeams`). — *2026-10-28*
- [ ] **P3-13 · Plusieurs projets** — aujourd'hui 1 base = 1 projet (`SB_DB_PATH`). Recommandation : multi-INSTANCE
  (une base + un port par projet, déjà possible) documenté avec un gabarit `ecosystem.config.cjs`, plutôt qu'un
  multi-tenant (chantier lourd). `.env.example` annonce encore `PORT=3000` (réel 3010, cf. #A5). — *2026-10-28*
- [ ] **P3-14 · Gabarit de projet** — l'export de configuration `.local` (3.198.0) existe ; ajouter un mode « gabarit »
  SANS données (catalogue Atlas, statuts, seuils, modèles d'ateliers) pour démarrer un projet depuis un autre. — *2026-10-28*

## 💡 Idées (à affiner)

- [x] 🎙️ **Démos vidéo : voix off en français** — fait en 3.262.0 (2026-10-24) : Piper en local dans
  `tools/demo-video/.venv` (voix `fr_FR-siwis-medium`), une réplique par sous-titre synthétisée AVANT la capture et
  calée à l'instant du sous-titre, piste AAC mixée dans le MP4 (un seul fichier, `muted` par défaut dans les pages ;
  le lecteur `/demo/` l'active à la demande, touche `M`). Proposé le 2026-10-22.

## 🧊 Someday/Maybe

---

## 🎯 Contexte — Atlas (refondu en 3.263.0)

Directions retenues de la galerie [`static/mockups/atlas/`](static/mockups/atlas/README.md) : 🌌 **Constellation**
(onglet Carte) + 🟩 **Matrice** (onglet Skills Matrix). Architecture et règles : section « Atlas refondu » de
[CLAUDE.md](CLAUDE.md). En bref : coquille `views/atlas.js`, un module par onglet (`atlas-map`, `-matrix`, `-board`,
`-mobility`, `-catalog`), calculs dans `atlas-model.js`, fiche + évaluation dans `atlas-member.js`, actions dans
`atlas-actions.js`. Onglet dans le hash `#atlas/<équipe>/<onglet>` (palette Ctrl+K, liens partageables).
Backend : `app/routers/atlas.py` — envie par compétence (`member_skill.appetence`), compétences requises
(`team_skill_requirement`), trajectoires (`member_mobility.stage/steps/mentor`).

### Décisions validées avec l'utilisateur
- **Référentiel niveaux** (NE PAS modifier) : `1=exécutant spécialisé · 2=opérationnel structuré · 3=ingénieur cloud ready · 4=référent/architecte` ; sachant = niveau ≥ 2.
- **Envie** : PAR compétence (dans l'évaluation) ET catalogue d'envies séparé (Management, Coaching…) — 2026-10-24.
- **Compétences requises par équipe** : en base, partagées par tous — 2026-10-24.
- **Appétence** `faible / neutre / forte` · **Potentiel** `faible / moyen / fort` · **Risque** `aucun / moyen / critique` · **Étape** `souhait / plan / en_cours / bilan`.

---

## ⚠️ Pièges & conventions à respecter (cf. CLAUDE.md)

- **Source de vérité membres** = table `absences` (CSV RH), via `deriveMembersFromAbsences(absences, members)`. NE PAS utiliser `store.get('members')` brut pour lister les personnes.
- **Échapper avec `esc()`** avant tout `innerHTML` (XSS).
- **Mapping snake/camel** : backend renvoie camelCase via les `_xxx_dict()`. Vérifier la correspondance (ex: `scope_key` → `scopeKey`, `member_name` → `memberName`).
- **Filtre topbar** : `store.get('team')` (équipe ou `'all'`) + `store.get('group')` (id de ligne produit). Toutes les vues de l'Atlas le respectent via `atlasCtx()` (`teams`, `visiblePeople`).
- **Noms RH « NOM, Prénom »** : prénom par `firstName` (atlas-model.js), jamais `split(' ')[0]`.
- **Toujours mettre à jour [CHANGELOG.md](CHANGELOG.md)** lors de modifs conséquentes (format : version sémantique en tête, plus récente en haut).
- **Pas de Co-Authored-By** dans les commits.
- **Tester le backend sur une COPIE de la base** (`SB_DB_PATH=<copie> python3 …` + `TestClient`) : l'historique des niveaux ne s'efface pas. Routes Python figées au lancement → `pm2 restart squad-boards-drafts` après modif.

### 🧪 Comment tester
```bash
pm2 restart squad-boards-drafts          # après une modif Python (port 3010)
npm test                                 # 406 tests node:test
npm run check:size                       # fichiers > 800 lignes, fonctions > 150
# Navigateur : http://127.0.0.1:3010/#atlas/all/matrix — données d'essai par interception (page.route), jamais en base
```

---
