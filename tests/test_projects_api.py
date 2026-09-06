"""Project endpoint tests."""

from __future__ import annotations

from tests.conftest import ApiClient, create_project


# Validate project creation, listing, retrieval, and prohibited mutations.
def test_project_endpoints_and_prohibited_mutations(client: ApiClient) -> None:
    assert client.post("/v1/projects", json={"name": "", "unexpected": True}).status_code == 422
    project = create_project(client)
    project_id = project["id"]
    assert client.get("/v1/projects").json() == [project]
    assert client.get(f"/v1/projects/{project_id}").json() == project
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)(f"/v1/projects/{project_id}").status_code == 405
