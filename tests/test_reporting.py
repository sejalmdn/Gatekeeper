"""Frozen aggregation semantics and consistent, read-only reporting boundaries."""

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from uuid import uuid4

import httpx
import pytest

from gatekeeper.contracts.evaluation_runs import EvaluationRunStatus
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.contracts.reporting import ReportingAttempt, RunSummary
from gatekeeper.reporting.aggregation import aggregate_run, metrics
from tests.conftest import ApiClient, create_project
from tests.test_evaluations import binding
from tests.test_executions import completion, execute, execution_fixture


# Reuse real frozen configuration while isolating one scenario for pure semantic tests.
@pytest.fixture
def snapshot(client: ApiClient) -> ExecutionSnapshot:
    """Queue a run using client and return a one-scenario frozen snapshot."""
    _, url = execution_fixture(client)
    assert client.post(f"{url}/start").status_code == 200

    with client.app.state.database.connection() as connection:
        row = connection.execute("SELECT configuration FROM execution_snapshots").fetchone()

    frozen = ExecutionSnapshot.model_validate_json(row["configuration"])
    frozen.scenarios = frozen.scenarios[:1]
    frozen.effective_rules = {str(frozen.scenarios[0].id): [binding("response.json_valid", {})]}
    return frozen


# Build coherent saved inputs without re-running evaluation in the aggregation component.
def attempts(snapshot: ExecutionSnapshot, verdicts: list[str]) -> list[ReportingAttempt]:
    """Build completed attempts for snapshot with verdicts mirrored in required-rule outcomes."""
    rules = snapshot.effective_rules.get(str(snapshot.scenarios[0].id), [])

    return [
        ReportingAttempt.model_validate(
            {
                "scenario_id": snapshot.scenarios[0].id,
                "attempt_number": index + 1,
                "status": "completed",
                "verdict": verdict,
                "evaluator_version": "test-v1",
                "has_evidence": True,
                "outcomes": {str(rule.id): verdict for rule in rules},
            }
        )
        for index, verdict in enumerate(verdicts)
    ]


# Keep report construction concise while exercising the public pure entry point.
def report(
    snapshot: ExecutionSnapshot, observed: list[ReportingAttempt], status: str = "completed"
) -> RunSummary:
    """Return aggregation of observed against snapshot with the selected execution status."""
    return aggregate_run(uuid4(), uuid4(), EvaluationRunStatus(status), snapshot, observed)


# Check threshold equality, extremes, repeat stability, and the planned denominator.
@pytest.mark.parametrize(
    ("verdicts", "threshold", "assessment", "stability"),
    [
        (["pass"] * 3, 1, "met", "consistent_pass"),
        (["fail"] * 3, 1, "not_met", "consistent_fail"),
        (["fail"] * 3, 0, "met", "consistent_fail"),
        (["pass", "pass", "fail"], 2 / 3, "met", "flaky"),
        (["pass", "pass", "fail"], 0.8, "not_met", "flaky"),
        (["pass"], 1, "met", "insufficient_repeats"),
    ],
)
def test_threshold_and_stability(
    snapshot: ExecutionSnapshot,
    verdicts: list[str],
    threshold: float,
    assessment: str,
    stability: str,
) -> None:
    """Verify verdicts under threshold yield the expected assessment and repeat classification."""
    snapshot.settings.attempts_per_scenario = len(verdicts)
    snapshot.settings.pass_threshold = threshold
    result = report(snapshot, attempts(snapshot, verdicts))
    scenario = result.scenarios[0]

    assert scenario.assessment == assessment
    assert scenario.stability == stability
    assert scenario.attempts.pass_rate == verdicts.count("pass") / len(verdicts)
    assert RunSummary.model_validate_json(result.model_dump_json()) == result


# Unknown evidence must override an otherwise satisfied pass threshold.
@pytest.mark.parametrize(
    "change",
    [
        {"status": "failed"},
        {"status": "timed_out"},
        {"status": "skipped"},
        {"has_evidence": False},
        {"evaluator_version": None},
        {"verdict": "cannot_evaluate"},
        {"verdict": "error"},
        {"outcomes": {}},
        {"automatic_tool_validation": [{"outcome": "error", "reason": "x", "explanation": "x"}]},
    ],
)
def test_unknown_overrides_threshold(
    snapshot: ExecutionSnapshot, change: dict[str, object]
) -> None:
    """Assert a single unknown change makes a finished scenario inconclusive despite two passes."""
    snapshot.settings.pass_threshold = 0.5
    observed = attempts(snapshot, ["pass"] * 3)
    observed[-1] = ReportingAttempt.model_validate({**observed[-1].model_dump(), **change})
    scenario = report(snapshot, observed).scenarios[0]

    assert scenario.assessment == "inconclusive"
    assert scenario.stability == "inconclusive"
    assert scenario.reasons


# Running work stays pending while missing evaluations in terminal runs stay inconclusive.
@pytest.mark.parametrize("status", ["pending", "running", "cancelled", "failed", "completed"])
def test_missing_work(snapshot: ExecutionSnapshot, status: str) -> None:
    """Verify missing planned attempts and completed-but-ungraded work for each run status."""
    observed = attempts(snapshot, ["pass"] * 3)
    observed[-1].evaluator_version = None
    expected = "pending" if status in {"pending", "running"} else "inconclusive"

    assert report(snapshot, observed, status).scenarios[0].assessment == expected
    assert report(snapshot, observed[:2], status).scenarios[0].assessment == expected
    assert report(snapshot, [], status).scenarios[0].attempts.pass_rate == 0


# Missing required rules cannot be turned into success by scores or baseline checks.
def test_no_required_and_empty(snapshot: ExecutionSnapshot) -> None:
    """Verify absent required rules and empty scenario sets preserve unknown and null rates."""
    snapshot.effective_rules = {}
    scenario = report(snapshot, attempts(snapshot, ["pass"] * 3)).scenarios[0]

    assert scenario.assessment == "inconclusive"
    assert "no_required_checks" in scenario.reasons
    assert scenario.score.reason == "no_scored_rules"
    snapshot.scenarios = []
    result = report(snapshot, [])

    assert result.aggregates.attempts.pass_rate is None
    assert result.aggregates.score.coverage is None
    assert result.aggregates.metrics.latency_ms.sum is None


# Scored weights and completeness are independent of required assessment and baseline checks.
def test_weights_and_binding_grouping(snapshot: ExecutionSnapshot) -> None:
    """Verify low pass plus critical fail scores 0.2, and missing scored results null the score."""
    rules = snapshot.effective_rules.get(str(snapshot.scenarios[0].id), [])
    low = binding("response.json_valid", {}, "scored")
    low.severity = "low"
    critical = binding("response.json_valid", {}, "scored")
    critical.severity = "critical"
    informational = binding("response.json_valid", {}, "informational")
    rules.extend([low, critical, informational])
    observed = attempts(snapshot, ["pass"] * 3)

    for attempt in observed:
        attempt.outcomes[str(critical.id)] = "fail"

    result = report(snapshot, observed)
    assert result.aggregates.score.weighted_score == 0.2
    assert result.aggregates.score.planned_weight == 15
    assert result.scenarios[0].assessment == "met"
    assert result.aggregates.attempts.planned_attempts == 3
    assert result.aggregates.attempts.passing_attempts == 3
    del observed[0].outcomes[str(low.id)]
    score = report(snapshot, observed).aggregates.score

    assert score.weighted_score is None
    assert score.known_weight == 14
    assert score.passing_weight == 2
    assert score.coverage == 14 / 15
    assert score.reason == "incomplete_scored_results"


# Operational metrics exclude failed invocations and require both token fields for totals.
def test_metric_observations(snapshot: ExecutionSnapshot) -> None:
    """Distinguish zero, missing, partial usage, and unsuccessful or unexecuted observations."""
    observed = attempts(snapshot, ["pass"] * 3)
    observed[0].duration_ms = 0
    observed[0].input_tokens = 0
    observed[0].output_tokens = 0
    observed[1].input_tokens = 8
    observed[2].status = "failed"
    observed[2].input_tokens = 100
    observed[2].duration_ms = 100
    result = metrics(observed, 4)

    assert result.latency_ms.observed_count == 1
    assert result.latency_ms.missing_count == 1
    assert result.latency_ms.sum == result.latency_ms.mean == 0
    assert result.input_tokens.mean == 4
    assert result.total_tokens.observed_count == 1
    assert result.total_tokens.missing_count == 1
    assert result.total_tokens.sum == 0
    assert result.excluded_unsuccessful_attempts == 1
    assert result.excluded_unexecuted_attempts == 1


# Verify real stored evidence and results are reported with scoped access and no mutations.
def test_summary_api(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify frozen settings, metrics, serialization, and isolation after mocked execution."""
    project, url = execution_fixture(client)
    unavailable = client.get(f"{url}/summary").json()

    assert unavailable["availability"] == "unavailable"
    assert unavailable["aggregates"] is None
    assert client.post(f"{url}/start").status_code == 200
    assert client.get(f"{url}/summary").json()["aggregates"]["attempts"]["planned_attempts"] == 18
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "test-secret")
    execute(
        client, lambda request: httpx.Response(200, json=completion("PRIVATE_EXPECTATION_SENTINEL"))
    )
    database = client.app.state.database

    with database.connection() as connection:
        connection.execute("UPDATE run_settings SET attempts_per_scenario = 1, pass_threshold = 0")

    # Reject provider requests or evaluator calls during report reads.
    def reject_execution(*args: object, **kwargs: object) -> None:
        """Reject invocation or evaluation arguments; report reads must never call this function."""
        pytest.fail("Summary attempted invocation or evaluation")

    monkeypatch.setattr(httpx.AsyncClient, "post", reject_execution)
    monkeypatch.setattr("gatekeeper.execution.worker.evaluate_attempt", reject_execution)
    monkeypatch.setattr("gatekeeper.evaluation.engine.evaluate_attempt", reject_execution)
    response = client.get(f"{url}/summary")
    assert response.status_code == 200
    result = RunSummary.model_validate(response.json())

    assert result.aggregates.attempts.planned_attempts == 18
    assert all(scenario.pass_threshold == 0.8 for scenario in result.scenarios)
    assert result.evaluator_versions == ["deterministic-v1"]
    assert result.aggregates.metrics.input_tokens.sum == 216
    assert result.aggregates.metrics.output_tokens.sum == 0
    assert "PRIVATE_EXPECTATION_SENTINEL" not in response.text
    assert "parameters" not in response.text
    other = create_project(client, "Other")
    run_id = url.rsplit("/", 1)[-1]

    assert (
        client.get(f"/v1/projects/{other['id']}/evaluation-runs/{run_id}/summary").status_code
        == 404
    )
    assert (
        client.get(f"/v1/projects/{project}/evaluation-runs/{uuid4()}/summary").status_code == 404
    )


# A writer between batch reads cannot change the report's transaction snapshot.
def test_consistent_read(client: ApiClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Interleave a WAL writer during reporting and verify consistent, read-only results."""
    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    database = client.app.state.database
    original = database.connection

    with original() as connection:
        connection.execute("PRAGMA journal_mode=WAL")

    writes = []

    # Trigger a concurrent commit after the report has already established its snapshot.
    def trace(sql: str) -> None:
        """Write once when sql reads attempts, tracking any report mutations as test failures."""
        if sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")):
            writes.append(sql)

        if "FROM execution_attempts a" in sql:
            with sqlite3.connect(database.path) as writer:
                writer.execute("UPDATE execution_attempts SET status = 'skipped'")

    # Keep all reporting SQL read-only while preserving the production connection lifecycle.
    @contextmanager
    def traced_connection() -> Generator[sqlite3.Connection, None, None]:
        """Yield a query-only traced connection; return to the production cleanup afterward."""
        with original() as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.set_trace_callback(trace)
            yield connection

    monkeypatch.setattr(database, "connection", traced_connection)
    result = client.get(f"{url}/summary").json()

    assert result["aggregates"]["attempts"]["execution_status_counts"]["pending"] == 18
    assert result["aggregates"]["attempts"]["execution_status_counts"]["skipped"] == 0
    assert writes == []

    with original() as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM execution_attempts WHERE status = 'skipped'"
            ).fetchone()[0]
            == 18
        )


# Public contracts reject invalid report boundaries rather than serializing impossible rates.
def test_reporting_contract_validation() -> None:
    """Reject negative observations and attempt numbers at the reporting input boundary."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ReportingAttempt(scenario_id=uuid4(), attempt_number=0, status="completed")

    with pytest.raises(ValidationError):
        ReportingAttempt(scenario_id=uuid4(), attempt_number=1, status="completed", duration_ms=-1)


# Run weights sum planned slots and group shared defaults only once by binding identity.
def test_run_score_sums_weights(snapshot: ExecutionSnapshot) -> None:
    """Combine two scenarios sharing a default and verify weighted totals and grouping."""
    first = snapshot.scenarios[0]
    second = first.model_copy(update={"id": uuid4(), "scenario_key": "second"})
    snapshot.scenarios.append(second)
    shared = binding("response.json_valid", {}, "scored")
    shared.severity = "low"
    rules = snapshot.effective_rules[str(first.id)]
    rules.append(shared)
    snapshot.effective_rules[str(second.id)] = rules
    observed = attempts(snapshot, ["pass"] * 3)
    other = [attempt.model_copy(update={"scenario_id": second.id}) for attempt in observed]
    other[-1] = other[-1].model_copy(deep=True)
    other[-1].outcomes[str(shared.id)] = "fail"
    result = report(snapshot, observed + other)

    assert result.aggregates.attempts.planned_attempts == 6
    assert result.aggregates.score.planned_weight == 6
    assert result.aggregates.score.passing_weight == 5
    assert result.aggregates.score.weighted_score == 5 / 6
    assert len(result.aggregates.bindings) == 2
    assert all(item.planned_results == 6 for item in result.aggregates.bindings)


# Saved verdict precedence cannot hide unknown bound checks from scenario assessment.
@pytest.mark.parametrize("outcome", ["error", "cannot_evaluate"])
def test_unknown_rule_with_failing_verdict(snapshot: ExecutionSnapshot, outcome: str) -> None:
    """Keep an error or missing evidence inconclusive even when a saved verdict says fail."""
    observed = attempts(snapshot, ["pass", "pass", "fail"])
    rule_id = str(snapshot.effective_rules[str(snapshot.scenarios[0].id)][0].id)
    observed[-1].outcomes[rule_id] = outcome

    assert report(snapshot, observed).scenarios[0].assessment == "inconclusive"


# All terminal paths store exactly the report produced by the shared aggregator.
@pytest.mark.parametrize("ending", ["completed", "fatal", "cancelled", "interrupted", "unstarted"])
def test_terminal_summary_matches_aggregation(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, ending: str
) -> None:
    """Finish client runs through ending and compare persisted reports with live aggregation."""
    from uuid import UUID

    from gatekeeper.persistence.executions import claim_attempt, claim_run, recover_interrupted
    from gatekeeper.persistence.reporting import compute_summary

    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    project, url = execution_fixture(client)
    database = client.app.state.database
    run_id = UUID(url.rsplit("/", 1)[-1])

    if ending != "unstarted":
        client.post(f"{url}/start")

    if ending in {"cancelled", "unstarted"}:
        client.post(f"{url}/cancel")
    elif ending == "interrupted":
        claimed = claim_run(database)
        assert claimed is not None
        assert claim_attempt(database, claimed[0]) is not None
        recover_interrupted(database)
    else:
        code = 401 if ending == "fatal" else 200
        execute(client, lambda _: httpx.Response(code, json=completion()))

    result = RunSummary.model_validate(client.get(f"{url}/summary").json())

    with database.connection() as connection:
        expected = compute_summary(connection, UUID(project), run_id, result.execution_status)
        row = connection.execute("SELECT * FROM evaluation_run_summaries").fetchone()

    assert result == expected == RunSummary.model_validate_json(row["summary"])
    assert row["generated_at"]

    if ending == "fatal":
        assert result.aggregates.attempts.evaluation_verdict_counts["cannot_evaluate"] == 1
        assert result.evaluator_versions == ["deterministic-v1"]

    if ending == "unstarted":
        assert result.reason == "frozen_snapshot_unavailable"


# Finished requests use only stored reports and cannot repair missing or invalid reports.
@pytest.mark.parametrize("damage", [None, "missing", "invalid", "wrong_owner"])
def test_terminal_reads_never_compute_or_write(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, damage: str | None
) -> None:
    """Damage saved client reports and reject aggregation, evidence reads, or writes on GET."""
    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    client.post(f"{url}/cancel")
    database = client.app.state.database
    expected = client.get(f"{url}/summary").json()

    with database.connection() as connection:
        if damage == "missing":
            connection.execute("DELETE FROM evaluation_run_summaries")
        elif damage == "invalid":
            connection.execute("UPDATE evaluation_run_summaries SET summary = '{}'")
        elif damage == "wrong_owner":
            connection.execute(
                "UPDATE evaluation_run_summaries "
                "SET summary = json_set(summary, '$.project_id', ?)",
                (str(uuid4()),),
            )

    # Make fallback aggregation an immediate test failure.
    def reject(*args: object, **kwargs: object) -> None:
        """Reject unexpected report computation for terminal requests regardless of arguments."""
        pytest.fail("Terminal GET attempted aggregation")

    monkeypatch.setattr("gatekeeper.persistence.reporting.compute_summary", reject)
    original = database.connection
    statements = []

    # Query-only SQLite enforces read-only endpoint behavior independently of mocks.
    @contextmanager
    def traced() -> Generator[sqlite3.Connection, None, None]:
        """Yield a traced read-only connection and preserve original cleanup."""
        with original() as connection:
            connection.execute("PRAGMA query_only=ON")
            connection.set_trace_callback(statements.append)
            yield connection

    monkeypatch.setattr(database, "connection", traced)

    for _ in range(2):
        response = client.get(f"{url}/summary")
        assert response.status_code == 200
        result = response.json()

        if damage is None:
            assert result == expected
        else:
            assert result["reason"] == "stored_summary_unavailable"
            assert result["availability"] == "unavailable"
            assert result["aggregates"] is None
            assert result["scenarios"] == []

    assert not any("execution_attempts" in sql or "execution_evidence" in sql for sql in statements)
    assert not any("execution_snapshots" in sql for sql in statements)


# Reporting failures cannot roll back completed execution or its saved evaluations.
@pytest.mark.parametrize("failure", ["generation", "storage"])
def test_summary_failure_preserves_execution(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    """Inject failure at the specified report stage and verify client execution survives."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    _, url = execution_fixture(client)
    database = client.app.state.database
    client.post(f"{url}/start")

    if failure == "storage":
        with database.connection() as connection:
            connection.execute(
                "CREATE TRIGGER reject_summary BEFORE INSERT ON evaluation_run_summaries "
                "BEGIN SELECT RAISE(ABORT, 'private storage error'); END"
            )
    else:
        # Mutate within the savepoint before raising to verify reporting work rolls back.
        def fail(connection: sqlite3.Connection, *args: object) -> RunSummary:
            """Mutate connection then raise; arguments represent unused reporting identities."""
            connection.execute("DELETE FROM rule_evaluation_results")
            raise RuntimeError("private generation error")

        monkeypatch.setattr("gatekeeper.persistence.reporting.compute_summary", fail)

    execute(client, lambda _: httpx.Response(200, json=completion()))
    assert client.get(url).json()["status"] == "completed"

    with database.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM execution_evidence").fetchone()[0] == 18
        assert connection.execute("SELECT COUNT(*) FROM attempt_evaluations").fetchone()[0] == 18
        assert connection.execute("SELECT COUNT(*) FROM rule_evaluation_results").fetchone()[0] > 0
        assert (
            connection.execute("SELECT COUNT(*) FROM evaluation_run_summaries").fetchone()[0] == 0
        )

    assert client.get(f"{url}/summary").json()["reason"] == "stored_summary_unavailable"


# Finalization is stable, while late supported result writes refresh terminal reports atomically.
def test_finalization_idempotency_and_late_evaluation(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Finalize a client run repeatedly and save a late evaluation to replace stale reports."""
    from uuid import UUID

    from gatekeeper.contracts.evaluations import AttemptEvaluation
    from gatekeeper.contracts.executions import ExecutionAttempt, ExecutionEvidence
    from gatekeeper.execution.worker import AttemptOutcome, save_outcome
    from gatekeeper.persistence.evaluations import save_evaluation
    from gatekeeper.persistence.executions import (
        attempt_from_row,
        claim_attempt,
        claim_run,
        finish_run,
    )
    from gatekeeper.persistence.records import timestamp

    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    database = client.app.state.database
    run_id, _ = claim_run(database)
    attempt = claim_attempt(database, run_id)
    assert attempt is not None

    with database.connection() as connection:
        finish_run(connection, run_id, "failed")
        original = dict(connection.execute("SELECT * FROM evaluation_runs").fetchone())
        stored = dict(connection.execute("SELECT * FROM evaluation_run_summaries").fetchone())
        assert finish_run(connection, run_id, "completed") == 0
        assert dict(connection.execute("SELECT * FROM evaluation_runs").fetchone()) == original
        assert (
            dict(connection.execute("SELECT * FROM evaluation_run_summaries").fetchone()) == stored
        )

    # Late provider evidence uses the supported storage operation and replaces the old summary.
    def save_late_evidence(observed: ExecutionAttempt) -> None:
        """Save completed evidence for observed and refresh its terminal report atomically."""
        evidence = ExecutionEvidence(
            execution_id=observed.id,
            run_id=observed.run_id,
            scenario_id=observed.scenario_id,
            attempt_number=observed.attempt_number,
            status="completed",
            started_at=timestamp(),
            completed_at=timestamp(),
            requested_model="test",
            provider_type="openrouter",
            adapter="openai_chat_completions",
            input_tokens=7,
        )
        save_outcome(database, AttemptOutcome(evidence, None, None))

    save_late_evidence(attempt)
    assert client.get(f"{url}/summary").json()["aggregates"]["metrics"]["input_tokens"]["sum"] == 7
    evaluation = AttemptEvaluation(
        execution_id=attempt.id,
        verdict="cannot_evaluate",
        evaluator_version="late-v1",
        evaluated_at=timestamp(),
        automatic_tool_validation=[],
        rule_results=[],
    )
    save_evaluation(database, UUID(run_id), evaluation)
    assert client.get(f"{url}/summary").json()["evaluator_versions"] == ["late-v1"]

    # A second late write must invalidate even when regenerating its replacement fails.
    def fail(*args: object) -> RunSummary:
        """Reject report generation arguments to exercise invalidation on regeneration failure."""
        raise RuntimeError("report unavailable")

    with database.connection() as connection:
        other = connection.execute(
            "SELECT * FROM execution_attempts WHERE id != ? LIMIT 1", (str(attempt.id),)
        ).fetchone()

    save_late_evidence(attempt_from_row(other))
    monkeypatch.setattr("gatekeeper.persistence.reporting.compute_summary", fail)
    evaluation.execution_id = UUID(other["id"])
    save_evaluation(database, UUID(run_id), evaluation)
    assert client.get(f"{url}/summary").json()["reason"] == "stored_summary_unavailable"


# Terminal state and report become visible together, while active GETs recompute without writes.
def test_summary_publication_transaction(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Observe client reporting transactions from a second connection across finalization."""
    from gatekeeper.persistence import reporting
    from gatekeeper.persistence.executions import claim_run, finish_run

    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    database = client.app.state.database
    run_id, _ = claim_run(database)
    original = reporting.compute_summary
    statuses = []

    # A separate reader can see neither the terminal state nor its report before commit.
    def observe(connection: sqlite3.Connection, *args: object, **kwargs: object) -> RunSummary:
        """Observe committed state separately, then aggregate caller inputs in connection."""
        with database.connection() as reader:
            statuses.append(reader.execute("SELECT status FROM evaluation_runs").fetchone()[0])
            assert (
                reader.execute("SELECT COUNT(*) FROM evaluation_run_summaries").fetchone()[0] == 0
            )

        return original(connection, *args, **kwargs)

    monkeypatch.setattr(reporting, "compute_summary", observe)
    client.get(f"{url}/summary")
    client.get(f"{url}/summary")

    with database.connection() as connection:
        finish_run(connection, run_id, "completed")

    assert statuses == ["running", "running", "running"]
    assert client.get(url).json()["status"] == "completed"
    assert client.get(f"{url}/summary").json()["execution_status"] == "completed"
    assert statuses == ["running", "running", "running"]


# Fatal invocation evaluation failures finalize through the worker with the available evidence.
@pytest.mark.parametrize("failure", ["evaluation", "storage"])
def test_worker_failure_summary(
    client: ApiClient, monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    """Break fatal attempt evaluation at failure and verify client reports stay inconclusive."""
    import asyncio
    from uuid import UUID

    from gatekeeper.persistence.reporting import compute_summary

    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    project, url = execution_fixture(client)
    client.post(f"{url}/start")
    database = client.app.state.database

    # An authentication failure makes this attempt fatal before the evaluator fails separately.
    async def send(*args: object) -> httpx.Response:
        """Accept invocation arguments and return a fatal mocked authentication response."""
        return httpx.Response(401, json={"error": "authentication failure"})

    monkeypatch.setattr("gatekeeper.execution.worker.send_request", send)

    if failure == "storage":
        with database.connection() as connection:
            connection.execute(
                "CREATE TRIGGER reject_evaluation BEFORE INSERT ON attempt_evaluations "
                "BEGIN SELECT RAISE(ABORT, 'test failure'); END"
            )
    else:
        # Exceptions before persistence must still retain the saved invocation evidence.
        def reject(*args: object) -> None:
            """Reject evaluator inputs to exercise the worker's unexpected failure finalizer."""
            raise RuntimeError("test evaluation failure")

        monkeypatch.setattr("gatekeeper.execution.worker.evaluate_attempt", reject)

    # Exercise production failure handling rather than calling its persistence helper directly.
    async def run() -> None:
        """Run the client's worker until terminal state is committed, then shut it down."""
        async with client.app.router.lifespan_context(client.app):
            for _ in range(200):
                with database.connection() as connection:
                    status = connection.execute("SELECT status FROM evaluation_runs").fetchone()[0]

                if status == "failed":
                    return

                await asyncio.sleep(0.01)

            pytest.fail("Worker did not finalize the failed run")

    asyncio.run(run())
    result = RunSummary.model_validate(client.get(f"{url}/summary").json())

    with database.connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM execution_evidence").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM attempt_evaluations").fetchone()[0] == 0
        assert result == compute_summary(
            connection, UUID(project), UUID(url.rsplit("/", 1)[-1]), result.execution_status
        )

    assert result.execution_status == "failed"
    assert result.aggregates.attempts.evaluation_verdict_counts["not_evaluated"] == 18
    assert all(item.assessment == "inconclusive" for item in result.scenarios)
