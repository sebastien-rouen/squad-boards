# Guide Release Train Engineer

> Orchestrez le PI, pilotez les equipes et gerez les risques a l'echelle.

---

## Votre poste de commandement

- **Groupes** (lignes produit) : filtrez plusieurs equipes d'un clic dans la sidebar
- **PI Planning** : objectifs, capacite, features - vue consolidee
- **Roadmap** : velocity, allocation, sante du backlog
- **Faits marquants** : incidents, gels, jalons - visibles dans les parametres
- **Rotation support** : grille par equipe avec verrouillage et shuffle

## Le cycle PI

### Preparation
1. **Parametres** (`7`) : configurez le PI (numero, sprints/PI, velocity cible)
2. Creez les **groupes** (lignes produit) et assignez les equipes
3. Definissez les **objectifs PI** dans PI Planning (`4`)
4. Importez les **absences** (CSV) pour le PI

### Planification
- Vue **PI Planning** (`4`) onglet **Capacite** : membres, points, absences par equipe
- Onglet **Equipes** : breakdown detaille par statut, bloques, absences

### Execution
- Vue **Dashboard** (`1`) : metriques globales, progression toutes equipes
- **Filtrer par groupe** dans la sidebar : voir les equipes d'une ligne produit
- Surveiller les **alertes sprint** : retard, bloques, WIP
- **Rapports** (`6`) format Slack pour le management

### Inspect & Adapt
- **Roadmap** (`5`) : velocity realisee, features terminees
- **Cycle Time** et **Throughput** dans Sprint (`2`)
- Exporter les donnees (JSON) depuis Parametres

## Gestion multi-equipe

- Creez des **groupes** dans Parametres → Lignes produit
- Dans la sidebar, cliquez un **groupe** : toutes les vues se filtrent sur ses equipes
- Le **Dashboard** affiche uniquement les cartes des equipes du groupe
- Le titre du topbar indique le contexte : "Sprint - Portail"

## Gestion des risques

- **Faits marquants** dans Parametres : incidents, gels de code, jalons
- **Alertes sprint** : perimetre elargi, ratio bloques, retard velocity
- **Panneau info** : tickets bloques, WIP eleve, absences en cours

## Rapports par audience

| Audience | Format | Sections |
|----------|--------|----------|
| Equipes | Texte | Sprint, Flow |
| Management | Slack | Sprint, Roadmap, PI |
| Stakeholders | Confluence | Complet (7 sections) |

## Vues cles

| Priorite | Vue | Usage |
|----------|-----|-------|
| Quotidien | Dashboard (`1`) | Vue consolidee multi-equipe |
| Quotidien | Sprint (`2`) | Suivi sprint avec alertes |
| Hebdo | PI Planning (`4`) | Objectifs, capacite |
| Hebdo | Roadmap (`5`) | Velocity, features, allocation |
| Hebdo | Rapports (`6`) | Communication |
| PI | Parametres (`7`) | Config PI, absences, rotation, events |
