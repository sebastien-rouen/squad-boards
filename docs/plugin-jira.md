# Plugin JIRA (import optionnel) — `sync.js` + proxy `/jira/*`

> JIRA est un **plugin d'import optionnel** : l'app est autoporteuse sans lui.
> Le frontend appelle JIRA via le proxy backend `/jira/{path}` ([app/routers/jira.py](../app/routers/jira.py)).
> Détail de la sync côté front dans [sync.js](../static/js/sync.js).

## 5 passes d'import paginées via le helper `_paginateJql`
1. **Per-board active sprint** (`/rest/agile/1.0/sprint/{id}/issue`) — tickets du sprint actif de chaque board scrum
2. **Future sprints** (`sprint in futureSprints() AND issuetype NOT IN (Feature, Fonctionnalite, Epic)`) — tickets PI suivant
3. **Features JQL** (`issuetype IN (Feature, "Fonctionnalite") ORDER BY rank ASC`) — features avec leur rang JIRA
4. **Epics JQL** (`issuetype=Epic ORDER BY rank ASC`)
5. **PI-named-sprint** (`Sprint in ("PI28","PI#28",...,"PI31","PI#31") ORDER BY Rank ASC`) — récupère les projets qui planifient via des sprints nommés directement `"PI30"` (cas GCOM). Tourne après features/epics JQL pour ne pas écraser le rank standard.
6. **Amélioration continue** (labels Retro, Postmortem, CoP, Adapt...) — tickets transverses

## Pagination robuste (`_paginateJql`)
JIRA Cloud `/rest/api/3/search/jql` utilise `nextPageToken` (préféré) avec fallback `startAt`. `total` est non fiable (souvent capé à `maxResults`). Le helper sort sur : page vide, page entièrement dédoublonnée (`seenKeys`), `isLast === true`, page courte, ou hard cap 100 itérations.

## Détection des champs custom
Au démarrage : `/rest/api/3/field` est fetché pour résoudre Sprint et Team[Team] vers leur `customfield_XXXXX` via `clauseNames`. Le user peut entrer le nom JQL (`"Sprint"`, `"Team[Team]"`) ou l'ID dans Paramètres — la résolution est automatique.

## Normalisation des équipes
JIRA Team[Team] renvoie `{id: UUID, name: "GCOM - Fuego"}`. Les boards locaux sont nommés sans préfixe (`"Fuego"`). Le helper `_normalizeTeamName` matche les noms longs avec les courts via regex `(^|[\s\-_\/\]\)])${team}\s*$` (sorting par longueur descendante pour éviter les collisions partielles). Aucun préfixe à configurer manuellement.

## Extraction du PI (`piSprint`)
Chaîne de fallback dans `transformIssue` : nom du sprint (regex `\d+\.\d+` ou `PI\s*#?\s*\d+`) → champ PI custom → `fixVersions` → `labels` (pattern `PI30`, `PI#30`).

## Héritage de features dans la vue PI suivant (`roadmap.js`)
4 sources combinées dans `nextPiFeatureData` :
1. Features explicites en PI suivant
2. Tickets typés feature en PI suivant
3. **Features héritées** : children tickets en PI suivant via chaîne `ticket.epic → epic.feature → feature.id` (badge orange `héritée`)
4. **Epics proxy** : epics avec children PI suivant mais sans feature parente (badge violet `epic`) — utile pour les projets qui planifient au niveau epic

## Settings disponibles (localStorage)
- `sb-sync-maxFeatures` — cap par JQL (vide = illimité, hard cap interne 10 000)
- `sb-sync-maxBoards` — cap total boards scannés (vide = illimité)
- `sb-sync-sprintField` — nom JQL ou customfield (auto-détecté si vide)
- `sb-sync-teamField` — idem
- `sb-sync-closedKeep` — nb de sprints clos conservés par board pour l'historique vélocité (défaut 20)
- `sb-sync-closedTicketSprints` — nb de sprints clos récents (par board) dont on **importe les tickets** en local, pour l'historique vélocité/buffer de la vue Health (défaut 6 ≈ 1 PI ; `0` = désactivé). Sans ça, les tickets des sprints clos ne sont pas synchronisés (seuls sprint actif + futurs + features/epics le sont) → la modale Health devait les lazy-fetch depuis JIRA.

## Pages de debug dans `/tests/`

### `/tests/jira-explorer.html`
Outil standalone (zéro dépendance sur le bundle principal) :
- **Inspection** : compare une issue JIRA brute vs base locale (champs, chaîne hiérarchique, PI détecté avec source)
- **Snapshot** : counts/distributions par projet/PI/équipe/type ; détection des orphelins
- **JQL** : exécution directe ; bannière de comparaison local/JIRA avec bouton **Synchro** qui upsert dans la base via `/api/import mode=merge`
- **Hash routing** : `#tab=jql&jql=...`, `#tab=inspect&key=GCOM-1234&chain=1` — back/forward navigateur supporté
- **Presets chips** : Fuego·PI#30, Features GCOM, Epics sans parent, etc.

### `/tests/pi-weeks-debug.html`
Calculatrice des semaines de rotation PI (même logique que Paramètres → Rotation Support).
Utile pour diagnostiquer les décalages de dates entre vues.

**Utilisation UI** : ouvrir dans le navigateur, renseigner PI number + date de début + config.

**Utilisation curl / JSON** — ajouter `?fmt=json` aux paramètres :
```bash
# Retourne le JSON brut des semaines pour tous les offsets (-2..+2)
curl "http://localhost:3000/tests/pi-weeks-debug.html?pi=29&start=2025-06-19&sprints=6&dur=14&mode=friday&fmt=json"

# Formater avec python
curl "...&fmt=json" | python -m json.tool

# Paramètres disponibles :
#   pi      — numéro du PI courant (ex: 29)
#   start   — date de début du PI courant (YYYY-MM-DD)
#   sprints — nombre de sprints par PI (défaut: 5)
#   dur     — durée d'un sprint en jours (défaut: 14)
#   mode    — jour de début semaine : friday | wednesday | monday (défaut: friday)
#   fmt     — json pour retour brut sans HTML
```
La page se pré-remplit automatiquement depuis `localStorage.pi-cfg-*` si des configs PI sont sauvegardées.
Le JSON retourné contient `{ "-2": {...}, "-1": {...}, "0": {...}, "1": {...}, "2": {...} }` avec `piNum` et `weeks[]` par offset.

### `/tests/cap-debug.html`
Debug de la capacité PI par équipe.
