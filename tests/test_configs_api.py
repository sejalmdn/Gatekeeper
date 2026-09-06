"""Administrator configuration endpoint tests."""

from __future__ import annotations

from gatekeeper.utils.json import digest
from tests.conftest import ApiClient, create_project


# Build a valid configuration payload.
def config_payload(name: str = "standard", version: str = "v1") -> dict[str, object]:
    return {
        "name": name,
        "version": version,
        "settings": {"checks": ["outcome"]},
        "thresholds": {"pass": 0.8},
        "weights": {"critical": 10, "low": 1},
        "default_attempts": 3,
    }


# Validate immutable configuration publication and project scoping.
def test_config_endpoints_publish_immutable_versioned_releases(client: ApiClient) -> None:
    project = create_project(client)
    project_id = project["id"]
    payload = config_payload()
    created = client.post(f"/v1/projects/{project_id}/configs", json=payload)
    assert created.status_code == 201
    config = created.json()
    expected_digest = digest(
        {key: payload[key] for key in payload if key not in {"name", "version"}}
    )
    assert config["name"] == "standard"
    assert config["version"] == "v1"
    assert config["digest"] == expected_digest
    assert client.post(f"/v1/projects/{project_id}/configs", json=payload).status_code == 409
    newer = client.post(
        f"/v1/projects/{project_id}/configs", json=config_payload(version="v2")
    )
    assert newer.status_code == 201
    newer_config = newer.json()
    assert newer_config["id"] != config["id"]
    assert newer_config["version"] == "v2"
    assert newer_config["digest"] == config["digest"]
    assert client.get(f"/v1/projects/{project_id}/configs").json() == [config, newer_config]
    assert client.get(f"/v1/projects/{project_id}/configs/{config['id']}").json() == config
    assert (
        client.get(f"/v1/projects/{project_id}/configs/{newer_config['id']}").json()
        == newer_config
    )

    other_project = create_project(client, "Other")
    assert (
        client.get(f"/v1/projects/{other_project['id']}/configs/{config['id']}").status_code == 404
    )
    for method in ("put", "patch", "delete"):
        assert (
            getattr(client, method)(f"/v1/projects/{project_id}/configs/{config['id']}").status_code
            == 405
        )
