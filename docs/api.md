# Reference API

API REST complete. Toutes les entites sont accessibles en CRUD. Documentation interactive sur http://localhost:3000/docs

## Tickets

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/tickets` | Lister (`?team=`, `?status=`, `?epic=`) |
| `GET` | `/api/tickets/{id}` | Detail |
| `POST` | `/api/tickets` | Creer |
| `PUT` | `/api/tickets/{id}` | Modifier |
| `DELETE` | `/api/tickets/{id}` | Supprimer |

```json
{
    "title": "Mon ticket", "type": "story", "status": "todo",
    "team": "Alpha", "leader": "Alice", "contributors": ["Bob"],
    "points": 5, "priority": "medium", "epic": "EPIC-1",
    "labels": ["tech-debt"], "description": "...", "flagged": false
}
```

## Commentaires

| Methode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/tickets/{id}/comments` | Ajouter |
| `DELETE` | `/api/tickets/{id}/comments/{commentId}` | Supprimer |

## Features / Epics

Meme pattern CRUD que tickets : `/api/features`, `/api/epics`

## Membres

| Methode | Route |
|---------|-------|
| `GET/POST` | `/api/members` |
| `PUT/DELETE` | `/api/members/{id}` |

```json
{"name": "Alice", "team": "Alpha", "role": "Dev"}
```

## Equipes

| Methode | Route |
|---------|-------|
| `GET/POST` | `/api/teams` |
| `PUT/DELETE` | `/api/teams/{id}` |

```json
{"name": "Alpha", "color": "#3b82f6"}
```

## Groupes (lignes produit)

| Methode | Route |
|---------|-------|
| `GET/POST` | `/api/groups` |
| `PUT/DELETE` | `/api/groups/{id}` |

```json
{"name": "Portail", "color": "#6366f1", "teams": ["Alpha", "Beta"]}
```

## Absences

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/absences` | Lister (`?team=`, `?member=`) |
| `POST` | `/api/absences` | Creer une absence |
| `POST` | `/api/absences/bulk` | Import en masse |
| `PUT` | `/api/absences/{id}` | Modifier |
| `DELETE` | `/api/absences/{id}` | Supprimer |

```json
{
    "memberName": "Alice", "team": "Alpha",
    "startDate": "2026-04-14", "endDate": "2026-04-18",
    "type": "conge", "days": 5, "note": "Vacances"
}
```

**Import en masse :**
```json
{
    "absences": [{"memberName": "...", "startDate": "...", ...}],
    "replace": false
}
```

## Rotation Support

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/support` | Lister (`?team=`) |
| `POST` | `/api/support` | Creer |
| `POST` | `/api/support/bulk` | Import par equipe |
| `PUT` | `/api/support/{id}` | Modifier |
| `DELETE` | `/api/support/{id}` | Supprimer |

```json
{
    "team": "Alpha", "weekLabel": "S15",
    "weekStart": "2026-04-06", "weekEnd": "2026-04-10",
    "members": ["Alice", "Bob"]
}
```

## Sprint / PI

| Methode | Route |
|---------|-------|
| `GET/PUT` | `/api/sprint` |
| `GET/PUT` | `/api/pi` |

## Import / Export

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/export` | Export complet (toutes les tables) |
| `POST` | `/api/import` | Import (`mode: "replace"` ou `"merge"`) |

## Config / JIRA

| Methode | Route |
|---------|-------|
| `GET` | `/api/config` |
| `GET/POST/PUT` | `/jira/{path}` |
