"""FastAPI application wiring for the Gatekeeper control plane."""

from __future__ import annotations

from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from gatekeeper.api.candidates import router as candidates_router
from gatekeeper.api.datasets import router as datasets_router
from gatekeeper.api.evaluation_runs import router as evaluation_runs_router
from gatekeeper.api.projects import router as projects_router
from gatekeeper.api.providers import router as providers_router
from gatekeeper.api.rules import router as rules_router
from gatekeeper.api.run_settings import router as run_settings_router
from gatekeeper.api.scenarios import router as scenarios_router
from gatekeeper.execution.worker import execution_lifespan
from gatekeeper.persistence.database import Database


# Frontend asset registration.
def register_frontend(app: FastAPI, frontend_directory: Path) -> None:
    index_file = frontend_directory / "index.html"
    assets_directory = frontend_directory / "assets"
    if not index_file.is_file():
        return
    if assets_directory.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_directory), name="frontend-assets")

    # Single-page application fallback.
    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str) -> HTMLResponse:
        return HTMLResponse(index_file.read_text())


# Application factory.
def create_app(
    database_path: str | Path = "gatekeeper.db", frontend_directory: Path | None = None
) -> FastAPI:
    """Construct the API application and register its worker and frontend.

    Args:
        database_path: SQLite database path used by the application.
        frontend_directory: Optional built frontend directory to serve.

    Returns:
        The configured FastAPI application.
    """
    application = FastAPI(title="Gatekeeper", lifespan=execution_lifespan)
    application.state.database = Database(database_path)

    application.include_router(projects_router)
    application.include_router(providers_router)
    application.include_router(candidates_router)
    application.include_router(datasets_router)
    application.include_router(scenarios_router)
    application.include_router(rules_router)
    application.include_router(run_settings_router)
    application.include_router(evaluation_runs_router)
    assets = frontend_directory or Path(__file__).parent / "frontend_dist"

    register_frontend(application, assets)
    return application


# Module-level ASGI application.
app = create_app()


# Development server entry point.
def main() -> None:
    """Start the Gatekeeper development server."""
    uvicorn.run(
        "gatekeeper.app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
