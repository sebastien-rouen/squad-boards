"""Fichiers statiques : page d'accueil versionnée + assets en cache longue durée.

Avant : ~150 fichiers JS / CSS servis en `no-cache` → à CHAQUE actualisation, autant de
requêtes de revalidation (304), en cascade le long du graphe d'imports ES modules.

Maintenant : `index.html` est servi réécrit, ses liens `/js/…` et `/css/…` deviennent
`/v/<version>/js/…` ; les imports RELATIFS des modules héritent du préfixe, donc tout le
graphe passe sous la même version. Ces URL sont `immutable` (un an) : une actualisation ne
refait AUCUNE requête pour elles. La version = empreinte (mtime + nombre) des fichiers de
`js/` et `css/` : modifier un fichier change la version au prochain chargement de la page,
le front reste donc servi frais sans redémarrage (même garantie que l'ancien `no-cache`).

⚠️ Un module ne doit jamais être importé par chemin ABSOLU (`import('/js/x.js')`) : il
serait chargé une seconde fois hors version, avec un état séparé.
"""
import hashlib
import os
import re
import time

from fastapi import Request
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import STATIC_DIR

_VERSIONED_DIRS = ("js", "css")
_LINK_RE = re.compile(r'(\s(?:href|src))="/(js|css)/')
_index_cache: dict = {}
_ver_memo = {"at": 0.0, "ver": ""}


def asset_version() -> str:
    """Empreinte courte des fichiers JS / CSS (≈ 300 `stat`). Mémorisée 1 s : un chargement
    de page demande ~150 assets, inutile de reparcourir l'arborescence pour chacun."""
    now = time.monotonic()
    if now - _ver_memo["at"] < 1.0:
        return _ver_memo["ver"]
    h = hashlib.blake2b(digest_size=6)
    for d in _VERSIONED_DIRS:
        for root, dirs, files in os.walk(STATIC_DIR / d):
            dirs.sort()
            for name in sorted(files):
                st = os.stat(os.path.join(root, name))
                h.update(f"{root}/{name}:{st.st_mtime_ns}:{st.st_size};".encode())
    _ver_memo.update(at=now, ver=h.hexdigest())
    return _ver_memo["ver"]


def index_response(_request: Request) -> Response:
    """`index.html` avec ses liens JS / CSS préfixés par la version courante."""
    ver = asset_version()
    path = STATIC_DIR / "index.html"
    key = (ver, path.stat().st_mtime_ns)
    html = _index_cache.get(key)
    if html is None:
        html = _LINK_RE.sub(rf'\1="/v/{ver}/\2/', path.read_text(encoding="utf-8"))
        _index_cache.clear()
        _index_cache[key] = html
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


class NoCacheStaticFiles(StaticFiles):
    """Assets hors version (images, polices, pages de test, mockups) : revalidés à chaque
    fois (`no-cache`), un 304 via ETag / Last-Modified tant que le fichier ne change pas."""
    def file_response(self, *args, **kwargs) -> Response:
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


class VersionedStaticFiles(StaticFiles):
    """Assets servis sous `/v/<version>/` : immuables tant que la version est la courante.
    Une version périmée (onglet ouvert avant une modif) est servie en `no-cache` : le
    contenu actuel ne doit pas se figer sous une ancienne clé."""
    async def get_response(self, path: str, scope) -> Response:
        resp = await super().get_response(path, scope)
        if resp.status_code == 200:
            current = scope.get("path_params", {}).get("ver") == asset_version()
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable" if current else "no-cache"
        return resp
