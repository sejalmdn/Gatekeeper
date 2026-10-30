"""Deterministic rule semantics, atomic evaluation storage, and scoped read boundaries."""

import asyncio
import logging
import sqlite3
from uuid import uuid4

import httpx
import pytest

from gatekeeper.contracts.candidates import ToolDefinition
from gatekeeper.contracts.common import JsonObject
from gatekeeper.contracts.evaluations import CheckResult
from gatekeeper.contracts.executions import ExecutionEvidence, ToolRequest
from gatekeeper.contracts.rules import (
    RULE_SCENARIO_TYPES,
    EffectiveRuleBinding,
    RuleType,
)
from gatekeeper.evaluation.engine import (
    attempt_verdict,
    evaluate_attempt,
    evaluate_rule,
    field_matches,
    validate_tools,
)
from gatekeeper.persistence.executions import claim_attempt, claim_run, recover_interrupted
from gatekeeper.persistence.records import timestamp
from tests.conftest import ApiClient, create_project
from tests.test_executions import completion, execute, execution_fixture


# Supply normalized successful evidence with explicit empty and zero observations.
def evidence(**changes: object) -> ExecutionEvidence:
    """Build baseline evidence with changes overriding observed fields; return its contract."""
    data = {
        "execution_id": uuid4(),
        "run_id": uuid4(),
        "scenario_id": uuid4(),
        "attempt_number": 1,
        "status": "completed",
        "started_at": timestamp(),
        "completed_at": timestamp(),
        "requested_model": "test",
        "provider_type": "openai",
        "adapter": "test",
        "response_text": "",
        "duration_ms": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "tool_requests": [],
    }
    data.update(changes)
    return ExecutionEvidence.model_validate(data)


# Build normalized frozen bindings through the real parameter contracts.
def binding(kind: str, parameters: JsonObject, role: str = "required") -> EffectiveRuleBinding:
    """Return an effective binding of kind with normalized parameters and the requested role."""
    return EffectiveRuleBinding.model_validate(
        {
            "id": uuid4(),
            "dataset_id": uuid4(),
            "rule_key": kind,
            "rule_type": kind,
            "role": role,
            "severity": "high",
            "parameters": parameters,
            "applies_to": list(RULE_SCENARIO_TYPES[RuleType(kind)]),
            "created_at": timestamp(),
            "source": "dataset",
        }
    )


# Exercise each deterministic family against an observed boundary and a violating observation.
@pytest.mark.parametrize(
    ("kind", "parameters", "passing", "failing"),
    [
        ("response.required_text", {"values": ["HELLO", "world"]}, "hello world", "hello"),
        ("response.required_text", {"values": ["x", "y"], "match": "any"}, "y", "z"),
        ("response.forbidden_text", {"values": ["BAD"]}, "good", "bad"),
        ("response.forbidden_text", {"values": ["BAD"], "case_sensitive": True}, "bad", "BAD"),
        (
            "response.regex",
            {"pattern": "^hi$", "flags": ["MULTILINE", "IGNORECASE"]},
            "HI\nthere",
            "high",
        ),
        (
            "response.regex",
            {"pattern": "a.*b", "mode": "fullmatch", "flags": ["DOTALL"]},
            "a\nb",
            "xa\nb",
        ),
        ("response.json_valid", {}, "null", ""),
        ("response.json_valid", {}, "[]", "NaN"),
        ("response.json_schema", {"schema": {"type": "integer"}}, "0", "true"),
        (
            "response.json_field",
            {"path": "/a", "operator": "equals", "value": None},
            '{"a":null}',
            "{}",
        ),
        ("response.length", {"unit": "characters", "min": 0, "max": 0}, "", "a"),
        ("response.length", {"unit": "words", "min": 2, "max": 2}, "a  b", "a"),
    ],
)
def test_response_rules(kind: str, parameters: JsonObject, passing: str, failing: str) -> None:
    """Evaluate kind/parameters with passing, failing, and missing response evidence."""
    rule = binding(kind, parameters)

    assert evaluate_rule(rule, evidence(response_text=passing)).outcome == "pass"
    assert evaluate_rule(rule, evidence(response_text=failing)).outcome == "fail"
    assert evaluate_rule(rule, evidence(response_text=None)).outcome == "cannot_evaluate"


# Check every JSON assertion operator, pointer escapes, and strict type/missing boundaries.
@pytest.mark.parametrize(
    ("value", "parameters", "expected"),
    [
        ({"a": None}, {"path": "/a", "operator": "exists"}, True),
        ({}, {"path": "/a", "operator": "not_exists"}, True),
        ({"a": None}, {"path": "/a", "operator": "not_exists"}, False),
        ({}, {"path": "/a", "operator": "not_equals", "value": None}, False),
        (True, {"path": "", "operator": "equals", "value": 1}, False),
        (1, {"path": "", "operator": "equals", "value": 1.0}, True),
        ([True], {"path": "", "operator": "equals", "value": [1]}, False),
        ({"a": True}, {"path": "", "operator": "equals", "value": {"a": 1}}, False),
        (1, {"path": "", "operator": "in", "values": [True, 2]}, False),
        (1, {"path": "", "operator": "not_in", "values": [True, 2]}, True),
        (None, {"path": "", "operator": "not_equals", "value": 0}, True),
        (True, {"path": "", "operator": "gt", "value": 0}, False),
        (1, {"path": "", "operator": "gte", "value": True}, False),
        (2, {"path": "", "operator": "gt", "value": 1}, True),
        (1, {"path": "", "operator": "gte", "value": 1}, True),
        (0, {"path": "", "operator": "lt", "value": 1}, True),
        (1, {"path": "", "operator": "lte", "value": 1}, True),
        (1, {"path": "", "operator": "between", "min": 1, "max": 1}, True),
        ("1", {"path": "", "operator": "between", "min": 0, "max": 2}, False),
        ({"a/b": {"~": [None]}}, {"path": "/a~1b/~0/0", "operator": "exists"}, True),
        ([1], {"path": "/01", "operator": "exists"}, False),
        ([1], {"path": "/-", "operator": "exists"}, False),
        ([1], {"path": "/1", "operator": "exists"}, False),
    ],
)
def test_field_assertions(value: object, parameters: JsonObject, expected: bool) -> None:
    """Apply parameters to value and verify expected strict JSON field semantics."""
    assert field_matches(value, parameters) is expected


# Missing metrics remain unknown while zero observations and inclusive limits remain valid.
@pytest.mark.parametrize(
    ("kind", "parameters", "changes", "outcome"),
    [
        ("metric.latency", {"max_ms": 1}, {}, "pass"),
        ("metric.latency", {"max_ms": 1}, {"duration_ms": 1}, "pass"),
        ("metric.latency", {"max_ms": 1}, {"duration_ms": 1.1}, "fail"),
        ("metric.latency", {"max_ms": 1}, {"duration_ms": None}, "cannot_evaluate"),
        ("metric.tokens", {"max_input": 0, "max_output": 0, "max_total": 0}, {}, "pass"),
        ("metric.tokens", {"max_total": 1}, {"input_tokens": 1}, "pass"),
        ("metric.tokens", {"max_total": 1}, {"input_tokens": 1, "output_tokens": 1}, "fail"),
        ("metric.tokens", {"max_total": 0}, {"input_tokens": None}, "cannot_evaluate"),
        ("metric.tokens", {"max_output": 0}, {"input_tokens": None}, "pass"),
        (
            "metric.tokens",
            {"max_input": 0, "max_output": 0},
            {"input_tokens": 1, "output_tokens": None},
            "fail",
        ),
        ("metric.cost", {"max_usd": 1}, {}, "cannot_evaluate"),
        ("judge.rubric", {"criterion": "Useful", "min_score": 3}, {}, "cannot_evaluate"),
    ],
)
def test_metrics_and_deferred_rules(
    kind: str, parameters: JsonObject, changes: dict[str, object], outcome: str
) -> None:
    """Check kind/parameters over changed metric evidence yields outcome and safe reasons."""
    result = evaluate_rule(binding(kind, parameters), evidence(**changes))

    assert result.outcome == outcome
    assert result.reason


# Tool requests remain observations with no claim that an operation executed.
def call(number: int, name: str = "lookup") -> ToolRequest:
    """Return a request for name with number as its observed id argument."""
    return ToolRequest(name=name, arguments={"id": number})


# Match repeated tools with augmenting paths rather than order-dependent greedy assignment.
def test_tool_rules() -> None:
    """Verify selection, all matching argument checks, and unordered one-to-one matching."""
    observed = evidence(tool_requests=[call(1), call(2)])
    selection = binding(
        "tool.selection",
        {
            "required_all": ["lookup"],
            "required_any": ["lookup"],
            "allowed": ["lookup"],
            "forbidden": ["delete"],
        },
    )

    assert evaluate_rule(selection, observed).outcome == "pass"
    assert evaluate_rule(selection, evidence(tool_requests=[])).outcome == "fail"
    assert evaluate_rule(selection, evidence(tool_requests=None)).outcome == "cannot_evaluate"
    assert evaluate_rule(selection, evidence(tool_requests=[call(1, "delete")])).outcome == "fail"

    field = binding(
        "tool.argument_field",
        {
            "tool": "lookup",
            "path": "/id",
            "operator": "equals",
            "value": 1,
        },
    )

    assert evaluate_rule(field, observed).outcome == "fail"
    assert evaluate_rule(field, evidence(tool_requests=[call(1)])).outcome == "pass"
    assert evaluate_rule(field, evidence(tool_requests=[])).outcome == "fail"
    expected = [
        {"tool": "lookup"},
        {"tool": "lookup", "fields": [{"path": "/id", "operator": "equals", "value": 1}]},
    ]
    rule = binding("tool.expected_calls", {"expected": expected})

    assert evaluate_rule(rule, observed).outcome == "pass"
    assert evaluate_rule(rule, evidence(tool_requests=[call(2), call(1)])).outcome == "pass"
    assert evaluate_rule(rule, evidence(tool_requests=[call(1)])).outcome == "fail"
    assert evaluate_rule(rule, evidence(tool_requests=[call(2), call(2)])).outcome == "fail"
    extra = evidence(tool_requests=[call(1), call(2), call(3)])

    assert evaluate_rule(rule, extra).outcome == "fail"
    permissive = binding(
        "tool.expected_calls",
        {
            "expected": expected,
            "allow_additional_calls": True,
        },
    )

    assert evaluate_rule(permissive, extra).outcome == "pass"


# Automatic baseline validation runs even when there are no explicit required rules.
@pytest.mark.parametrize(
    ("tool_request", "reason"),
    [
        (ToolRequest(issues=["malformed_tool_request"]), "malformed_tool_request"),
        (ToolRequest(name="lookup", arguments_text="{"), "invalid_argument_json"),
        (call(1, "unknown"), "undeclared_tool"),
        (ToolRequest(name="lookup", arguments={"id": "1"}), "arguments_schema_mismatch"),
    ],
)
def test_automatic_tool_failures(tool_request: ToolRequest, reason: str) -> None:
    """Verify request produces a required baseline failure with reason even without bindings."""
    tools = [
        ToolDefinition(
            name="lookup",
            parameters={
                "type": "object",
                "required": ["id"],
                "properties": {"id": {"type": "integer"}},
            },
        )
    ]
    result = evaluate_attempt(evidence(tool_requests=[tool_request]), [], tools)

    assert result.verdict == "fail"
    assert result.automatic_tool_validation[0].reason == reason
    assert result.rule_results == []
    assert validate_tools(evidence(tool_requests=[call(1)]), tools)[0].outcome == "pass"


# Invalid schema configuration and unavailable tool observations are evaluator/unknown outcomes.
def test_automatic_tool_errors() -> None:
    """Verify malformed collections fail and invalid schemas produce an evaluator error."""
    invalid = ToolDefinition(name="lookup", parameters={"type": "nonsense"})

    assert evaluate_attempt(evidence(tool_requests=[call(1)]), [], [invalid]).verdict == "error"
    malformed = evidence(completeness_issues=["malformed_tool_calls"], tool_requests=None)

    assert evaluate_attempt(malformed, [], []).verdict == "fail"
    assert evaluate_attempt(evidence(), [], []).verdict == "not_evaluated"
    unresolved = evidence(
        tool_requests=[
            ToolRequest(
                name="lookup",
                arguments={},
                issues=["arguments_schema_unresolvable"],
            )
        ]
    )

    assert evaluate_attempt(unresolved, [], []).verdict == "error"


# Required rules dominate scored and informational results under explicit verdict precedence.
@pytest.mark.parametrize(
    ("outcomes", "automatic", "expected"),
    [
        (["pass"], [], "pass"),
        (["cannot_evaluate", "error", "fail"], [], "fail"),
        (["cannot_evaluate", "error"], [], "error"),
        (["pass", "cannot_evaluate"], [], "cannot_evaluate"),
        (["pass"], ["fail"], "fail"),
        (["pass"], ["error"], "error"),
        (["pass"], ["cannot_evaluate"], "cannot_evaluate"),
        ([], ["pass"], "not_evaluated"),
        ([], ["cannot_evaluate"], "not_evaluated"),
        ([], ["error"], "error"),
    ],
)
def test_verdict_precedence(outcomes: list[str], automatic: list[str], expected: str) -> None:
    """Combine required outcomes and automatic checks and assert expected verdict."""
    result = evaluate_attempt(evidence(), [binding("response.json_valid", {})], [])
    prototype = result.rule_results[0]
    rules = [prototype.model_copy(update={"outcome": item}) for item in outcomes]
    rules.extend(
        prototype.model_copy(update={"role": role, "outcome": "fail"})
        for role in ("scored", "informational")
    )
    checks = [CheckResult(outcome=item, reason="test", explanation="test") for item in automatic]

    assert attempt_verdict(rules, checks) == expected


# Failed invocations cannot become candidate rule failures, even with partial metrics.
@pytest.mark.parametrize("status", ["failed", "timed_out"])
def test_failed_invocations(status: str) -> None:
    """Verify status yields cannot_evaluate for every supported rule family used here."""
    rules = [
        binding("response.required_text", {"values": ["missing"]}),
        binding("metric.latency", {"max_ms": 1}),
        binding("metric.tokens", {"max_total": 0}),
        binding("tool.selection", {"required_all": ["lookup"]}),
    ]
    result = evaluate_attempt(evidence(status=status, duration_ms=100), rules, [])

    assert result.verdict == "cannot_evaluate"
    assert all(item.outcome == "cannot_evaluate" for item in result.rule_results)


# Freeze five scenario bindings for three attempts while leaving other scenarios unbound.
def evaluation_fixture(client: ApiClient) -> tuple[str, str, str]:
    """Create a run using client and return project, run URL, and its five-rule scenario ID."""
    project, url = execution_fixture(client)
    database = client.app.state.database

    with database.connection() as connection:
        row = connection.execute("SELECT dataset_id, scenario_id FROM rule_bindings").fetchone()
        dataset_id = row["dataset_id"]
        scenario_id = row["scenario_id"]
        connection.execute("UPDATE rule_bindings SET parameters = ?", ('{"values":["Hello"]}',))

    rules = [
        ("response.forbidden_text", {"values": ["BAD"]}),
        ("response.length", {"unit": "characters", "min": 5, "max": 5}),
        ("response.regex", {"pattern": "Hello", "mode": "fullmatch"}),
        ("metric.latency", {"max_ms": 1000000}),
    ]

    for kind, parameters in rules:
        response = client.post(
            f"/v1/projects/{project}/datasets/{dataset_id}/rule-bindings",
            json={
                "scenario_id": scenario_id,
                "rule_key": kind,
                "rule_type": kind,
                "role": "required",
                "severity": "high",
                "parameters": parameters,
            },
        )

        assert response.status_code == 201

    return project, url, scenario_id


# Persist exactly fifteen results for three attempts evaluated against five frozen bindings.
def test_frozen_results_and_scoped_reads(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Run mocked calls via client/monkeypatch and check frozen results, uniqueness, and scoping."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    project, url, scenario_id = evaluation_fixture(client)
    database = client.app.state.database

    assert client.get(f"{url}/evaluations").json() == []
    assert client.post(f"{url}/start").status_code == 200
    summaries = client.get(f"{url}/evaluations").json()

    assert len(summaries) == 18
    assert all(item["verdict"] == "not_evaluated" for item in summaries)
    first_url = f"{url}/attempts/{summaries[0]['id']}/evaluation"
    initial = client.get(first_url).json()

    assert initial["verdict"] == "not_evaluated"
    assert initial["rule_results"] == []
    assert initial["evaluated_at"] is None

    with database.connection() as connection:
        connection.execute(
            "UPDATE rule_bindings SET parameters = ? WHERE rule_type = 'response.required_text'",
            ('{"values":["EDITED_PRIVATE_EXPECTATION"]}',),
        )

    execute(client, lambda _: httpx.Response(200, json=completion()))
    summaries = client.get(f"{url}/evaluations").json()
    target = [item for item in summaries if item["scenario_id"] == scenario_id]

    assert len(target) == 3
    assert all(item["verdict"] == "pass" and item["status"] == "completed" for item in target)
    assert all(item["outcome_counts"] == {"pass": 5} for item in target)
    assert all(
        item["verdict"] == "not_evaluated"
        for item in summaries
        if item["scenario_id"] != scenario_id
    )

    for item in target:
        response = client.get(f"{url}/attempts/{item['id']}/evaluation")
        detail = response.json()

        assert response.status_code == 200
        assert len(detail["rule_results"]) == 5
        assert detail["outcome_counts"] == item["outcome_counts"]
        assert detail["evaluator_version"] == "deterministic-v1"
        assert detail["evaluated_at"]
        assert all(result["evidence_references"] for result in detail["rule_results"])
        required_text = next(
            result
            for result in detail["rule_results"]
            if result["rule_type"] == "response.required_text"
        )

        assert required_text["reason"] == "required_text_found"
        assert 'All required phrases were found: ["Hello"]' in required_text["explanation"]
        assert "EDITED_PRIVATE_EXPECTATION" not in str(detail)
        frozen_rule = next(
            rule
            for rule in detail["rule_configurations"]
            if rule["id"] == required_text["rule_binding_id"]
        )

        assert frozen_rule["parameters"]["values"] == ["Hello"]
        assert all(
            rule["scenario_id"] in {None, scenario_id} for rule in detail["rule_configurations"]
        )
        assert "rule_configurations" not in item

    with database.connection() as connection:
        assert (
            connection.execute("SELECT COUNT(*) FROM rule_evaluation_results").fetchone()[0] == 15
        )
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM (SELECT DISTINCT execution_id, rule_binding_id "
                "FROM rule_evaluation_results)"
            ).fetchone()[0]
            == 15
        )

    with pytest.raises(sqlite3.IntegrityError), database.connection() as connection:
        connection.execute(
            "INSERT INTO rule_evaluation_results SELECT * FROM rule_evaluation_results LIMIT 1"
        )

    with pytest.raises(sqlite3.IntegrityError), database.connection() as connection:
        connection.execute(
            "INSERT INTO attempt_evaluations SELECT * FROM attempt_evaluations LIMIT 1"
        )

    other = str(create_project(client, "Other")["id"])
    other_url = url.replace(project, other)

    assert client.get(f"{other_url}/evaluations").status_code == 404
    assert client.get(first_url.replace(project, other)).status_code == 404
    assert client.get(f"{url}/attempts/{uuid4()}/evaluation").status_code == 404
    assert (
        client.get(f"/v1/projects/{project}/evaluation-runs/{uuid4()}/evaluations").status_code
        == 404
    )
    run = client.get(url).json()
    another = client.post(
        url.rsplit("/", 1)[0],
        json={key: run[key] for key in ("candidate_id", "dataset_id", "run_settings_id")},
    ).json()
    another_url = f"{url.rsplit('/', 1)[0]}/{another['id']}"

    assert client.get(first_url.replace(url, another_url)).status_code == 404


# Isolate one evaluator failure without discarding evidence or the other rule results.
def test_evaluator_exception_preserves_evidence(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Inject an evaluator error with monkeypatch; verify client results and safe caplog output."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url, scenario_id = evaluation_fixture(client)
    client.post(f"{url}/start")
    original = evaluate_rule

    # Simulate private exception text that must never enter result messages or logs.
    def faulty(rule: EffectiveRuleBinding, observed: ExecutionEvidence) -> CheckResult:
        """Raise for the required-text rule; evaluate other rule/observed pairs normally."""
        if rule.rule_type == "response.required_text":
            raise RuntimeError("PRIVATE_EVALUATOR_ERROR_CONTENT")

        return original(rule, observed)

    monkeypatch.setattr("gatekeeper.evaluation.engine.evaluate_rule", faulty)
    monkeypatch.setattr(logging.getLogger("gatekeeper"), "propagate", True)
    caplog.set_level("INFO")
    execute(client, lambda _: httpx.Response(200, json=completion()))
    summaries = client.get(f"{url}/evaluations").json()
    target = [item for item in summaries if item["scenario_id"] == scenario_id]

    assert all(item["verdict"] == "error" for item in target)

    for item in target:
        detail = client.get(f"{url}/attempts/{item['id']}/evaluation").json()
        observed = client.get(f"{url}/attempts/{item['id']}").json()

        assert detail["outcome_counts"] == {"error": 1, "pass": 4}
        assert observed["evidence"]["response_text"] == "Hello"
        assert observed["status"] == "completed"
        assert "PRIVATE_EVALUATOR_ERROR_CONTENT" not in str(detail)

    assert "PRIVATE_EVALUATOR_ERROR_CONTENT" not in caplog.text
    assert "rule_evaluator_error" in caplog.text


# A failure partway through result insertion rolls back the header and all sibling results.
def test_evaluation_storage_atomicity(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Fail writes with monkeypatch; check client evidence and worker failure handling."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url, _ = evaluation_fixture(client)
    database = client.app.state.database
    client.post(f"{url}/start")

    with database.connection() as connection:
        connection.execute(
            "CREATE TRIGGER fail_second_result BEFORE INSERT ON rule_evaluation_results "
            "WHEN (SELECT COUNT(*) FROM rule_evaluation_results) = 1 "
            "BEGIN SELECT RAISE(ABORT, 'test storage failure'); END"
        )

    # Complete the invocation before the deliberately failing evaluation transaction.
    async def send(*args: object) -> httpx.Response:
        """Accept worker args and return a mocked provider response without network access."""
        return httpx.Response(200, json=completion())

    monkeypatch.setattr("gatekeeper.execution.worker.send_request", send)

    # Wait for the worker to exercise its existing durable failure handling.
    async def run() -> None:
        """Start client's lifespan, wait for a failed run, then return after worker shutdown."""
        async with client.app.router.lifespan_context(client.app):
            for _ in range(200):
                with database.connection() as connection:
                    status = connection.execute("SELECT status FROM evaluation_runs").fetchone()[0]

                if status == "failed":
                    break

                await asyncio.sleep(0.01)

            assert status == "failed"

    asyncio.run(run())

    with database.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM execution_evidence").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM attempt_evaluations").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM rule_evaluation_results").fetchone()[0] == 0

    summaries = client.get(f"{url}/evaluations").json()

    assert all(item["verdict"] == "not_evaluated" for item in summaries)
    completed = [item for item in summaries if item["status"] == "completed"]

    assert len(completed) == 1
    detail = client.get(f"{url}/attempts/{completed[0]['id']}").json()

    assert detail["evidence"]["response_text"] == "Hello"
    assert client.get(url).json()["error"]["code"] == "worker_internal_error"


# Skipped, interrupted, and historical attempts are never implicitly graded on read.
def test_unevaluated_attempts(client: ApiClient) -> None:
    """Check client reads for interrupted and skipped attempts without creating results."""
    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    database = client.app.state.database
    claimed = claim_run(database)

    assert claimed is not None
    attempt = claim_attempt(database, claimed[0])

    assert attempt is not None
    recover_interrupted(database)
    summaries = client.get(f"{url}/evaluations").json()

    assert all(item["verdict"] == "not_evaluated" for item in summaries)
    assert {item["status"] for item in summaries} == {"failed", "skipped"}
    assert client.get(f"{url}/attempts/{attempt.id}/evaluation").status_code == 200


# Persist unsuccessful invocations as insufficient evidence, separate from candidate failures.
def test_provider_failure_results(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock failed responses with monkeypatch/client; verify all frozen results remain unknown."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url, scenario_id = evaluation_fixture(client)
    client.post(f"{url}/start")
    execute(client, lambda _: httpx.Response(500, json={"error": "unavailable"}))
    target = [
        item
        for item in client.get(f"{url}/evaluations").json()
        if item["scenario_id"] == scenario_id
    ]

    assert len(target) == 3

    for item in target:
        detail = client.get(f"{url}/attempts/{item['id']}/evaluation").json()

        assert item["status"] == "failed"
        assert item["verdict"] == "cannot_evaluate"
        assert detail["outcome_counts"] == {"cannot_evaluate": 5}
        assert all(
            result["reason"] == "invocation_unsuccessful" for result in detail["rule_results"]
        )


# Automatic validation outcomes are persisted separately from explicit binding outcomes.
def test_stored_tool_validation(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock invalid tool arguments for client/monkeypatch and inspect stored baseline failures."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url, _ = evaluation_fixture(client)
    client.post(f"{url}/start")
    calls = [
        {
            "id": "call-1",
            "type": "function",
            "function": {"name": "lookup_order", "arguments": '{"order_id":1}'},
        }
    ]
    execute(client, lambda _: httpx.Response(200, json=completion(calls=calls)))
    summaries = client.get(f"{url}/evaluations").json()

    assert all(item["verdict"] == "fail" for item in summaries)
    detail = client.get(f"{url}/attempts/{summaries[0]['id']}/evaluation").json()

    assert detail["automatic_tool_validation"] == [
        {
            "outcome": "fail",
            "reason": "arguments_schema_mismatch",
            "explanation": "Arguments schema mismatch.",
            "evidence_references": ["/tool_requests/0"],
        }
    ]


# Token evidence references point to the actual configured usage fields.
@pytest.mark.parametrize(
    ("parameters", "references"),
    [
        ({"max_input": 0}, ["/input_tokens"]),
        ({"max_output": 0}, ["/output_tokens"]),
        ({"max_total": 0}, ["/input_tokens", "/output_tokens"]),
    ],
)
def test_token_evidence_references(parameters: JsonObject, references: list[str]) -> None:
    """Evaluate token parameters and ensure only the relevant evidence references are returned."""
    assert (
        evaluate_rule(binding("metric.tokens", parameters), evidence()).evidence_references
        == references
    )


# Invalid or unavailable schemas are evaluator failures rather than invalid candidate output.
@pytest.mark.parametrize("schema", [{"type": "invalid"}, {"$ref": "urn:unavailable:schema"}])
def test_schema_evaluator_errors(schema: JsonObject) -> None:
    """Evaluate schema locally and preserve an error while another binding continues to pass."""
    rules = [
        binding("response.json_schema", {"schema": schema}),
        binding("response.json_valid", {}),
    ]
    result = evaluate_attempt(evidence(response_text="{}"), rules, [])

    assert result.verdict == "error"
    assert [item.outcome for item in result.rule_results] == ["error", "pass"]
    assert result.rule_results[0].reason == "rule_evaluator_error"
