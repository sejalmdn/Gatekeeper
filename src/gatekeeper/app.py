"""FastAPI application wiring for the Gatekeeper control plane."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from gatekeeper.api.candidates import router as candidates_router
from gatekeeper.api.configs import router as configs_router
from gatekeeper.api.dataset_releases import router as dataset_releases_router
from gatekeeper.api.evaluations import router as evaluations_router
from gatekeeper.api.projects import router as projects_router
from gatekeeper.persistence.database import Database


# Application factory.
def create_app(database_path: str | Path = "gatekeeper.db") -> FastAPI:
    app = FastAPI(title="Gatekeeper")
    app.state.database = Database(database_path)
    app.include_router(projects_router)
    app.include_router(candidates_router)
    app.include_router(dataset_releases_router)
    app.include_router(configs_router)
    app.include_router(evaluations_router)
    return app


# Default ASGI application.
app = create_app()
