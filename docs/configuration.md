# Guide de configuration

## Installation

```bash
cd squad-board
python -m venv .venv
.venv\Scripts\activate     # Windows
pip install -r requirements.txt
python main.py             # → http://localhost:3000
```

Au premier lancement, 40 tickets de demo sont crees automatiquement.

## Gestion des equipes et groupes

### Equipes
Dans **Parametres** > Equipes :
- Ajoutez une equipe (nom + couleur)
- Les equipes apparaissent dans le filtre topbar et les formulaires

### Lignes produit (groupes)
Dans **Parametres** > Lignes produit :
- Creez un groupe avec un nom et une liste d'equipes (separees par virgule)
- Exemple : Groupe "Portail" contenant les equipes "Alpha, Beta"
- Le filtre topbar affiche les groupes en premier, puis les equipes individuelles
- Selectionner un groupe filtre toutes les vues sur ses equipes

## Gestion des absences

### Ajout individuel
Parametres > Absences > formulaire en bas :
1. Selectionnez un membre
2. Dates de debut/fin
3. Type (conge, maladie, formation, autre)
4. Nombre de jours

### Import CSV
Collez dans la zone de texte avec le format :
```
Nom;Equipe;Debut;Fin;Type;Jours
Alice Martin;Alpha;2026-04-14;2026-04-18;conge;5
Bob Dupont;Beta;2026-04-15;2026-04-15;maladie;1
Claire Moreau;Gamma;2026-04-21;2026-04-25;formation;5
```

Le separateur peut etre `;` ou une tabulation. Cliquez "Importer le CSV".

## Rotation support

### Ajouter une rotation
Parametres > Rotation Support :
1. Selectionnez l'equipe → les membres s'affichent en checkboxes
2. Definissez la semaine (label, dates)
3. Cochez les membres au support
4. Cliquez "Ajouter"

### Import via API
Pour importer une grille complete :
```bash
curl -X POST http://localhost:3000/api/support/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "team": "Alpha",
    "rotations": [
      {"weekLabel": "S15", "weekStart": "2026-04-06", "weekEnd": "2026-04-10", "members": ["Alice", "Bob"]},
      {"weekLabel": "S16", "weekStart": "2026-04-13", "weekEnd": "2026-04-17", "members": ["Claire", "Bob"]}
    ]
  }'
```

## Sprint en cours

Parametres > Sprint : definissez nom, dates, objectif. Visible dans Dashboard et Sprint board.

## Plugin JIRA (optionnel)

```bash
cp .env.example .env
```

```env
JIRA_URL=https://votre-domaine.atlassian.net
JIRA_USER=votre.email@entreprise.com
JIRA_TOKEN=votre-token-api
JIRA_PROJECT=CODE_PROJET
```

Redemarrez → cliquez **JIRA** dans la topbar.

## Deploiement Docker

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 3000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
```

```bash
docker build -t squad-board .
docker run -p 3000:3000 -v ./data:/app/data squad-board
```
