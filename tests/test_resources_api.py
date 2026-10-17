"""Phase 1 control-plane resource API tests."""

import sqlite3
from pathlib import Path

import pytest

from gatekeeper.app import create_app
from tests.conftest import ApiClient, create_project


# Create a reusable provider payload.
def create_provider(client: ApiClient, project_id: str) -> dict[str, object]:
    response = client.post(
        f"/v1/projects/{project_id}/providers",
        json={
            "name": "Primary",
            "provider_type": "openai",
            "credential_ref": "env://GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY",
        },
    )
    assert response.status_code == 201
    return response.json()


# Validate credential references without requiring their variables during creation.
def test_provider_creation_validates_credential_reference(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_id = str(create_project(client)["id"])
    variable_name = "GATEKEEPER_CREDENTIAL_NOT_CONFIGURED"
    monkeypatch.delenv(variable_name, raising=False)
    valid_reference = f"env://{variable_name}"
    accepted = client.post(
        f"/v1/projects/{project_id}/providers",
        json={
            "name": "Valid reference",
            "provider_type": "openai",
            "credential_ref": valid_reference,
        },
    )

    assert accepted.status_code == 201
    assert accepted.json()["credential_ref"] == valid_reference

    invalid_references = [
        "env:GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY",
        "vault://GATEKEEPER_CREDENTIAL_OPENAI_PRIMARY",
        "env://OPENAI_API_KEY",
        "env://GATEKEEPER_CREDENTIAL_openai",
        "env://GATEKEEPER_CREDENTIAL_OPENAI-PRIMARY",
    ]
    for index, reference in enumerate(invalid_references):
        rejected = client.post(
            f"/v1/projects/{project_id}/providers",
            json={
                "name": f"Invalid reference {index}",
                "provider_type": "openai",
                "credential_ref": reference,
            },
        )
        assert rejected.status_code == 422


# Build a minimal valid scenario for dataset creation requests.
def scenario_payload(scenario_key: str = "smoke") -> dict[str, object]:
    return {
        "scenario_key": scenario_key,
        "name": "Smoke case",
        "scenario_type": "single_turn",
        "input": {"user_message": "Hello"},
    }


# Validate provider and candidate scoping and persistence.
def test_provider_and_candidate_resources_persist(tmp_path: Path) -> None:
    database_path = tmp_path / "gatekeeper.db"
    client = ApiClient(create_app(database_path))
    project_id = str(create_project(client)["id"])
    provider = create_provider(client, project_id)
    payload = {
        "provider_id": provider["id"],
        "name": "Support baseline",
        "adapter": "openai_responses",
        "model_name": "example-model",
        "system_prompt": "Be concise.",
        "generation_parameters": {"temperature": 0},
        "tool_definitions": [
            {
                "name": "lookup_order",
                "description": "Look up an order.",
                "parameters": {
                    "type": "object",
                    "properties": {"order_id": {"type": "string"}},
                    "required": ["order_id"],
                },
            }
        ],
    }
    created = client.post(f"/v1/projects/{project_id}/candidates", json=payload)
    assert created.status_code == 201
    candidate = created.json()
    assert candidate["system_prompt"] == "Be concise."
    assert client.get(f"/v1/projects/{project_id}/candidates").json() == [candidate]
    assert (
        ApiClient(create_app(database_path))
        .get(f"/v1/projects/{project_id}/candidates/{candidate['id']}")
        .json()
        == candidate
    )


# Validate datasets, typed scenarios, and private rule bindings.
def test_dataset_scenario_and_rule_resources(client: ApiClient) -> None:
    project_id = str(create_project(client)["id"])
    scenarios = [
        {
            "scenario_key": "order-context",
            "name": "Use supplied order",
            "scenario_type": "multi_turn",
            "input": {
                "history": [{"role": "user", "content": "My order is 123."}],
                "user_message": "Where is it?",
            },
        },
        {
            "scenario_key": "lookup-order",
            "name": "Request an order lookup",
            "scenario_type": "tool_use",
            "input": {"user_message": "Find order 123."},
        },
    ]
    dataset_response = client.post(
        f"/v1/projects/{project_id}/datasets",
        json={
            "name": "Support",
            "description": "Support evaluation cases.",
            "scenarios": scenarios,
        },
    )
    assert dataset_response.status_code == 201
    dataset = dataset_response.json()
    assert "scenarios" not in dataset
    dataset_id = dataset["id"]

    persisted_scenarios = client.get(
        f"/v1/projects/{project_id}/datasets/{dataset_id}/scenarios"
    ).json()
    assert [scenario["scenario_key"] for scenario in persisted_scenarios] == [
        "order-context",
        "lookup-order",
    ]
    scenario = persisted_scenarios[0]

    binding_response = client.post(
        f"/v1/projects/{project_id}/datasets/{dataset_id}/rule-bindings",
        json={
            "scenario_id": scenario["id"],
            "rule_key": "uses-context",
            "rule_type": "judge.rubric",
            "role": "required",
            "severity": "high",
            "parameters": {
                "criterion": "Uses the supplied order ID without asking again.",
                "min_score": 4,
            },
        },
    )
    assert binding_response.status_code == 201
    binding = binding_response.json()
    assert binding["applies_to"] is None
    assert client.get(
        f"/v1/projects/{project_id}/datasets/{dataset_id}/scenarios"
    ).json() == persisted_scenarios
    assert client.get(
        f"/v1/projects/{project_id}/datasets/{dataset_id}/rule-bindings"
    ).json() == [binding]

    rejected_scenario = client.post(
        f"/v1/projects/{project_id}/datasets/{dataset_id}/scenarios",
        json=scenario_payload("late-addition"),
    )
    assert rejected_scenario.status_code == 405


# Roll back the dataset and earlier scenarios when any scenario insert fails.
def test_dataset_creation_is_atomic_on_scenario_insert_failure(tmp_path: Path) -> None:
    database_path = tmp_path / "gatekeeper.db"
    client = ApiClient(create_app(database_path))
    project_id = str(create_project(client)["id"])
    with sqlite3.connect(database_path) as connection:
        connection.execute(
            """CREATE TRIGGER reject_scenario BEFORE INSERT ON scenarios
            WHEN NEW.scenario_key = 'reject'
            BEGIN SELECT RAISE(ABORT, 'rejected scenario'); END"""
        )

    response = client.post(
        f"/v1/projects/{project_id}/datasets",
        json={
            "name": "Atomic",
            "scenarios": [scenario_payload("accepted"), scenario_payload("reject")],
        },
    )

    assert response.status_code == 409
    assert client.get(f"/v1/projects/{project_id}/datasets").json() == []


# Keep project scoping and dataset-name conflicts intact for atomic creation.
def test_dataset_creation_rejects_missing_projects_and_name_conflicts(
    client: ApiClient,
) -> None:
    missing = client.post(
        "/v1/projects/00000000-0000-0000-0000-000000000000/datasets",
        json={"name": "Missing", "scenarios": [scenario_payload()]},
    )
    assert missing.status_code == 404

    project_id = str(create_project(client)["id"])
    payload = {"name": "Duplicate", "scenarios": [scenario_payload()]}
    assert client.post(f"/v1/projects/{project_id}/datasets", json=payload).status_code == 201
    assert client.post(f"/v1/projects/{project_id}/datasets", json=payload).status_code == 409
    assert len(client.get(f"/v1/projects/{project_id}/datasets").json()) == 1


# Reject empty or duplicate scenario collections before any storage writes.
def test_dataset_creation_rejects_invalid_scenario_collections(client: ApiClient) -> None:
    project_id = str(create_project(client)["id"])
    invalid_payloads = [
        {
            "name": "Empty",
            "scenarios": [],
        },
        {
            "name": "Duplicate keys",
            "scenarios": [scenario_payload("same"), scenario_payload("same")],
        },
    ]

    for payload in invalid_payloads:
        assert client.post(f"/v1/projects/{project_id}/datasets", json=payload).status_code == 422
    assert client.get(f"/v1/projects/{project_id}/datasets").json() == []


# Validate run settings and project-aligned evaluation runs.
def test_run_settings_and_evaluation_run_sources_are_project_scoped(client: ApiClient) -> None:
    project_id = str(create_project(client)["id"])
    provider = create_provider(client, project_id)
    candidate = client.post(
        f"/v1/projects/{project_id}/candidates",
        json={
            "provider_id": provider["id"],
            "name": "Baseline",
            "adapter": "fake",
            "model_name": "deterministic",
        },
    ).json()
    dataset = client.post(
        f"/v1/projects/{project_id}/datasets",
        json={"name": "Smoke", "scenarios": [scenario_payload()]},
    ).json()
    settings_response = client.post(
        f"/v1/projects/{project_id}/run-settings",
        json={
            "name": "Default",
            "attempts_per_scenario": 3,
            "timeout_ms": 10000,
            "pass_threshold": 0.8,
        },
    )
    assert settings_response.status_code == 201
    settings = settings_response.json()
    assert not any(key.startswith("judge_") for key in settings)
    assert "severity_weights" not in settings

    run_response = client.post(
        f"/v1/projects/{project_id}/evaluation-runs",
        json={
            "candidate_id": candidate["id"],
            "dataset_id": dataset["id"],
            "run_settings_id": settings["id"],
        },
    )
    assert run_response.status_code == 201
    assert run_response.json()["status"] == "pending"

    other_project_id = str(create_project(client, "Other")["id"])
    rejected = client.post(
        f"/v1/projects/{other_project_id}/evaluation-runs",
        json={
            "candidate_id": candidate["id"],
            "dataset_id": dataset["id"],
            "run_settings_id": settings["id"],
        },
    )
    assert rejected.status_code == 404
