"""Dataset release endpoint tests."""

from __future__ import annotations

from pathlib import Path

from gatekeeper.app import create_app
from gatekeeper.utils.json import digest
from tests.conftest import ApiClient, create_project


# Validate dataset release creation, conflicts, scoping, and persistence.
def test_dataset_release_endpoints_are_scoped_and_persist(tmp_path: Path) -> None:
    database_path = tmp_path / "gatekeeper.db"
    client = ApiClient(create_app(database_path))
    project = create_project(client)
    project_id = project["id"]
    payload = {
        "dataset_name": "smoke",
        "version": "v1",
        "scenarios": [
            {"scenario_id": "first", "input": {"prompt": "hello"}},
            {"scenario_id": "second", "input": {}},
        ],
    }
    release = client.post(f"/v1/projects/{project_id}/dataset-releases", json=payload)
    assert release.status_code == 201
    assert release.json()["content_digest"] == digest(payload["scenarios"])
    assert (
        client.post(f"/v1/projects/{project_id}/dataset-releases", json=payload).status_code == 409
    )
    assert client.get(f"/v1/projects/{project_id}/dataset-releases").json() == [release.json()]

    other_project = create_project(client, "Other")
    assert (
        client.get(
            f"/v1/projects/{other_project['id']}/dataset-releases/{release.json()['id']}"
        ).status_code
        == 404
    )
    assert (
        ApiClient(create_app(database_path))
        .get(f"/v1/projects/{project_id}/dataset-releases/{release.json()['id']}")
        .json()
        == release.json()
    )


# Validate invalid dataset release payload handling.
def test_dataset_release_endpoint_rejects_invalid_payload(client: ApiClient) -> None:
    project_id = create_project(client)["id"]
    assert (
        client.post(
            f"/v1/projects/{project_id}/dataset-releases",
            json={"dataset_name": "d", "version": "1", "scenarios": []},
        ).status_code
        == 422
    )
