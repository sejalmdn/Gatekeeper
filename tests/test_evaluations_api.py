"""Frozen evaluation endpoint tests."""

from __future__ import annotations

from tests.conftest import ApiClient, create_project


# Create all project-scoped evaluation inputs.
def create_sources(client: ApiClient, project_id: str) -> dict[str, object]:
    candidate = client.post(
        f"/v1/projects/{project_id}/candidates",
        json={"application_version": "1.0", "runtime_configuration": {"model": "x"}},
    )
    release = client.post(
        f"/v1/projects/{project_id}/dataset-releases",
        json={
            "dataset_name": "smoke",
            "version": "v1",
            "scenarios": [{"scenario_id": "one", "input": {}}],
        },
    )
    config = client.post(
        f"/v1/projects/{project_id}/configs",
        json={
            "name": "standard",
            "version": "v1",
            "settings": {"rules": "v1"},
            "thresholds": {"pass": 0.8},
            "weights": {"critical": 10},
            "default_attempts": 3,
        },
    )
    assert candidate.status_code == release.status_code == config.status_code == 201
    return {"candidate": candidate.json(), "release": release.json(), "config": config.json()}


# Validate source scoping and immutable evaluation snapshots.
def test_evaluation_endpoints_freeze_project_scoped_sources(client: ApiClient) -> None:
    project_id = create_project(client)["id"]
    sources = create_sources(client, project_id)
    payload = {
        "candidate_id": sources["candidate"]["id"],
        "dataset_release_id": sources["release"]["id"],
        "config_id": sources["config"]["id"],
    }
    created = client.post(f"/v1/projects/{project_id}/evaluations", json=payload)
    assert created.status_code == 201
    evaluation = created.json()
    assert evaluation["candidate_snapshot"] == sources["candidate"]
    assert evaluation["dataset_release_snapshot"] == sources["release"]
    assert evaluation["config_snapshot"] == sources["config"]
    assert evaluation["candidate_digest"] == sources["candidate"]["runtime_configuration_digest"]
    assert evaluation["dataset_release_digest"] == sources["release"]["content_digest"]
    assert evaluation["config_digest"] == sources["config"]["digest"]

    newer_config_payload = {
        "name": "standard",
        "version": "v2",
        "settings": {"rules": "v2"},
        "thresholds": {"pass": 0.9},
        "weights": {"critical": 5},
        "default_attempts": 4,
    }
    newer_config = client.post(f"/v1/projects/{project_id}/configs", json=newer_config_payload)
    assert newer_config.status_code == 201
    assert newer_config.json()["digest"] != sources["config"]["digest"]
    assert evaluation["config_snapshot"]["version"] == "v1"
    assert (
        client.get(f"/v1/projects/{project_id}/evaluations/{evaluation['id']}").json() == evaluation
    )
    assert client.get(f"/v1/projects/{project_id}/evaluations").json() == [evaluation]
    for method in ("put", "patch", "delete"):
        assert (
            getattr(client, method)(
                f"/v1/projects/{project_id}/evaluations/{evaluation['id']}"
            ).status_code
            == 405
        )

    other_project_id = create_project(client, "Other")["id"]
    assert (
        client.post(
            f"/v1/projects/{other_project_id}/evaluations",
            json={
                "candidate_id": sources["candidate"]["id"],
                "dataset_release_id": sources["release"]["id"],
                "config_id": sources["config"]["id"],
            },
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/v1/projects/{project_id}/evaluations",
            json={
                "candidate_id": "00000000-0000-4000-8000-000000000000",
                "dataset_release_id": sources["release"]["id"],
                "config_id": sources["config"]["id"],
            },
        ).status_code
        == 404
    )
