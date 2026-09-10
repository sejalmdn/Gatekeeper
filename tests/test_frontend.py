"""Frontend asset-serving tests."""

from pathlib import Path

from gatekeeper.app import create_app
from tests.conftest import ApiClient, create_project


# Serve the frontend without shadowing API routes.
def test_frontend_fallback_preserves_api_routes(tmp_path: Path) -> None:
    frontend_directory = tmp_path / "frontend"
    frontend_directory.mkdir()
    (frontend_directory / "index.html").write_text("<main>Gatekeeper</main>")
    client = ApiClient(create_app(tmp_path / "gatekeeper.db", frontend_directory))

    project = create_project(client)

    assert client.get("/").text == "<main>Gatekeeper</main>"
    assert client.get("/projects/example").text == "<main>Gatekeeper</main>"
    assert client.get(f"/v1/projects/{project['id']}").status_code == 200
