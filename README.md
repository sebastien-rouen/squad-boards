# 🎯 Squad Board

> 📋 **Le board agile autoporteur** — pilotez vos tickets, équipes, features, absences et rotations support **sans dépendance externe**. JIRA est un plugin d'import optionnel.

---

## 🚀 Démarrage rapide

```bash
pip install -r requirements.txt
python main.py
```

👉 Ouvrez **http://localhost:3000** — des données de démo sont créées automatiquement.

> 💡 Aucun build, aucun framework JS, aucun service externe requis : ça marche tel quel.

---

## ✨ Fonctionnalités

### 🛠️ Gestion autonome (sans JIRA)

- 🎟️ **Tickets** — créer, modifier, supprimer, changer le statut, commenter
- 👤 **Leader + Contributors** — un responsable et des membres secondaires
- 🧱 **Features / Epics** — hiérarchie de travail (Feature → Epic → Ticket)
- 🏷️ **Équipes** — CRUD avec couleur personnalisable
- 🧩 **Lignes produit (groupes)** — regroupez des équipes, filtrez par groupe
- 🧑‍🤝‍🧑 **Membres** — gestion avec équipe et rôle
- 🌴 **Absences / Congés** — ajout individuel ou import CSV en masse
- 🛡️ **Rotation support** — qui est au support par équipe et par semaine
- 🏃 **Sprint** — nom, dates, objectif
- 📥 **Import / Export** — JSON complet, transférable d'un poste à l'autre

### 🖼️ Vues

La sidebar est organisée en deux groupes : **Pilotage** (toujours visible, raccourcis `1`-`8`) et **Équipe & RH** (repliable, replié par défaut).

#### 🧭 Pilotage

| Vue | Description | Raccourci |
|-----|-------------|-----------|
| 📊 **Dashboard** | Métriques sprint/PI, cartes équipes, objectifs PI, tickets bloqués/stagnants, activité récente | `1` |
| 🧭 **Board** | Bascule **Scrum** (liste par sprint, story points, WIP) ↔ **Kanban** (colonnes par statut) — un seul écran, un toggle | `2` |
| 📋 **Backlog** | Tous les tickets via filtres puissants, regroupement par sprint / PI, actions en masse | `3` |
| 🎯 **PI Planning** | 11 onglets : Objectifs, Features, Capacité, Burnup, ROAM, **Dépendances** (programme board inter-équipes), Équipes, Support, Mood/ROTI, Fist of Five, Calendrier | `4` |
| 🗺️ **Roadmap** | **Timeline multi-PI** (PI-2 → PI+2, drill-down), vélocité 80/20, prédictibilité, santé backlog, allocation équipes, graphe de dépendances (liens inter-équipes en rouge) | `5` |
| 🛡️ **Santé** | Anomalies actionnables (WIP, stagnation, sans estimation…), score de santé par équipe | `6` |
| 📈 **Rapports** | Graphiques, rapport texte copiable | `7` |
| ⚙️ **Paramètres** | Groupes, équipes, membres, absences, support, sprint, PI, calendriers ICS, JIRA, données | `8` |

#### 👥 Équipe & RH (groupe repliable, sans raccourci clavier — accès via `Ctrl+K`)

| Vue | Description |
|-----|-------------|
| 🔄 **Amélioration** | Rétrospectives — actions Start/Stop/Continue, suivi |
| 🎧 **Support** | Rotation support par équipe et par semaine, modes & rotation auto |
| 🕸️ **Atlas** | Cartographie compétences/appétences, mobilité, simulation de staffing |
| 📅 **Agenda** | Présence hebdo (membres × jours), absences, support, jours fériés |

> 🧭 **Board unifié** : Scrum et Kanban ne sont plus deux entrées séparées — un toggle en haut bascule entre les deux modes sans changer de page.
> 🔁 **Pilotage réordonnable** : survolez un item (poignée ⠿), maintenez ~1 s puis glissez pour personnaliser l'ordre du menu (sauvegardé en local).

### 🔎 Filtre équipe / ligne produit

Le sélecteur en haut de l'écran permet de :
- 👥 Filtrer par **équipe individuelle**
- 🧩 Filtrer par **ligne produit** (groupe d'équipes) — toutes les vues s'adaptent automatiquement

### ⌨️ Raccourcis clavier

| Touche | Action |
|--------|--------|
| `N` | ✏️ Nouveau ticket |
| `1`→`8` | 🧭 Vues Pilotage : Dashboard · Board · Backlog · PI Planning · Roadmap · Santé · Rapports · Paramètres |
| `1`→`9` (sur PI Planning) | 🎯 Navigation entre les 10 onglets PI (la vue PI prioritaire sur les chiffres) |
| `Ctrl+K` | 🔍 Recherche rapide |
| `Esc` | ❌ Fermer modal / recherche |

> 🔗 **Navigation partageable** : l'URL reflète la vue, l'équipe/ligne produit, l'onglet et le PI sélectionné (`#pi/Fuego/capacity`, `#roadmap/group:prod/current`). Les boutons ◀ ▶ du navigateur fonctionnent, et un lien collé dans Slack rouvre exactement le même écran.

### 📥 Import des absences (CSV)

Dans **Paramètres > Absences**, collez un CSV avec le format :

```
Nom;Equipe;Debut;Fin;Type;Jours
Alice Martin;Alpha;2026-04-14;2026-04-18;conge;5
Bob Dupont;Beta;2026-04-15;2026-04-15;maladie;1
```

> 💡 Le format **Pivot RH** (colonnes-dates) est aussi reconnu automatiquement.

---

## 🎯 PI Planning — préparation & suivi

La vue **PI Planning** (`4`) couvre tout le cycle d'un Program Increment via 10 onglets, et un **sélecteur de PI** dans le header (`PI-2 … PI+2`) permet de naviguer entre passé, courant et futur sans changer d'écran.

### 🛠️ Avant le PI Planning (préparation)

- 🎯 **Objectifs** — saisir les objectifs PI par équipe (committed / stretch), avec progression en rollup une fois le PI lancé.
- ⚡ **Capacité** — capacité jours-homme par équipe = membres × sprints × jours ouvrés, **moins les absences planifiées** (source : CSV RH). Mini-heatmap de capacité dans le header.
- 📦 **Features** — backlog des features du PI, **rang JIRA préservé**, drag & drop pour réordonner.
- 🗓️ **Calendrier** — jours de PI Planning (PIP) récupérables, repères sprint, jours fériés.

### 📡 Pendant & après (suivi)

- 📈 **Burnup** — avancement story points du PI, par équipe ou global.
- ⚠️ **ROAM** — registre des risques (Resolved / Owned / Accepted / Mitigated).
- 🔗 **Dépendances** — programme board inter-équipes : matrice équipe→équipe des liens JIRA bloquants, dépendances inter-crews mises en évidence, détail au clic.
- ✊ **Fist of Five** & 😊 **Mood / ROTI** — votes de confiance et de ressenti, avec **vote de confiance par objectif** et animation de consensus.
- 👥 **Équipes** / 🛡️ **Support** — récap par équipe et rotation support sur la période.
- 📊 **Prédictibilité** (Roadmap) — moyenne livrée sur les 2 PI précédents vs capacité nette du PI courant.

> 🎥 **Mode présentation** plein écran (bouton ⊞ dans l'en-tête PI) pour animer la cérémonie sur grand écran.

> 🧠 **Convention de matching PI** : un sprint nommé `Fuego - Ite 30.3`, un label `PI#30` ou `PI30` sont tous rattachés au **PI 30**. La détection du PI courant est centralisée (`getCurrentPi`) — voir [docs/regles-metier.md](docs/regles-metier.md).

---

## 🔌 Plugin JIRA (optionnel)

```bash
cp .env.example .env
# Éditez JIRA_URL, JIRA_USER, JIRA_TOKEN, JIRA_PROJECT
```

Puis cliquez le bouton **JIRA** en haut à droite.

### ⚡ Capacités de synchronisation

- 🌐 Import **multi-projets** (`JIRA_PROJECT=GCOM,GEX,GDC,...`)
- 🔁 **6 passes d'import** : sprint actif par board, sprints futurs, features, epics, sprints PI nommés (`"PI30"`), tickets d'amélioration
- 🥇 **Rang JIRA préservé** sur les features (ordre backlog `ORDER BY rank ASC`)
- 🏷️ **Normalisation auto des noms d'équipe** : `"GCOM - Fuego"` (JIRA Team[Team]) devient `"Fuego"` pour matcher les boards locaux — aucune config manuelle de préfixe
- 🧬 **Héritage de features** : la vue PI suivant remonte les features dont les enfants sont planifiés en PI#N, même si la feature elle-même n'est pas étiquetée PI#N
- 🛡️ **Pagination robuste** : nextPageToken + startAt fallback + détection de pages dupliquées

### ⚙️ Configuration avancée (Paramètres)

- 🔢 Max tickets / features / epics (vide = illimité)
- 🧮 Max boards (vide = illimité)
- 🏃 Champ Sprint (`Sprint` ou `customfield_10021`)
- 👥 Champ Équipe (`Team[Team]` ou `customfield_10001`)

### 🛠️ Page de debug `/tests/jira-explorer.html`

Outil autonome de comparaison **JIRA live ↔ base locale**. Utile pour diagnostiquer une feature manquante ou un import partiel.

**Trois onglets :**
- 🔬 **Inspection** d'une issue : champs JIRA bruts côte à côte avec la base locale, chaîne hiérarchique JIRA (parents + enfants)
- 📸 **Snapshot** : distributions tickets/features/epics par projet, PI, équipe, type ; alertes orphelins
- 💾 **JQL** : exécution directe de requête avec colonnes intelligentes ; bannière de comparaison ; bouton **Synchro** pour upsert dans la base locale sans re-sync complète

> 🔗 **Hash routing** (URL = état partageable) : `#tab=jql&jql=...`, `#tab=inspect&key=GCOM-1234&chain=1`. Navigation back/forward du navigateur supportée. Presets via chips colorés (Fuego PI#30, Features GCOM, Epics orphelins, etc.).

---

## 🏗️ Architecture

```
squad-board/
├── 🐍 main.py              # FastAPI + SQLModel — CRUD API complètes
├── 📦 requirements.txt     # 5 dépendances Python
├── 🔐 .env.example         # Template config JIRA
├── 🎨 static/              # Frontend SPA (Vanilla JS ES modules)
│   ├── index.html
│   ├── css/               # Design system (tokens, base, views)
│   └── js/                # Modules: app, state, api, sync, views, components
├── 💾 data/
│   └── board.db           # Base SQLite (auto-créée)
└── 📚 docs/                # Documentation détaillée
```

### 🗄️ Stockage

Un seul fichier SQLite (`data/board.db`) contenant :

| Table | Contenu |
|-------|---------|
| 🎟️ `ticket` | Tickets avec leader, contributors, comments, labels |
| 🧱 `feature` | Features (haut niveau) |
| 🧩 `epic` | Epics (regroupent des tickets) |
| 👤 `member` | Membres des équipes |
| 🏷️ `team` | Équipes avec couleur |
| 📦 `teamgroup` | Groupes / lignes produit |
| 🌴 `absence` | Absences et congés |
| 🛡️ `supportrotation` | Rotation support par semaine |
| 🏃 `sprintconfig` | Sprint en cours |
| 🎯 `piconfig` | PI (Program Increment) |

---

## 📚 Documentation

### 🧪 Technique
- 🏛️ [Architecture](docs/architecture.md) · ⚙️ [Configuration](docs/configuration.md) · 🔌 [API](docs/api.md)

### 🧑‍🚀 Guides par rôle
- 👨‍🏫 [Scrum Master](docs/guide-scrum-master.md) · 🎯 [Product Owner](docs/guide-product-owner.md) · 🚀 [RTE](docs/guide-rte.md)
- 👨‍💻 [Développeur](docs/guide-developpeur.md) · 🛡️ [Support](docs/guide-support.md) · 📋 [Project Manager](docs/guide-project-manager.md)

### 🗺️ Roadmap
- 📌 [Backlog features (46 items)](docs/backlog-features.md)
