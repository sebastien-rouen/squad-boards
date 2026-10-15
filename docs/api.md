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

| Methode | Route | Description |
|---------|-------|-------------|
| `GET/PUT` | `/api/sprint` | `syncedBy` / `syncKind` (3.197.0) : posés par la synchro seulement |
| `GET/PUT` | `/api/pi` | `personAliases`, `pokerReferences` (3.217.0) en plus |
| `PUT` | `/api/pi/person-alias` | `{ jira, rh }` — correspondance nom JIRA → nom RH (Congés), fusion clé par clé ; `rh: ""` = pas dans l'import, `null` = supprimer (3.217.0) |
| `PUT` | `/api/pi/poker-reference` | `{ team, points, ticketId }` — ticket de référence du Poker épinglé par équipe et taille ; `ticketId: null` = choix automatique (3.217.0) |
| `GET` | `/api/sync-stamp` | Horodatage de la dernière synchro (mode TV) |

## Planning Poker

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/poker/{ticket}` | Votes en cours du ticket (éphémères, hors `/api/all` et `/api/export`) |
| `POST` | `/api/poker/{ticket}/vote` | `{ voter, value }` — upsert d'un vote (`1`…`21` ou `?`) |
| `POST` | `/api/poker/{ticket}/reveal` | Révèle les votes |
| `POST` | `/api/poker/{ticket}/reset` | Efface les votes du ticket |
| `DELETE` | `/api/poker/{ticket}/voter/{voter}` | Retire un participant |
| `GET` | `/api/poker/{ticket}/rounds` | Tours CONCLUS du ticket, du plus récent au plus ancien (3.217.0) |
| `POST` | `/api/poker/{ticket}/rounds` | `{ value, votes, author, team }` — archive un tour conclu ; moyenne et écart recalculés côté serveur (3.217.0) |
| `GET` | `/api/poker-rounds?team=&since=` | Tours conclus d'une équipe depuis une date ISO — page 🃏 Affinage (3.217.0) |
| `GET` | `/api/poker-sessions` | Sessions de vote en cours `{ ticketId: { votes, revealed } }` (3.217.0) |

> Les tours conclus (`pokerRounds`) sont DURABLES : inclus dans `/api/export` et sa restauration.

## Import / Export

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/export` | Export complet (toutes les tables) |
| `POST` | `/api/import` | Import (`mode: "replace"` ou `"merge"`). `?dry_run=1` : import complet puis annulation, rien n'écrit — renvoie `counts`, `current` (lignes en base) et `dryRun: true`. Échec → 400 « Import refusé, base inchangée — … » |
| `GET` | `/api/config/export` | Bundle de configuration curée `{_meta, db}` — sans tickets / features / epics / sprints, avec règles d'agenda et historique Atlas (3.198.0) |
| `POST` | `/api/config/import` | Restaure un bundle (`mode: "merge"` par défaut, rien n'est effacé) — domaines : `CONFIG_DOMAINS` (app/routers/config_bundle.py) |

> `/api/export` = snapshot complet ; `/api/config/*` = configuration curée, réimportable après un reset
> (Paramètres → Données → 💾). Le bloc `local` du fichier (préférences du navigateur) ne passe jamais
> par le serveur.

## Atlas — historique des niveaux

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/skill-history?scope=member&key=<nom>` | Changements de niveau (du plus ancien au plus récent), écrits par `PUT /api/member-skills` (3.198.0) |

## Config / JIRA

| Methode | Route |
|---------|-------|
| `GET` | `/api/config` |
| `GET/POST/PUT` | `/jira/{path}` |
