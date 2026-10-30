"""Common-rule arithmetic, historical boundaries, and read-only comparison API tests."""

from decimal import Decimal
from uuid import uuid4

import httpx
import pytest

from gatekeeper.contracts.comparisons import ComparisonRun, RunComparison
from gatekeeper.contracts.evaluations import CheckResult
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.contracts.pricing import ExecutionCost
from gatekeeper.contracts.reporting import ReportingAttempt
from gatekeeper.persistence.records import timestamp
from gatekeeper.reporting.comparison import common_attempt, compare_runs, difference
from tests.conftest import ApiClient, create_project
from tests.test_evaluations import binding
from tests.test_executions import completion, execute, execution_fixture
from tests.test_reporting import attempts


# Freeze real execution inputs while isolating one scenario for arithmetic tests.
@pytest.fixture(name="frozen")
def comparison_snapshot(client: ApiClient) -> ExecutionSnapshot:
    """Queue a run through client and return its first scenario with a required frozen rule."""
    _, url = execution_fixture(client)
    client.post(f"{url}/start")

    with client.app.state.database.connection() as connection:
        row = connection.execute("SELECT configuration FROM execution_snapshots").fetchone()

    result = ExecutionSnapshot.model_validate_json(row["configuration"])
    result.scenarios = result.scenarios[:1]
    result.effective_rules = {str(result.scenarios[0].id): [binding("response.json_valid", {})]}
    return result


# Supply only safe comparison metadata for pure aggregation tests.
def metadata(frozen: ExecutionSnapshot) -> ComparisonRun:
    """Return terminal run metadata using frozen candidate, settings, and dataset identity."""
    return ComparisonRun(
        id=uuid4(),
        candidate_id=frozen.candidate.id,
        candidate_name=frozen.candidate.name,
        model=frozen.candidate.model_name,
        dataset_id=frozen.scenarios[0].dataset_id,
        dataset_name="Dataset",
        status="completed",
        created_at=timestamp(),
        settings=frozen.settings,
    )


# Explicit evaluation presence is independent of saved version strings and verdicts.
def observed(frozen: ExecutionSnapshot, verdicts: list[str]) -> list[ReportingAttempt]:
    """Build saved attempts for frozen with verdicts and independent evaluation presence."""
    result = attempts(frozen, verdicts)

    for item in result:
        item.has_evaluation = True

    return result


# Extra required failures must not poison common-rule pass rates with unequal repeats.
def test_common_rules_and_unequal_settings(frozen: ExecutionSnapshot) -> None:
    """Verify unequal denominators, exclusive failures, warnings, and privacy."""
    a = frozen
    b = a.model_copy(deep=True)
    b.settings.attempts_per_scenario = 2
    b.settings.timeout_ms = 2000
    b.settings.pass_threshold = 0.2
    extra = binding("response.json_valid", {})
    b.effective_rules[str(b.scenarios[0].id)].append(extra)
    left, right = observed(a, ["pass"] * 3), observed(b, ["pass", "fail"])

    for item in right:
        item.verdict = "fail"
        item.outcomes[str(extra.id)] = "fail"
        item.evaluator_version = None

    result = compare_runs(uuid4(), metadata(a), metadata(b), a, b, left, right)
    scenario = result.scenarios[0]

    assert scenario.run_a.pass_rate == 1
    assert scenario.run_b.pass_rate == 0.5
    assert scenario.differences.pass_rate_pp == -50
    assert scenario.common_rules[0].pass_rate_difference_pp == -50
    assert scenario.run_b.attempts.planned_attempts == 2
    assert len(scenario.only_in_run_b) == 1
    assert "different_attempts_per_scenario" in result.warnings
    assert "different_timeout_ms" in result.warnings
    assert "different_pass_threshold" in result.warnings
    assert RunComparison.model_validate_json(result.model_dump_json()) == result
    assert "credential_ref" not in result.model_dump_json()
    assert "parameters" not in result.model_dump_json()
    assert all(item.verdict == "fail" for item in right)


# Preserve saved automatic precedence and never count absent required outcomes as passes.
@pytest.mark.parametrize(
    ("outcome", "expected"),
    [
        ("pass", "pass"),
        ("fail", "fail"),
        ("error", "error"),
        ("cannot_evaluate", "cannot_evaluate"),
        ("not_evaluated", "cannot_evaluate"),
    ],
)
def test_required_precedence(frozen: ExecutionSnapshot, outcome: str, expected: str) -> None:
    """Project a saved attempt from frozen and verify outcome precedence and missing evidence."""
    rules = frozen.effective_rules[str(frozen.scenarios[0].id)]
    item = observed(frozen, ["pass"])[0]
    item.outcomes[str(rules[0].id)] = outcome if outcome != "not_evaluated" else "pass"

    if outcome == "not_evaluated":
        item.outcomes = {}

    assert common_attempt(item, rules).verdict == expected
    item.automatic_tool_validation = [CheckResult(outcome="fail", reason="schema", explanation="x")]
    assert common_attempt(item, rules).verdict == "fail"
    item.has_evaluation = False
    assert common_attempt(item, rules).verdict == "not_evaluated"


# Overrides with the same key remain exclusive and scenarios keep their frozen order.
def test_overrides_and_partial_common(frozen: ExecutionSnapshot) -> None:
    """Verify aggregate inclusion and ordered exclusive lists for an override."""
    first = frozen.scenarios[0]
    second = first.model_copy(update={"id": uuid4(), "scenario_key": "second"})
    frozen.scenarios.append(second)
    shared = frozen.effective_rules[str(first.id)][0]
    frozen.effective_rules[str(second.id)] = [shared]
    b = frozen.model_copy(deep=True)
    override = shared.model_copy(update={"id": uuid4(), "source": "scenario"})
    b.effective_rules[str(second.id)] = [override]
    left = observed(frozen, ["pass"] * 3)
    right = observed(b, ["pass"] * 3)
    result = compare_runs(uuid4(), metadata(frozen), metadata(b), frozen, b, left, right)

    assert [item.scenario_id for item in result.scenarios] == [first.id, second.id]
    assert result.aggregate_a.included_scenarios == 1
    assert result.aggregate_a.excluded_scenarios == 1
    assert result.aggregate_a.pass_rate == 1
    assert result.scenarios[1].run_a.reason == "no_common_required_rules"
    assert result.scenarios[1].run_a.pass_rate is None
    assert len(result.scenarios[1].only_in_run_a) == len(result.scenarios[1].only_in_run_b) == 1
    b.effective_rules = {}
    result = compare_runs(uuid4(), metadata(frozen), metadata(b), frozen, b, left, right)

    assert result.aggregate_a.pass_rate is None
    assert "no_common_rules_metrics_only" in result.warnings


# Scored/informational rules stay independent of required checks and need decisive coverage.
def test_scores_and_incomplete_attempts(frozen: ExecutionSnapshot) -> None:
    """Verify common scored weights, missing planned results, and single-attempt warnings."""
    rules = frozen.effective_rules[str(frozen.scenarios[0].id)]
    rules[0].role = "scored"
    info = binding("response.json_valid", {}, "informational")
    rules.append(info)
    left = observed(frozen, ["pass", "pass"])
    left[0].outcomes[str(info.id)] = "fail"
    b = frozen.model_copy(deep=True)
    b.settings.attempts_per_scenario = 1
    right = observed(b, ["pass"])
    result = compare_runs(uuid4(), metadata(frozen), metadata(b), frozen, b, left, right)

    assert result.aggregate_a.score.reason == "incomplete_scored_results"
    assert result.aggregate_b.score.weighted_score == 1
    assert result.aggregate_b.pass_rate is None
    assert result.scenarios[0].common_rules[0].pass_rate_a == 2 / 3
    assert result.scenarios[0].common_rules[0].run_a.outcome_counts["not_evaluated"] == 1
    assert "single_attempt_evidence" in result.warnings
    assert "incomplete_coverage" in result.warnings


# Decimal differences must preserve negative, free, tiny, and missing values.
@pytest.mark.parametrize(
    ("left", "right", "expected"),
    [
        ("0.000000000000000000000001", "0", "-0.000000000000000000000001"),
        ("0", "0", "0"),
        (None, "0", None),
        ("9999999999999999999999999999.1", "9999999999999999999999999999.2", "0.1"),
    ],
)
def test_decimal_differences(left: str | None, right: str, expected: str | None) -> None:
    """Subtract left from right with exact precision and preserve unavailable operands."""
    actual = difference(Decimal(left) if left is not None else None, Decimal(right))
    assert actual == (Decimal(expected) if expected is not None else None)


# Metrics compare only completed observations and serialize monetary differences as strings.
def test_cost_and_metric_coverage(frozen: ExecutionSnapshot) -> None:
    """Verify failed observations are excluded and mixed saved estimates retain decimal coverage."""
    left, right = observed(frozen, ["pass"] * 3), observed(frozen, ["pass"] * 3)
    left[0].cost = ExecutionCost(estimated_usd=Decimal("0.00000000000001"))
    right[0].cost = ExecutionCost(estimated_usd=Decimal(0))
    right[1].cost = ExecutionCost(estimated_usd=Decimal(100))
    right[1].status = "failed"
    left[0].input_tokens = 0
    right[0].input_tokens = 8
    result = compare_runs(uuid4(), metadata(frozen), metadata(frozen), frozen, frozen, left, right)

    assert result.aggregate_b.metrics.estimated_cost_usd.sum == 0
    assert result.aggregate_b.metrics.estimated_cost_usd.missing_count == 1
    assert result.differences.metrics["input_tokens"]["mean"] == 8
    assert result.differences.metrics["estimated_cost_usd"]["sum"] == Decimal("-0.00000000000001")
    assert (
        result.model_dump(mode="json")["differences"]["metrics"]["estimated_cost_usd"]["sum"]
        == "-1E-14"
    )


# The API must scope both identities, reject invalid states, and never write or invoke.
def test_comparison_api(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify same-candidate comparison isolation, history, and read-only SQL."""
    project, url = execution_fixture(client)
    base = f"/v1/projects/{project}"
    first = client.get(url).json()
    second = client.post(
        f"{base}/evaluation-runs",
        json={key: first[key] for key in ("candidate_id", "dataset_id", "run_settings_id")},
    ).json()
    query = f"{base}/run-comparisons?run_a_id={first['id']}&run_b_id={second['id']}"
    assert client.get(query).status_code == 409
    assert client.get(query).json()["detail"]["reason"] == "nonterminal_run"
    assert (
        client.get(
            f"{base}/run-comparisons?run_a_id={first['id']}&run_b_id={first['id']}"
        ).status_code
        == 422
    )
    client.post(f"{url}/start")
    client.post(f"{base}/evaluation-runs/{second['id']}/start")
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "test")
    execute(client, lambda _: httpx.Response(200, json=completion()))
    execute(client, lambda _: httpx.Response(200, json=completion()))
    database = client.app.state.database
    statements: list[str] = []

    # Reject both evaluator and integration paths during comparison reads.
    def reject(*args: object, **kwargs: object) -> None:
        """Fail if any invocation or evaluation path receives arguments while comparing."""
        pytest.fail("Comparison invoked or evaluated a candidate")

    monkeypatch.setattr("gatekeeper.evaluation.engine.evaluate_attempt", reject)
    monkeypatch.setattr("gatekeeper.execution.worker.evaluate_attempt", reject)
    monkeypatch.setattr(httpx.AsyncClient, "post", reject)
    import sqlite3
    from collections.abc import Generator
    from contextlib import contextmanager

    original = database.connection

    # SQLite enforces the comparison's no-write promise independently of mocked code.
    @contextmanager
    def traced() -> Generator[sqlite3.Connection, None, None]:
        """Yield a traced query-only database connection and return normal cleanup afterward."""
        with original() as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.set_trace_callback(statements.append)
            yield connection

    monkeypatch.setattr(database, "connection", traced)
    response = client.get(query)
    assert response.status_code == 200
    result = RunComparison.model_validate(response.json())
    assert result.availability == "available"
    assert result.run_a.candidate_id == result.run_b.candidate_id
    assert result.aggregate_a.attempts.planned_attempts == 3
    assert result.run_a.settings.attempts_per_scenario == 3
    assert "credential_ref" not in response.text
    assert "system_prompt" not in response.text
    assert not any(
        sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) for sql in statements
    )
    assert sum(sql == "BEGIN" for sql in statements) == 1
    monkeypatch.setattr(database, "connection", original)
    other = create_project(client, "Other")
    assert client.get(query.replace(project, str(other["id"]))).status_code == 404
    assert client.get(query.replace(second["id"], str(uuid4()))).status_code == 404

    with database.connection() as connection:
        connection.execute("DELETE FROM execution_snapshots WHERE run_id = ?", (second["id"],))

    assert client.get(query).json()["reason"] == "frozen_snapshot_unavailable"


# Frozen historical collections must agree, including scenario content and ordering.
@pytest.mark.parametrize("damage", ["collection", "different_dataset", "missing_snapshot"])
def test_historical_and_dataset_boundaries(client: ApiClient, damage: str) -> None:
    """Compare cancelled client runs after damage and verify explicit dataset/history reasons."""
    project, url = execution_fixture(client)
    base = f"/v1/projects/{project}"
    first = client.get(url).json()
    payload = {key: first[key] for key in ("candidate_id", "dataset_id", "run_settings_id")}

    if damage == "different_dataset":
        payload["dataset_id"] = client.post(
            f"{base}/datasets",
            json={
                "name": "Other",
                "scenarios": [
                    {
                        "scenario_key": "other",
                        "name": "Other",
                        "scenario_type": "single_turn",
                        "input": {"user_message": "hello"},
                    }
                ],
            },
        ).json()["id"]

    second = client.post(f"{base}/evaluation-runs", json=payload).json()
    second_url = f"{base}/evaluation-runs/{second['id']}"
    client.post(f"{url}/start")

    if damage != "missing_snapshot":
        client.post(f"{second_url}/start")

    client.post(f"{url}/cancel")
    client.post(f"{second_url}/cancel")

    if damage == "collection":
        with client.app.state.database.connection() as connection:
            row = connection.execute(
                "SELECT configuration FROM execution_snapshots WHERE run_id = ?", (second["id"],)
            ).fetchone()
            frozen = ExecutionSnapshot.model_validate_json(row["configuration"])
            frozen.scenarios.reverse()
            connection.execute(
                "UPDATE execution_snapshots SET configuration = ? WHERE run_id = ?",
                (frozen.model_dump_json(), second["id"]),
            )

    response = client.get(f"{base}/run-comparisons?run_a_id={first['id']}&run_b_id={second['id']}")

    if damage == "different_dataset":
        assert response.status_code == 409
        assert response.json()["detail"]["reason"] == "different_datasets"
    else:
        assert response.status_code == 200
        assert response.json()["availability"] == "unavailable"
        assert response.json()["reason"] == (
            "frozen_snapshot_unavailable"
            if damage == "missing_snapshot"
            else "frozen_scenario_collections_disagree"
        )


# A concurrent commit after the first scoped read cannot change either comparison side.
def test_comparison_consistent_transaction(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Interleave a WAL writer with client comparison reads and verify one consistent snapshot."""
    import sqlite3
    from collections.abc import Generator
    from contextlib import contextmanager

    project, url = execution_fixture(client)
    first = client.get(url).json()
    base = f"/v1/projects/{project}"
    second = client.post(
        f"{base}/evaluation-runs",
        json={key: first[key] for key in ("candidate_id", "dataset_id", "run_settings_id")},
    ).json()
    client.post(f"{url}/start")
    client.post(f"{base}/evaluation-runs/{second['id']}/start")
    client.post(f"{url}/cancel")
    client.post(f"{base}/evaluation-runs/{second['id']}/cancel")
    database = client.app.state.database
    original = database.connection

    with original() as connection:
        connection.execute("PRAGMA journal_mode=WAL")

    changed = []

    # Commit a new frozen repeat policy between metadata and private snapshot reads.
    def trace(sql: str) -> None:
        """Update frozen settings through another connection when sql first reads snapshots."""
        if "FROM execution_snapshots" in sql and not changed:
            changed.append(True)

            with sqlite3.connect(database.path) as writer:
                writer.execute(
                    "UPDATE execution_snapshots SET configuration = "
                    "json_set(configuration, '$.settings.attempts_per_scenario', 1)"
                )

    # Reuse the normal connection lifecycle while enforcing query-only comparison access.
    @contextmanager
    def traced() -> Generator[sqlite3.Connection, None, None]:
        """Yield a query-only traced connection and preserve normal database cleanup."""
        with original() as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.set_trace_callback(trace)
            yield connection

    monkeypatch.setattr(database, "connection", traced)
    response = client.get(f"{base}/run-comparisons?run_a_id={first['id']}&run_b_id={second['id']}")
    assert response.status_code == 200
    assert response.json()["run_a"]["settings"]["attempts_per_scenario"] == 3
    assert response.json()["run_b"]["settings"]["attempts_per_scenario"] == 3
    assert changed == [True]


# Saved tariffs stay attached to observations and are never replaced by deployment prices.
def test_tariff_provenance(frozen: ExecutionSnapshot) -> None:
    """Verify exact costs and provenance warnings for different saved tariffs in frozen runs."""
    from tests.test_pricing import catalog

    left, right = observed(frozen, ["pass"]), observed(frozen, ["pass"])
    left[0].cost = ExecutionCost(estimated_usd=Decimal("0"), pricing_entry=catalog().entries[0])
    right[0].cost = ExecutionCost(
        estimated_usd=Decimal("0.00001"),
        pricing_entry=catalog(catalog_version="changed").entries[0],
    )
    result = compare_runs(uuid4(), metadata(frozen), metadata(frozen), frozen, frozen, left, right)

    assert "different_cost_pricing_provenance" in result.warnings
    assert result.aggregate_a.metrics.estimated_cost_usd.sum == 0
    assert result.aggregate_b.metrics.estimated_cost_usd.sum == Decimal("0.00001")
    assert result.differences.metrics["estimated_cost_usd"]["sum"] == Decimal("0.00001")
