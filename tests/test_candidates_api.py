"""Candidate endpoint tests."""

from __future__ import annotations

from pathlib import Path

from gatekeeper.app import create_app
from gatekeeper.utils.json import digest
from tests.conftest import ApiClient, create_project


# Validate candidate creation, conflicts, scoping, and persistence.
def test_candidate_endpoints_are_scoped_and_persist(tmp_path: Path) -> None:
    database_path = tmp_path / "gatekeeper.db"
    client = ApiClient(create_app(database_path))
    project = create_project(client)
    project_id = project["id"]
    payload = {"application_version": "1.2.3", "runtime_configuration": {"model": "gpt"}}
    candidate = client.post(f"/v1/projects/{project_id}/candidates", json=payload)
    assert candidate.status_code == 201
    assert candidate.json()["runtime_configuration_digest"] == digest(
        payload["runtime_configuration"]
    )
    assert client.post(f"/v1/projects/{project_id}/candidates", json=payload).status_code == 409
    assert client.get(f"/v1/projects/{project_id}/candidates").json() == [candidate.json()]

    other_project = create_project(client, "Other")
    assert (
        client.get(
            f"/v1/projects/{other_project['id']}/candidates/{candidate.json()['id']}"
        ).status_code
        == 404
    )
    assert (
        client.get("/v1/projects/00000000-0000-4000-8000-000000000000/candidates").status_code
        == 404
    )
    assert (
        ApiClient(create_app(database_path))
        .get(f"/v1/projects/{project_id}/candidates/{candidate.json()['id']}")
        .json()
        == candidate.json()
    )


# Validate invalid candidate payload handling.
def test_candidate_endpoint_rejects_invalid_payload(client: ApiClient) -> None:
    project_id = create_project(client)["id"]
    assert (
        client.post(
            f"/v1/projects/{project_id}/candidates",
            json={"application_version": "1", "runtime_configuration": []},
        ).status_code
        == 422
    )
