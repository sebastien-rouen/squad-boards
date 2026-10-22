"""Cache de la réponse de démarrage `/api/all` (≈ 17 Mo de JSON).

Sans lui, CHAQUE actualisation d'une page reconstruisait tout (≈ 1 s : lecture ORM des
tickets + encodage), puis renvoyait les 17 Mo en clair. Désormais :
- le corps est encodé UNE fois par état de la base, compressé en gzip une fois aussi ;
- un ETag l'identifie : le navigateur revalide (`no-cache`) et reçoit un 304 vide tant
  que rien n'a changé — aucun accès à la base dans ce cas.

Invalidation = « état de la base » : compteur incrémenté à CHAQUE commit passé par le
moteur SQLAlchemy (toutes les routes d'écriture) + date de modification du fichier SQLite
(écritures hors application, autre processus). ⚠️ Le contenu de `/api/all` ne doit dépendre
QUE de la base (aucune date du jour) : sinon il faudrait l'ajouter à `_state()`.
"""
import gzip
import hashlib
import json
import threading

from sqlalchemy import event

from app.config import DB_PATH
from app.db import engine

_commits = 0
_lock = threading.Lock()
_cached: dict | None = None  # {"state", "etag", "raw", "gz"}


@event.listens_for(engine, "commit")
def _on_commit(_conn):
    global _commits
    _commits += 1


def _state() -> tuple:
    """Empreinte de l'état de la base (compteur de commits + mtime des fichiers SQLite)."""
    marks = []
    for suffix in ("", "-wal"):
        p = DB_PATH.with_name(DB_PATH.name + suffix)
        try:
            marks.append(p.stat().st_mtime_ns)
        except OSError:
            marks.append(0)
    return (_commits, *marks)


def _encode(payload: dict) -> bytes:
    # Mêmes options que `JSONResponse.render` de Starlette : octets identiques à l'ancienne
    # réponse, sans le passage par `jsonable_encoder` (0,7 s sur 17 Mo, inutile ici : les
    # serializers ne rendent que des types JSON natifs).
    return json.dumps(payload, ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":")).encode("utf-8")


def current_etag() -> str | None:
    """ETag du corps en cache s'il correspond encore à l'état de la base, sinon None."""
    c = _cached
    return c["etag"] if c and c["state"] == _state() else None


def get_body(build) -> dict:
    """Corps en cache (construit par `build()` si la base a changé depuis)."""
    global _cached
    with _lock:
        state = _state()
        if _cached and _cached["state"] == state:
            return _cached
        raw = _encode(build())
        _cached = {
            "state": state,
            "etag": '"' + hashlib.blake2b(raw, digest_size=12).hexdigest() + '"',
            "raw": raw,
            # Niveau 5 : 17 Mo → ≈ 2,8 Mo en ≈ 0,2 s, fait une seule fois par état
            "gz": gzip.compress(raw, compresslevel=5),
        }
        return _cached
