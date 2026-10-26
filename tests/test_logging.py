"""Console activity, durable event ordering, and sensitive-content logging boundaries."""

import asyncio
import logging
from contextlib import suppress
from pathlib import Path
from uuid import UUID

import httpx
import pytest

from gatekeeper.app import create_app
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.execution.worker import run_worker
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.executions import (
    cancel_run,
    claim_attempt,
    claim_run,
    recover_interrupted,
)
from gatekeeper.utils.logging import configure_logging, log_event
from tests.conftest import ApiClient, create_project
from tests.test_executions import completion, execute, execution_fixture


# Select application messages without depending on third-party access logging.
def activity(caplog: pytest.LogCaptureFixture, event: str) -> list[logging.LogRecord]:
    """Return gatekeeper records for event from caplog."""
    return [
        record
        for record in caplog.records
        if record.name.startswith("gatekeeper") and record.getMessage().split(" ", 1)[0] == event
    ]


# Resource events should identify saved objects without serializing their configuration.
def test_creation_activity(client: ApiClient, caplog: pytest.LogCaptureFixture) -> None:
    """Create all resource types with client; assert caplog records IDs and dataset counts."""
    project_id, url = execution_fixture(client)

    for event in (
        "project.created",
        "provider.created",
        "candidate.created",
        "dataset.created",
        "rule_binding.created",
        "run_settings.created",
        "run.created",
    ):
        records = activity(caplog, event)
        assert len(records) == 1
        assert project_id in records[0].getMessage()
        assert records[0].levelno == logging.INFO

    dataset = activity(caplog, "dataset.created")[0].getMessage()
    assert "total_scenarios=6" in dataset
    assert all(f"{kind}=2" in dataset for kind in ("single_turn", "multi_turn", "tool_use"))
    assert url.rsplit("/", 1)[1] in activity(caplog, "run.created")[0].getMessage()
    assert "PRIVATE_EXPECTATION_SENTINEL" not in caplog.text
    assert "PRIVATE_RULE_SENTINEL" not in caplog.text
    assert "Support the customer." not in caplog.text
    assert "My order is ORD-1." not in caplog.text


# A failed dataset transaction must not leave either saved data or a misleading success event.
def test_rollback_and_validation_activity(
    client: ApiClient, caplog: pytest.LogCaptureFixture
) -> None:
    """Force rollback/invalid writes with client; assert safe failure records in caplog."""
    project = create_project(client)
    url = f"/v1/projects/{project['id']}/datasets"

    with client.app.state.database.connection() as connection:
        connection.execute(
            "CREATE TRIGGER reject_scenario BEFORE INSERT ON scenarios "
            "BEGIN SELECT RAISE(ABORT, 'PRIVATE_DATABASE_SENTINEL'); END"
        )

    response = client.post(
        url,
        json={
            "name": "PRIVATE_DATASET_NAME",
            "scenarios": [
                {
                    "scenario_key": "example",
                    "name": "Example",
                    "scenario_type": "single_turn",
                    "input": {"user_message": "PRIVATE_INPUT_SENTINEL"},
                }
            ],
        },
    )
    assert response.status_code == 409
    assert client.get(url).json() == []
    assert not activity(caplog, "dataset.created")
    assert "status=409" in activity(caplog, "api.failed")[-1].getMessage()
    assert 'route="/v1/projects/{project_id}/datasets"' in caplog.text

    response = client.post(url, json={"name": "PRIVATE_INVALID_SENTINEL"})
    assert response.status_code == 422
    assert "status=422" in activity(caplog, "api.failed")[-1].getMessage()
    assert "PRIVATE_" not in caplog.text


# Success events must be emitted only when a separate connection can see committed evidence.
def test_execution_activity_after_commit(
    client: ApiClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Execute using client and monkeypatch; assert caplog event order and committed evidence."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "CREDENTIAL_SENTINEL")
    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    client.post(f"{url}/start")
    original = log_event

    # Check persistence through a separate connection at the moment success is reported.
    def observe(logger: logging.Logger, event: str, **fields: object) -> None:
        """Check committed evidence for event/fields before forwarding to logger; return None."""
        if event == "evidence.saved":
            with client.app.state.database.connection() as connection:
                row = connection.execute(
                    "SELECT status FROM execution_attempts a JOIN execution_evidence e "
                    "ON a.id = e.execution_id WHERE a.id = ?",
                    (str(fields["execution_id"]),),
                ).fetchone()
                assert row is not None and row["status"] == "completed"

        original(logger, event, **fields)

    monkeypatch.setattr("gatekeeper.execution.worker.log_event", observe)

    # Return content that must remain in evidence rather than application logs.
    def handler(_: httpx.Request) -> httpx.Response:
        """Return a completion containing sensitive sentinels for the unused request."""
        return httpx.Response(200, json=completion("PRIVATE_RESPONSE CREDENTIAL_SENTINEL"))

    execute(client, handler)
    attempts = client.get(f"{url}/attempts").json()
    assert len(activity(caplog, "run.queued")) == 1
    assert len(activity(caplog, "run.started")) == 1
    assert len(activity(caplog, "run.completed")) == 1
    assert len(activity(caplog, "attempt.started")) == 18
    assert len(activity(caplog, "attempt.completed")) == 18
    assert len(activity(caplog, "provider.request_started")) == 18
    assert len(activity(caplog, "provider.response_received")) == 18

    messages = [r.getMessage() for r in caplog.records if r.name.startswith("gatekeeper")]
    for attempt in attempts:
        execution_id = attempt["id"]
        events = [message.split(" ", 1)[0] for message in messages if execution_id in message]
        assert events == [
            "attempt.started",
            "provider.request_started",
            "provider.response_received",
            "evidence.saved",
            "attempt.completed",
        ]
        started = next(m for m in messages if m.startswith("attempt.started") and execution_id in m)
        assert attempt["scenario_key"] in started
        assert attempt["scenario_id"] in started
        assert f"attempt_number={attempt['attempt_number']}" in started

    assert "CREDENTIAL_SENTINEL" not in caplog.text
    assert "PRIVATE_RESPONSE" not in caplog.text
    assert "PRIVATE_EXPECTATION_SENTINEL" not in caplog.text


# Operational failures need severity and stable codes without raw provider or exception text.
@pytest.mark.parametrize("failure", ["timeout", "http", "internal"])
def test_attempt_failure_activity(
    client: ApiClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    """Inject failure with monkeypatch/client; assert safe codes and severity in caplog."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "CREDENTIAL_SENTINEL")
    _, url = execution_fixture(client)
    client.post(f"{url}/start")

    # Simulate failures containing sensitive details that must never enter activity logs.
    def handler(request: httpx.Request) -> httpx.Response:
        """Return an HTTP failure or raise a simulated transport/internal error for request."""
        if failure == "timeout":
            raise httpx.ReadTimeout("PRIVATE_EXCEPTION CREDENTIAL_SENTINEL", request=request)

        if failure == "internal":
            raise RuntimeError("PRIVATE_EXCEPTION CREDENTIAL_SENTINEL")

        return httpx.Response(401, json={"error": "PRIVATE_RESPONSE CREDENTIAL_SENTINEL"})

    execute(client, handler)
    event = "attempt.timed_out" if failure == "timeout" else "attempt.failed"
    records = activity(caplog, event)
    assert len(records) == (18 if failure == "timeout" else 1)
    assert records[0].levelno == (logging.WARNING if failure == "timeout" else logging.ERROR)
    assert "error_code=" in records[0].getMessage()

    if failure != "timeout":
        assert "skipped_attempts=17" in activity(caplog, "run.failed")[0].getMessage()

    if failure == "internal":
        assert 'exception_type="RuntimeError"' in caplog.text
        assert "stack=" in caplog.text

    assert "CREDENTIAL_SENTINEL" not in caplog.text
    assert "PRIVATE_EXCEPTION" not in caplog.text
    assert "PRIVATE_RESPONSE" not in caplog.text


# Tool normalization issues should be visible without exposing names or argument values.
def test_tool_issue_activity(
    client: ApiClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Run malformed requested calls using client/monkeypatch; assert safe warnings in caplog."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "CREDENTIAL_SENTINEL")
    _, url = execution_fixture(client)
    client.post(f"{url}/start")

    # Return a declared function request with invalid argument JSON.
    def handler(_: httpx.Request) -> httpx.Response:
        """Return an invalid tool request for the unused HTTP request."""
        return httpx.Response(
            200,
            json=completion(
                None,
                [
                    {
                        "id": "call",
                        "type": "function",
                        "function": {
                            "name": "lookup_order",
                            "arguments": "{PRIVATE_ARGUMENT_SENTINEL",
                        },
                    }
                ],
            ),
        )

    execute(client, handler)
    record = activity(caplog, "evidence.saved")[0]
    assert record.levelno == logging.WARNING
    assert "invalid_argument_json" in record.getMessage()
    assert "tool_request_count=1" in record.getMessage()
    assert "PRIVATE_ARGUMENT_SENTINEL" not in caplog.text


# Cancellation should retain one real transition event even when requested repeatedly.
@pytest.mark.parametrize("during_request", [False, True])
def test_cancellation_activity(
    client: ApiClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
    during_request: bool,
) -> None:
    """Cancel through client before/during execution; assert caplog contains one transition."""
    monkeypatch.setenv("GATEKEEPER_CREDENTIAL_TEST", "secret")
    project_id, url = execution_fixture(client)
    run_id = UUID(url.rsplit("/", 1)[1])
    client.post(f"{url}/start")

    if during_request:
        # Simulate a cancellation request while waiting for a provider response.
        def handler(_: httpx.Request) -> httpx.Response:
            """Cancel the active run and return a completion for the unused request."""
            cancel_run(client.app.state.database, UUID(project_id), run_id)
            return httpx.Response(200, json=completion())

        execute(client, handler)
    else:
        client.post(f"{url}/cancel")

    client.post(f"{url}/cancel")
    client.post(f"{url}/start")
    assert len(activity(caplog, "run.cancel_requested")) == 1
    assert len(activity(caplog, "run.cancelled")) == 1
    assert f"skipped_attempts={18 - int(during_request)}" in caplog.text


# Recovery emits one warning per interrupted run and does not replay or repeatedly log it.
def test_recovery_activity(client: ApiClient, caplog: pytest.LogCaptureFixture) -> None:
    """Interrupt a run in client storage; assert caplog recovery counts and idempotence."""
    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    database = client.app.state.database
    claimed = claim_run(database)
    assert claimed is not None
    claim_attempt(database, claimed[0])

    recover_interrupted(database)
    recover_interrupted(database)
    record = activity(caplog, "run.interrupted")[0]
    assert record.levelno == logging.WARNING
    assert "affected_attempts=1" in record.getMessage()
    assert "skipped_attempts=17" in record.getMessage()
    assert len(activity(caplog, "run.interrupted")) == 1
    assert len(activity(caplog, "run.failed")) == 1


# Unexpected API errors should retain debugging locations without request or exception content.
def test_unexpected_api_failure(
    client: ApiClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Inject an API error with client/monkeypatch; assert safe failure metadata in caplog."""

    # Simulate a storage failure whose exception contains submitted content.
    def fail(_: object) -> None:
        """Raise a sensitive simulated storage error for the unused project payload."""
        raise RuntimeError("PRIVATE_EXCEPTION_SENTINEL")

    monkeypatch.setattr("gatekeeper.api.projects.uuid4", lambda: fail(None))
    with pytest.raises(RuntimeError):
        client.post("/v1/projects", json={"name": "PRIVATE_REQUEST_SENTINEL"})

    record = activity(caplog, "api.failed")[0]
    assert record.levelno == logging.ERROR
    assert 'exception_type="RuntimeError"' in record.getMessage()
    assert 'route="/v1/projects"' in record.getMessage()
    assert "PRIVATE_" not in caplog.text


# Lifecycle logs should be useful without an empty-queue message on each poll.
def test_worker_lifecycle_and_idle_activity(
    client: ApiClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Run client lifespan; assert lifecycle events and quiet polling in caplog."""

    # Let the worker check the empty queue more than once before shutting it down.
    async def serve() -> None:
        """Enter the test application lifespan briefly, then return None."""
        async with client.app.router.lifespan_context(client.app):
            await asyncio.sleep(0.55)

    asyncio.run(serve())
    events = [r.getMessage() for r in caplog.records if r.name.startswith("gatekeeper")]
    assert events == [
        "application.starting",
        "application.ready",
        "worker.started",
        "application.shutdown_started",
        "worker.stopped",
        "application.shutdown_completed",
    ]


# Failure while processing a run should log safe context and the resulting durable state.
def test_worker_failure_activity(
    client: ApiClient,
    caplog: pytest.LogCaptureFixture,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Inject a worker failure using monkeypatch/client; assert persisted failure logs in caplog."""
    _, url = execution_fixture(client)
    client.post(f"{url}/start")
    failed = asyncio.Event()

    # Fail after starting an attempt so the worker must finalize both attempt and run.
    async def fail(
        database: Database, client: httpx.AsyncClient, run_id: str, config: ExecutionSnapshot
    ) -> None:
        """Use run_id to start an attempt, then raise; other worker arguments are unused."""
        claim_attempt(database, run_id)
        failed.set()
        raise RuntimeError("PRIVATE_WORKER_SENTINEL")

    monkeypatch.setattr("gatekeeper.execution.worker.execute_run", fail)

    # Await the injected failure before cancelling the otherwise infinite polling loop.
    async def serve() -> None:
        """Run the test worker until failure is handled, then cancel it and return None."""
        async with httpx.AsyncClient() as transport:
            worker = asyncio.create_task(run_worker(client.app.state.database, transport))
            await asyncio.wait_for(failed.wait(), 1)
            worker.cancel()

            with suppress(asyncio.CancelledError):
                await worker

    asyncio.run(serve())
    assert len(activity(caplog, "worker.run_picked_up")) == 1
    assert len(activity(caplog, "worker.run_failed")) == 1
    assert "skipped_attempts=17" in activity(caplog, "run.failed")[0].getMessage()
    assert "PRIVATE_WORKER_SENTINEL" not in caplog.text
    assert client.get(url).json()["status"] == "failed"


# Repeated application construction must preserve host logging and avoid duplicate output.
def test_logging_configuration(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Build apps with tmp_path/monkeypatch; assert one handler and filtered caplog events."""
    logger = logging.getLogger("gatekeeper")
    handlers = list(logger.handlers)
    root_handlers = list(logging.getLogger().handlers)
    uvicorn_handlers = list(logging.getLogger("uvicorn").handlers)
    monkeypatch.setenv("GATEKEEPER_LOG_LEVEL", "WARNING")

    try:
        create_app(tmp_path / "first.db")
        create_app(tmp_path / "second.db")
        assert logger.handlers == handlers
        assert logging.getLogger().handlers == root_handlers
        assert logging.getLogger("uvicorn").handlers == uvicorn_handlers
        log_event(logging.getLogger("gatekeeper.test"), "test.hidden")
        log_event(logging.getLogger("gatekeeper.test"), "test.visible", level=logging.WARNING)
        assert not activity(caplog, "test.hidden")
        assert len(activity(caplog, "test.visible")) == 1

        monkeypatch.setenv("GATEKEEPER_LOG_LEVEL", "invalid")
        configure_logging()
        assert logger.level == logging.INFO
    finally:
        logger.setLevel(logging.INFO)
