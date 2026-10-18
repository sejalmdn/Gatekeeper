"""Rule authoring and effective-rule measurement-boundary tests."""

from uuid import uuid4

import pytest

from tests.conftest import ApiClient, create_project


# Create mixed scenario inputs and return their owning API scope.
def mixed_dataset(client: ApiClient, project_id: str, name: str = "Mixed") -> str:
    response = client.post(
        f"/v1/projects/{project_id}/datasets",
        json={
            "name": name,
            "scenarios": [
                {
                    "scenario_key": "single",
                    "name": "Single",
                    "scenario_type": "single_turn",
                    "input": {"user_message": "Hello"},
                },
                {
                    "scenario_key": "tool",
                    "name": "Tool",
                    "scenario_type": "tool_use",
                    "input": {"user_message": "Look up the order"},
                },
            ],
        },
    )
    assert response.status_code == 201
    return f"/v1/projects/{project_id}/datasets/{response.json()['id']}"


# Return a complete rule payload whose expectations remain private.
def rule_payload(key: str = "latency", **overrides: object) -> dict[str, object]:
    return {
        "rule_key": key,
        "rule_type": "metric.latency",
        "role": "required",
        "severity": "medium",
        "parameters": {"max_ms": 1000},
        "applies_to": ["single_turn", "tool_use"],
        **overrides,
    }


# Resolve applicable defaults, complete same-key replacements, and scenario-only rules.
def test_effective_rules_use_complete_overrides_without_mutating_inputs(client: ApiClient) -> None:
    project_id = str(create_project(client)["id"])
    base = mixed_dataset(client, project_id)
    scenarios = client.get(f"{base}/scenarios").json()
    single, tool = scenarios
    bindings = f"{base}/rule-bindings"
    default = client.post(bindings, json=rule_payload()).json()
    response_only = client.post(
        bindings,
        json=rule_payload(
            "text",
            rule_type="response.required_text",
            parameters={"values": ["private expected answer"]},
            applies_to=["single_turn"],
        ),
    ).json()
    override = client.post(
        bindings,
        json=rule_payload(
            scenario_id=single["id"],
            applies_to=None,
            role="informational",
            severity="low",
            parameters={"max_ms": 2000},
        ),
    ).json()
    specific = client.post(
        bindings,
        json=rule_payload("specific", scenario_id=single["id"], applies_to=None),
    ).json()
    effective = client.get(f"{base}/scenarios/{single['id']}/effective-rules")
    assert effective.status_code == 200
    by_key = {rule["rule_key"]: rule for rule in effective.json()}
    assert by_key["latency"] == {
        **override,
        "source": "scenario",
        "overridden_rule_id": default["id"],
    }
    assert by_key["text"] == {**response_only, "source": "dataset", "overridden_rule_id": None}
    assert by_key["specific"] == {**specific, "source": "scenario", "overridden_rule_id": None}
    assert client.get(f"{base}/scenarios/{tool['id']}/effective-rules").json() == [
        {**default, "source": "dataset", "overridden_rule_id": None}
    ]
    assert client.get(f"{base}/scenarios").json() == scenarios
    assert client.get(f"{bindings}/{default['id']}").json() == default


# Keep identical keys legal across scopes and conflicting within each binding scope.
def test_binding_key_uniqueness_and_inapplicable_default(client: ApiClient) -> None:
    base = mixed_dataset(client, str(create_project(client)["id"]))
    single, tool = client.get(f"{base}/scenarios").json()
    url = f"{base}/rule-bindings"
    default_payload = rule_payload(applies_to=["single_turn"])
    assert client.post(url, json=default_payload).status_code == 201
    assert client.post(url, json=default_payload).status_code == 409
    specific_payload = rule_payload(scenario_id=tool["id"], applies_to=None)
    specific = client.post(url, json=specific_payload).json()
    assert client.post(url, json=specific_payload).status_code == 409
    effective = client.get(f"{base}/scenarios/{tool['id']}/effective-rules").json()
    assert effective == [{**specific, "source": "scenario", "overridden_rule_id": None}]
    incompatible = rule_payload(
        scenario_id=tool["id"],
        applies_to=None,
        rule_type="response.json_valid",
        parameters={},
    )
    assert client.post(url, json=incompatible).status_code == 422
    assert (
        client.post(
            url, json=rule_payload(scenario_id=single["id"], applies_to=["single_turn"])
        ).status_code
        == 422
    )


# Resolve no rules as an empty collection and prevent cross-project or cross-dataset reads.
def test_effective_rules_scoping_and_empty_results(client: ApiClient) -> None:
    project_id = str(create_project(client)["id"])
    base = mixed_dataset(client, project_id)
    scenario = client.get(f"{base}/scenarios").json()[0]
    assert client.get(f"{base}/scenarios/{scenario['id']}/effective-rules").json() == []
    assert client.get(f"{base}/scenarios/{uuid4()}/effective-rules").status_code == 404
    other = mixed_dataset(client, project_id, "Other")
    assert client.get(f"{other}/scenarios/{scenario['id']}/effective-rules").status_code == 404
    other_project = str(create_project(client, "Other project")["id"])
    wrong_project = base.replace(project_id, other_project)
    assert (
        client.get(f"{wrong_project}/scenarios/{scenario['id']}/effective-rules").status_code == 404
    )
    assert (
        client.post(
            f"{other}/rule-bindings",
            json=rule_payload(scenario_id=scenario["id"], applies_to=None),
        ).status_code
        == 404
    )


# Preserve explicit null assertions through creation, reads, and effective-rule serialization.
@pytest.mark.parametrize("rule_type", ["response.json_field", "tool.expected_calls"])
def test_null_assertion_round_trips(client: ApiClient, rule_type: str) -> None:
    base = mixed_dataset(client, str(create_project(client)["id"]))
    scenarios = client.get(f"{base}/scenarios").json()
    assertion = {"path": "/optional", "operator": "equals", "value": None}
    parameters = assertion
    scenario = scenarios[0]
    if rule_type == "tool.expected_calls":
        parameters = {
            "expected": [{"tool": "lookup", "fields": [assertion]}],
            "allow_additional_calls": False,
        }
        scenario = scenarios[1]
    created = client.post(
        f"{base}/rule-bindings",
        json=rule_payload(
            rule_type=rule_type,
            scenario_id=scenario["id"],
            applies_to=None,
            parameters=parameters,
        ),
    )
    assert created.status_code == 201
    binding = created.json()
    assert binding["parameters"] == parameters
    assert client.get(f"{base}/rule-bindings/{binding['id']}").json() == binding
    assert client.get(f"{base}/scenarios/{scenario['id']}/effective-rules").json() == [
        {**binding, "source": "scenario", "overridden_rule_id": None}
    ]


# Keep optional nulls omitted and existing parameter defaults stable during null-operand repair.
def test_parameter_normalization_preserves_defaults(client: ApiClient) -> None:
    base = mixed_dataset(client, str(create_project(client)["id"]))
    response = client.post(
        f"{base}/rule-bindings",
        json=rule_payload(
            rule_type="tool.selection",
            applies_to=["tool_use"],
            parameters={"required_all": ["lookup"], "allowed": None},
        ),
    )
    assert response.status_code == 201
    assert response.json()["parameters"] == {"required_all": ["lookup"]}
    text_response = client.post(
        f"{base}/rule-bindings",
        json=rule_payload(
            "text",
            rule_type="response.required_text",
            applies_to=["single_turn"],
            parameters={"values": ["hello"]},
        ),
    )
    assert text_response.status_code == 201
    assert text_response.json()["parameters"] == {
        "values": ["hello"],
        "match": "all",
        "case_sensitive": False,
    }
