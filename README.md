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

| Vue | Description | Raccourci |
|-----|-------------|-----------|
| 📊 **Dashboard** | Métriques, cartes équipes, activité récente | `1` |
| 🏃 **Sprint** | Board colonnes avec story points et WIP | `2` |
| 📋 **Kanban** | Vue flux avec métriques | `3` |
| 🎯 **PI Planning** | Features, objectifs PI, récap équipes | `4` |
| 📈 **Rapports** | Graphiques, rapport texte copiable | `5` |
| ⚙️ **Paramètres** | Groupes, équipes, membres, absences, support, sprint, data | `6` |

### 🔎 Filtre équipe / ligne produit

Le sélecteur en haut de l'écran permet de :
- 👥 Filtrer par **équipe individuelle**
- 🧩 Filtrer par **ligne produit** (groupe d'équipes) — toutes les vues s'adaptent automatiquement

### ⌨️ Raccourcis clavier

| Touche | Action |
|--------|--------|
| `N` | ✏️ Nouveau ticket |
| `1` → `6` | 🧭 Naviguer entre les vues |
| `Ctrl+K` | 🔍 Recherche rapide |
| `Esc` | ❌ Fermer modal / recherche |

### 📥 Import des absences (CSV)

Dans **Paramètres > Absences**, collez un CSV avec le format :

```
Nom;Equipe;Debut;Fin;Type;Jours
Alice Martin;Alpha;2026-04-14;2026-04-18;conge;5
Bob Dupont;Beta;2026-04-15;2026-04-15;maladie;1
```

> 💡 Le format **Pivot RH** (colonnes-dates) est aussi reconnu automatiquement.

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
