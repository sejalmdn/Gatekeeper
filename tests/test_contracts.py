"""Phase 1 boundary contract tests."""

import pytest
from pydantic import ValidationError

from gatekeeper.contracts.datasets import DatasetCreate
from gatekeeper.contracts.rules import SEVERITY_WEIGHTS, RuleBindingCreate, Severity
from gatekeeper.contracts.scenarios import ScenarioCreate


# Validate type-specific scenario input contracts.
def test_scenario_contracts_validate_by_type() -> None:
    single = ScenarioCreate(
        scenario_key="math",
        name="Simple math",
        scenario_type="single_turn",
        input={"user_message": "What is 2 + 2?"},
    )
    assert single.input == {"user_message": "What is 2 + 2?"}

    multi = ScenarioCreate(
        scenario_key="order",
        name="Order context",
        scenario_type="multi_turn",
        input={
            "history": [{"role": "user", "content": "My order is 123."}],
            "user_message": "Where is it?",
        },
    )
    assert multi.input["history"][0]["role"] == "user"

    tool = ScenarioCreate(
        scenario_key="lookup",
        name="Tool lookup",
        scenario_type="tool_use",
        input={"user_message": "Find order 123."},
    )
    assert tool.input["history"] == []

    invalid_inputs = [
        {"scenario_type": "single_turn", "input": {"history": []}},
        {"scenario_type": "multi_turn", "input": {"history": [], "user_message": "x"}},
        {
            "scenario_type": "multi_turn",
            "input": {
                "history": [{"role": "system", "content": "hidden"}],
                "user_message": "x",
            },
        },
        {
            "scenario_type": "tool_use",
            "input": {
                "history": [{"role": "tool", "content": "unverified"}],
                "user_message": "x",
            },
        },
    ]
    for invalid in invalid_inputs:
        with pytest.raises(ValidationError):
            ScenarioCreate.model_validate({"scenario_key": "x", "name": "X", **invalid})


# Require a non-empty dataset with unique, type-valid scenario definitions.
def test_dataset_create_contract_validates_scenario_collection() -> None:
    scenarios = [
        {
            "scenario_key": "single",
            "name": "Single turn",
            "scenario_type": "single_turn",
            "input": {"user_message": "Hello"},
        },
        {
            "scenario_key": "multi",
            "name": "Multi-turn",
            "scenario_type": "multi_turn",
            "input": {
                "history": [{"role": "assistant", "content": "How can I help?"}],
                "user_message": "Find my order.",
            },
        },
        {
            "scenario_key": "tool",
            "name": "Tool use",
            "scenario_type": "tool_use",
            "input": {"user_message": "Look up order 123."},
        },
    ]
    dataset = DatasetCreate(name="Support", scenarios=scenarios)
    assert [scenario.scenario_type for scenario in dataset.scenarios] == [
        "single_turn",
        "multi_turn",
        "tool_use",
    ]

    invalid_collections = [
        [],
        [scenarios[0], {**scenarios[1], "scenario_key": "single"}],
        [
            {
                "scenario_key": "invalid",
                "name": "Invalid history",
                "scenario_type": "multi_turn",
                "input": {"history": [], "user_message": "Continue"},
            }
        ],
    ]
    for invalid_scenarios in invalid_collections:
        with pytest.raises(ValidationError):
            DatasetCreate(name="Invalid", scenarios=invalid_scenarios)


# Validate rule parameters and binding scope.
def test_rule_binding_contracts_validate_parameters_and_scope() -> None:
    assert SEVERITY_WEIGHTS == {
        Severity.CRITICAL: 4,
        Severity.HIGH: 3,
        Severity.MEDIUM: 2,
        Severity.LOW: 1,
    }
    binding = RuleBindingCreate(
        rule_key="order_id",
        rule_type="tool.argument_field",
        role="required",
        severity="high",
        applies_to=["tool_use"],
        parameters={
            "tool": "lookup_order",
            "path": "/order_id",
            "operator": "equals",
            "value": "123",
        },
    )
    assert binding.parameters["path"] == "/order_id"

    invalid_rules = [
        {"rule_type": "metric.tokens", "parameters": {}},
        {"rule_type": "judge.rubric", "parameters": {"criterion": "Correct", "min_score": 6}},
        {"rule_type": "response.regex", "parameters": {"pattern": "["}},
        {
            "rule_type": "tool.selection",
            "parameters": {"required_all": ["lookup"], "forbidden": ["lookup"]},
        },
    ]
    for invalid in invalid_rules:
        with pytest.raises(ValidationError):
            RuleBindingCreate.model_validate(
                {
                    "rule_key": "invalid",
                    "role": "required",
                    "severity": "high",
                    "applies_to": ["tool_use"],
                    **invalid,
                }
            )

    with pytest.raises(ValidationError):
        RuleBindingCreate.model_validate(
            {
                "rule_key": "unknown-severity",
                "rule_type": "response.json_valid",
                "role": "scored",
                "severity": "urgent",
                "applies_to": ["single_turn"],
                "parameters": {},
            }
        )
