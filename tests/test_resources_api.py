"""Phase 1 control-plane resource API tests."""

from pathlib import Path

from gatekeeper.app import create_app
from tests.conftest import ApiClient, create_project


# Create a reusable provider payload.
def create_provider(client: ApiClient, project_id: str) -> dict[str, object]:
    response = client.post(
        f"/v1/projects/{project_id}/providers",
        json={
            "name": "Primary",
            "provider_type": "openai",
            "credential_ref": "env:OPENAI_API_KEY",
        },
    )
    assert response.status_code == 201
    return response.json()


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
    dataset_response = client.post(
        f"/v1/projects/{project_id}/datasets",
        json={"name": "Support", "description": "Support evaluation cases."},
    )
    assert dataset_response.status_code == 201
    dataset = dataset_response.json()
    dataset_id = dataset["id"]

    scenario_response = client.post(
        f"/v1/projects/{project_id}/datasets/{dataset_id}/scenarios",
        json={
            "scenario_key": "order-context",
            "name": "Use supplied order",
            "scenario_type": "multi_turn",
            "input": {
                "history": [{"role": "user", "content": "My order is 123."}],
                "user_message": "Where is it?",
            },
        },
    )
    assert scenario_response.status_code == 201
    scenario = scenario_response.json()

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
    ).json() == [scenario]
    assert client.get(
        f"/v1/projects/{project_id}/datasets/{dataset_id}/rule-bindings"
    ).json() == [binding]


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
        f"/v1/projects/{project_id}/datasets", json={"name": "Smoke"}
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
