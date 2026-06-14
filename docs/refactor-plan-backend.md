# Plan de refactor backend — `main.py` → package `app/`

> **But** : éclater le monofichier `main.py` (2591 lignes) en un package `app/` par
> domaine, avec une factory CRUD générique. Objectif : maintenabilité.
> **Contrainte absolue** : zéro changement fonctionnel, contrat API (camelCase) figé.

## Lancement (inchangé après refactor)

`main.py` **reste le point d'entrée** (mince, ~40 l.). On lance toujours :

```bash
pip install -r requirements.txt
python main.py            # identique à aujourd'hui
# ou : uvicorn main:app --reload
```

PM2 / `ecosystem.config.cjs` **inchangé** (`script: 'main.py'`, `interpreter: 'python3'`).
Hot reload uvicorn suit toute l'arbo `app/`. **Zéro changement opérationnel.**

## Principe directeur

- Chaque commit est **indépendamment livrable et `git revert`-able**.
- Ordre par **risque croissant** : on déplace d'abord (zéro logique), on factorise ensuite.
- Le contrat camelCase est figé : après **chaque** étape, `/api/export` et `/api/all`
  doivent renvoyer un payload identique au snapshot de référence (golden test).

## Arborescence cible

```
squad-board/
├── main.py                  # ~40 l. : app factory, include_router, mount static, __main__
├── app/
│   ├── common.py            # _gen_id, _now, _normalize_team, _TA
│   ├── config.py            # env JIRA_*, DATA_DIR, STATIC_DIR, DB_PATH, load_dotenv()
│   ├── db.py                # engine, create_all, get_session
│   ├── migrations.py        # _run_migrations + _seed_atlas_catalog
│   ├── serializers.py       # tous les _xxx_dict (source unique du contrat camelCase)
│   ├── crud.py              # factory make_crud_router(model, serializer, field_map, ...)
│   ├── models/
│   │   ├── __init__.py      # ré-exporte tout (from .core import * ...)
│   │   ├── core.py          # Team, Member, Ticket, Feature, Epic
│   │   ├── planning.py      # SprintConfig, PIConfig, TeamGroup
│   │   ├── people.py        # Absence, SupportRotation
│   │   ├── agile.py         # Event, MoodVote, RetroItem, Risk
│   │   ├── atlas.py         # Skill, Appetence, Member{Skill,Appetence,Mobility}
│   │   └── calendar.py      # TeamCalendar
│   ├── routers/
│   │   ├── tickets.py  features.py  epics.py  members.py  teams.py
│   │   ├── groups.py   absences.py  support.py  planning.py  agile.py
│   │   ├── atlas.py    calendars.py  data.py (export/all/import/config)  jira.py
│   └── services/
│       └── ics.py           # _parse_ics_events + expand_calendar_events + helpers DST
```

---

## Étape 0 — Filet de sécurité (avant toute modif)

```bash
python main.py &                      # sur une base de démo représentative
curl -s localhost:3000/api/export | python -m json.tool > /tmp/export.before.json
curl -s localhost:3000/api/all    | python -m json.tool > /tmp/all.before.json
```

Golden tests. Après chaque commit : re-curl + `diff`. **Zéro diff = OK.**
Vérifier `git status` propre au départ.

- [ ] Snapshots capturés

---

## Étape 1 — Infrastructure (déplacement pur, 1 commit)

| Nouveau fichier | Contenu | Lignes source |
|---|---|---|
| `app/common.py` | `_gen_id`, `_now`, `_normalize_team`, `_TA` | 41-61 |
| `app/config.py` | `DATA_DIR`, `STATIC_DIR`, `DB_PATH`, `JIRA_*`, `load_dotenv()` | 26-37 |
| `app/db.py` | `engine`, `create_all`, `get_session` | 381-386, 471-473 |
| `app/migrations.py` | `_run_migrations`, `_seed_atlas_catalog` | 389-468 |
| `app/services/ics.py` | `_dt_to_utc`, `_parse_ics_events` | 479-626 |

**Piège** : `_gen_id`/`_now` sont des `default_factory` des modèles → doivent vivre
dans `common.py` (importé par les modèles, sans cycle).

- [ ] Fait + diff golden OK

---

## Étape 2 — Modèles (déplacement pur, 1 commit)

`app/models/__init__.py` ré-exporte tout pour ne casser aucun import.

| Fichier | Modèles | Lignes |
|---|---|---|
| `models/core.py` | Team, Member, Ticket, Feature, Epic | 64-153 |
| `models/planning.py` | SprintConfig, PIConfig, TeamGroup | 155-203 |
| `models/people.py` | Absence, SupportRotation | 205-233 |
| `models/agile.py` | Event, MoodVote, RetroItem, Risk | 236-291 |
| `models/atlas.py` | Skill, Appetence, MemberSkill, MemberAppetence, MemberMobility | 295-361 |
| `models/calendar.py` | TeamCalendar | 364-375 |

**Piège `extend_existing`** : garder `__table_args__ = _TA` ; l'import unique via
`__init__` évite la double-déclaration.

- [ ] Fait + diff golden OK

---

## Étape 3 — Sérialiseurs (déplacement pur, 1 commit)

`app/serializers.py` ← les 25 `_xxx_dict` (632-808, 2433-2438).
**Source unique du contrat camelCase**, contenu inchangé (sinon golden casse).

- [ ] Fait + diff golden OK

---

## Étape 4 — Factory CRUD + routeurs « purs » (1 commit / ressource)

`app/crud.py` :

```python
def make_crud_router(*, model, serializer, prefix, tag,
                     field_map=None, list_filters=None, order_by=None):
    """Génère list / get / update / delete (100% mécaniques).
       create reste à la main par routeur (validation + défauts spécifiques)."""
```

| Commit | Routeur | Endpoints | Spécial à garder |
|---|---|---|---|
| 4a | `teams.py` | CRUD | — |
| 4b | `groups.py` | CRUD | — |
| 4c | `epics.py` | CRUD | field_map feature/piSprint |
| 4d | `members.py` | CRUD + bulk | `bulk_merge_members` à la main |
| 4e | `absences.py` | CRUD + bulk + repair | `repair-encoding`, dédup bulk |
| 4f | `support.py` | CRUD + bulk | clear-by-team dans bulk |
| 4g | `agile.py` | events + retro + risks + mood | mood : clamp value 1-5 |

- [ ] 4a teams  - [ ] 4b groups  - [ ] 4c epics  - [ ] 4d members
- [ ] 4e absences  - [ ] 4f support  - [ ] 4g agile

---

## Étape 5 — Routeurs à logique propre (1 commit chacun)

| Commit | Routeur | À préserver |
|---|---|---|
| 5a | `tickets.py` | CRUD + tracking `recent_changes` au changement de statut (882-914) + sous-ressource comments |
| 5b | `features.py` | CRUD + `bulk_rank_features` (1019) + préservation rank/points |
| 5c | `planning.py` | sprint + PI (snapshot auto `pi_objectives`, `/members/{n}`, `/objectives/{n}`) — **historisation sensible, ne pas simplifier** |
| 5d | `atlas.py` | skills/appetences CRUD + upsert par clé logique (level=0 supprime) + cascade delete |
| 5e | `calendars.py` | CRUD + `refresh` (httpx+ics) + `events` |
| 5f | `jira.py` | proxy (allow-list chemins, passthrough 204) |

**Anti-duplication ICS** : extraire la boucle « events_json → liste enrichie »
(dupliquée en 2090-2100 ET 2510-2527) dans `services/ics.py:expand_calendar_events(cals, team=None)`,
appelée par `/api/all` et `/api/calendars/events`.

- [ ] 5a tickets  - [ ] 5b features  - [ ] 5c planning
- [ ] 5d atlas  - [ ] 5e calendars  - [ ] 5f jira

---

## Étape 6 — `data.py` : export / all / import (1 commit)

- `export_all` + `get_all_data` : table de registres `{clé_json: (Model, serializer)}`
  itérée → supprime la triple duplication de sérialisation.
- `import_all` (2122-2426, ~300 l.) : config table-driven

  ```python
  IMPORT_SPECS = [ImportSpec("teams", Team, merge_by="name", on_merge=...), ...]
  ```

  **Attention** : teams (dédup par nom), features (préserve rank/points),
  pi/sprint (singletons, pas des listes) → **garder des hooks par entité**, ne pas tout aplatir.

- [ ] Fait + diff golden OK

---

## Étape 7 — Finalisation (1 commit)

- `main.py` réduit à ~40 l. : `lifespan`, `FastAPI(...)`, `include_router(...)` × N,
  `mount("/", StaticFiles…)`, `__main__` (uvicorn.run inchangé).
- **Docs** : `CLAUDE.md` (« fichier unique » → « package `app/`, routeurs par domaine »),
  `docs/architecture.md` (ajouter l'arbo backend), `CHANGELOG.md` (refactor sans changement fonctionnel).

- [ ] Fait + diff golden OK + docs à jour

---

## Récap risques

| Risque | Parade |
|---|---|
| Casse du contrat camelCase | Golden test `export`/`all` après **chaque** commit |
| Double déclaration de table (`extend_existing`) | Import unique via `models/__init__` |
| Cycle d'import modèles ↔ helpers | `_gen_id`/`_now` isolés dans `common.py` |
| Régression historisation PI / import | Étapes 5c & 6 traitées seules, hooks par entité |
| Hot reload uvicorn / PM2 | Inchangé (`reload=True` suit l'arbre de fichiers) |

**Effort** : ~14 commits, ≈ -45 % de lignes back, zéro changement fonctionnel.
