"""Actionable reasons preserve deterministic outcomes and private measurement boundaries."""

import logging

import pytest

from gatekeeper.contracts.common import JsonObject
from gatekeeper.evaluation.engine import evaluate_attempt, evaluate_rule
from tests.test_evaluations import binding, call, evidence


# Cover both positive and negative explanations across each deterministic response family.
@pytest.mark.parametrize(
    ("kind", "parameters", "passing", "failing", "expected_pass", "expected_fail"),
    [
        (
            "response.required_text",
            {"values": ["30 days", "receipt"]},
            "Keep your receipt for 30 days",
            "Keep your receipt",
            "All required phrases were found",
            'Missing required text: ["30 days"]',
        ),
        (
            "response.required_text",
            {"values": ["30 days", "receipt"], "match": "any"},
            "RECEIPT",
            "Return your item",
            "At least one required phrase was found",
            "None of the required phrases were found",
        ),
        (
            "response.forbidden_text",
            {"values": ["guaranteed"]},
            "Refunds depend on condition",
            "Your refund is GUARANTEED",
            "None of the forbidden phrases were found",
            'Forbidden text found: ["guaranteed"]',
        ),
        (
            "response.regex",
            {"pattern": "ORD-[0-9]+", "mode": "fullmatch"},
            "ORD-123",
            "Order 123",
            'matches pattern "ORD-[0-9]+"',
            'does not match pattern "ORD-[0-9]+"',
        ),
        (
            "response.length",
            {"unit": "words", "min": 2, "max": 4},
            "two words",
            "one",
            "Observed length 2 words is within",
            "Observed length 1 words is outside",
        ),
        (
            "response.json_valid",
            {},
            "null",
            "not JSON",
            "Response is valid JSON",
            "Response could not be parsed as valid JSON",
        ),
        (
            "response.json_schema",
            {
                "schema": {
                    "type": "object",
                    "properties": {"quantity": {"type": "integer", "minimum": 1}},
                    "required": ["quantity"],
                }
            },
            '{"quantity":1}',
            '{"quantity":0}',
            "JSON matches the configured schema",
            "/quantity: 0 is less than the minimum of 1",
        ),
        (
            "response.json_field",
            {"path": "/status", "operator": "equals", "value": "ready"},
            '{"status":"ready"}',
            '{"status":"pending"}',
            'expected to equal "ready"; observed "ready"',
            'expected to equal "ready"; observed "pending"',
        ),
    ],
)
def test_response_explanations(
    kind: str,
    parameters: JsonObject,
    passing: str,
    failing: str,
    expected_pass: str,
    expected_fail: str,
) -> None:
    """Evaluate kind/parameters on both observations; verify reasons and unchanged outcomes."""
    rule = binding(kind, parameters)
    positive = evaluate_rule(rule, evidence(response_text=passing))
    negative = evaluate_rule(rule, evidence(response_text=failing))

    assert positive.outcome == "pass"
    assert negative.outcome == "fail"
    assert expected_pass in positive.explanation
    assert expected_fail in negative.explanation
    assert positive.reason not in {"assertion_passed", "assertion_failed"}
    assert negative.reason not in {"assertion_passed", "assertion_failed"}
    assert positive.evidence_references == negative.evidence_references == ["/response_text"]


# Missing and explicit null must produce different descriptions even for the same failed assertion.
def test_field_explanation_distinguishes_missing_null_and_wrong_type() -> None:
    """Describe missing/null and numeric type failures without treating them as equivalent."""
    rule = binding("response.json_field", {"path": "/amount", "operator": "gt", "value": 0})
    missing = evaluate_rule(rule, evidence(response_text="{}"))
    null = evaluate_rule(rule, evidence(response_text='{"amount":null}'))
    boolean = evaluate_rule(rule, evidence(response_text='{"amount":true}'))

    assert "observed missing" in missing.explanation
    assert "observed null" in null.explanation
    assert "observed true" in boolean.explanation
    assert "booleans and strings do not qualify" in boolean.explanation
    assert all(item.outcome == "fail" for item in (missing, null, boolean))


# Inclusive metric boundaries and missing usage remain distinct from exceeded limits.
def test_metric_explanations() -> None:
    """Check measured latency, zero usage, exceeded tokens, and absent usage in reasons."""
    latency = binding("metric.latency", {"max_ms": 100})
    passed = evaluate_rule(latency, evidence(duration_ms=100))
    failed = evaluate_rule(latency, evidence(duration_ms=100.126))
    token_rule = binding("metric.tokens", {"max_input": 10, "max_output": 0})
    zero = evaluate_rule(token_rule, evidence())
    exceeded = evaluate_rule(token_rule, evidence(input_tokens=11, output_tokens=None))
    unavailable = evaluate_rule(token_rule, evidence(input_tokens=None))

    assert passed.reason == "latency_within_limit"
    assert "Observed latency 100 ms is within the maximum of 100 ms" in passed.explanation
    assert failed.reason == "latency_limit_exceeded"
    assert "Observed latency 100.13 ms is above" in failed.explanation
    assert zero.outcome == "pass"
    assert "Input tokens: observed 0; maximum 10" in zero.explanation
    assert exceeded.outcome == "fail"
    assert "Input tokens: observed 11; exceeds 10" in exceeded.explanation
    assert "Output tokens: observed unavailable" in exceeded.explanation
    assert unavailable.outcome == "cannot_evaluate"
    assert "Input tokens: observed unavailable" in unavailable.explanation


# Tool selection must identify each violated constraint, while passing requests remain requests.
def test_tool_selection_explanations() -> None:
    """Explain missing, forbidden, disallowed, and absent choices against actual tool names."""
    rule = binding(
        "tool.selection",
        {
            "required_all": ["lookup"],
            "required_any": ["lookup", "search"],
            "allowed": ["lookup", "search"],
            "forbidden": ["delete"],
        },
    )
    failed = evaluate_rule(rule, evidence(tool_requests=[call(1, "delete")]))
    passed = evaluate_rule(rule, evidence(tool_requests=[call(1, "lookup")]))

    assert failed.outcome == "fail"
    assert 'Missing required tools: ["lookup"]' in failed.explanation
    assert 'Expected at least one of: ["lookup", "search"]' in failed.explanation
    assert 'Forbidden tools requested: ["delete"]' in failed.explanation
    assert 'Tools outside the allowed set: ["delete"]' in failed.explanation
    assert passed.outcome == "pass"
    assert "satisfy all configured selection constraints" in passed.explanation
    assert "executed" not in passed.explanation


# Repeated tool arguments must identify the failing request and its actual field value.
def test_tool_argument_explanations() -> None:
    """Describe matching tools' fields and distinguish missing tools from incorrect arguments."""
    rule = binding(
        "tool.argument_field",
        {
            "tool": "lookup",
            "path": "/id",
            "operator": "equals",
            "value": 1,
        },
    )
    failed = evaluate_rule(rule, evidence(tool_requests=[call(1), call(2)]))
    passed = evaluate_rule(rule, evidence(tool_requests=[call(1)]))
    missing = evaluate_rule(rule, evidence(tool_requests=[]))

    assert failed.outcome == "fail"
    assert "Request 2: Field /id: expected to equal 1; observed 2" in failed.explanation
    assert passed.outcome == "pass"
    assert "Assertion satisfied" in passed.explanation
    assert 'Required tool "lookup" was not requested' in missing.explanation


# Overlapping expected calls still require distinct observed requests, never an ordering inference.
def test_expected_call_explanations() -> None:
    """Describe one-to-one matching failure and success without changing unordered matching."""
    rule = binding(
        "tool.expected_calls",
        {
            "expected": [
                {"tool": "lookup", "fields": []},
                {"tool": "lookup", "fields": [{"path": "/id", "operator": "equals", "value": 1}]},
            ],
            "allow_additional_calls": False,
        },
    )
    failed = evaluate_rule(rule, evidence(tool_requests=[call(2), call(2)]))
    passed = evaluate_rule(rule, evidence(tool_requests=[call(2), call(1)]))

    assert failed.outcome == "fail"
    assert "could not be matched one-to-one" in failed.explanation
    assert 'observed 2: ["lookup", "lookup"]' in failed.explanation
    assert 'Observed arguments: [{"id": 2}, {"id": 2}]' in failed.explanation
    assert passed.outcome == "pass"
    assert "matched a distinct observed request" in passed.explanation


# Rich private explanations must not leak response content or expected values into evaluator logs.
def test_explanations_remain_private_to_results(caplog: pytest.LogCaptureFixture) -> None:
    """Evaluate a private phrase and inspect returned explanations and sanitized caplog output."""
    caplog.set_level("INFO", logger="gatekeeper.evaluation.engine")
    observed = evidence(response_text="PRIVATE_RESPONSE_CONTENT")
    rule = binding("response.required_text", {"values": ["PRIVATE_EXPECTED_PHRASE"]})
    logger = logging.getLogger("gatekeeper.evaluation.engine")
    original_propagate = logger.propagate
    logger.propagate = True

    try:
        result = evaluate_attempt(observed, [rule], [])
    finally:
        logger.propagate = original_propagate

    assert "PRIVATE_EXPECTED_PHRASE" in result.rule_results[0].explanation
    assert "PRIVATE_EXPECTED_PHRASE" not in caplog.text
    assert "PRIVATE_RESPONSE_CONTENT" not in caplog.text
    assert result.verdict == "fail"
