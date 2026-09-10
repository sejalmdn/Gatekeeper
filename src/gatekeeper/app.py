"""FastAPI application wiring for the Gatekeeper control plane."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from gatekeeper.api.candidates import router as candidates_router
from gatekeeper.api.configs import router as configs_router
from gatekeeper.api.dataset_releases import router as dataset_releases_router
from gatekeeper.api.evaluations import router as evaluations_router
from gatekeeper.api.projects import router as projects_router
from gatekeeper.persistence.database import Database

import uvicorn

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


app = FastAPI(title="Gatekeeper")
app.state.database = Database('gatekeeper.db')
app.include_router(projects_router)
app.include_router(candidates_router)
app.include_router(dataset_releases_router)
app.include_router(configs_router)
app.include_router(evaluations_router)
default_frontend_directory = Path(__file__).parent / "frontend_dist"
register_frontend(app, Path(default_frontend_directory))


# Development server entry point.
def main() -> None:
    """Start the Gatekeeper development server."""
    uvicorn.run(
        "gatekeeper.app:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
