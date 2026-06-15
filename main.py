"""Squad Board — point d'entrée FastAPI.

Composition uniquement : bootstrap DB, cycle de vie du client HTTP, et montage des
routeurs par domaine (app/routers/*). La logique vit dans le package `app/`.
Lancement : `python main.py` (ou `uvicorn main:app --reload`).
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel

import app.models  # noqa: F401 — enregistre toutes les tables sur SQLModel.metadata
from app import http_client
from app.config import STATIC_DIR
from app.db import engine
from app.migrations import run_migrations
from app.seed import seed_atlas_catalog
from app.routers import (
    teams, groups, epics, members, absences, support, agile,
    tickets, features, planning, atlas, calendars, jira, data,
)

# ══════════════════════════════════════════════════════════════════════════════
# Bootstrap base de données (modèles enregistrés ci-dessus → create_all les voit)
# ══════════════════════════════════════════════════════════════════════════════
SQLModel.metadata.create_all(engine)
run_migrations(engine)
seed_atlas_catalog(engine)


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
    calendars.router, jira.router, data.router,
):
    app.include_router(_r)


# ── Static Files ──────────────────────────────────────────────────────────────
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
