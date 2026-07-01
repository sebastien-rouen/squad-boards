"""Squad Board — point d'entrée FastAPI.

Composition uniquement : bootstrap DB, cycle de vie du client HTTP, et montage des
routeurs par domaine (app/routers/*). La logique vit dans le package `app/`.
Lancement : `python main.py` (ou `uvicorn main:app --reload`).
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response
from sqlmodel import SQLModel

import app.models  # noqa: F401 — enregistre toutes les tables sur SQLModel.metadata
from app import http_client
from app.config import STATIC_DIR
from app.db import engine
from app.migrations import run_migrations
from app.seed import seed_atlas_catalog, seed_workshop_templates
from app.routers import (
    teams, groups, epics, members, absences, support, agile,
    tickets, features, planning, atlas, calendars, jira, data, poker,
    team_identity, workshop_templates, team_workshops, attachments, slack,
)

# ══════════════════════════════════════════════════════════════════════════════
# Bootstrap base de données (modèles enregistrés ci-dessus → create_all les voit)
# ══════════════════════════════════════════════════════════════════════════════
SQLModel.metadata.create_all(engine)
run_migrations(engine)
seed_atlas_catalog(engine)
seed_workshop_templates(engine)


# ══════════════════════════════════════════════════════════════════════════════
# App
# ══════════════════════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    await http_client.startup()
    yield
    await http_client.shutdown()


app = FastAPI(title="Squad Board", version="3.0.0", lifespan=lifespan)

# Routeurs par domaine (agile expose 4 sous-routeurs).
for _r in (
    teams.router, groups.router, epics.router, members.router,
    absences.router, support.router,
    agile.router_events, agile.router_retro, agile.router_risks, agile.router_mood,
    tickets.router, features.router, planning.router, atlas.router,
    calendars.router, jira.router, data.router, poker.router_poker,
    team_identity.router, workshop_templates.router, team_workshops.router,
    attachments.router, slack.router,
):
    app.include_router(_r)


# ── Static Files ──────────────────────────────────────────────────────────────
class NoCacheStaticFiles(StaticFiles):
    """Sert les assets avec `Cache-Control: no-cache` afin que le navigateur
    revalide systématiquement (les imports ES modules n'ont pas de cache-busting
    `?v=` ; sans ça le front sert un module obsolète après une modif). Léger : la
    revalidation reste un 304 via ETag/Last-Modified tant que le fichier ne change pas.
    """
    def file_response(self, *args, **kwargs) -> Response:
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


app.mount("/", NoCacheStaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
