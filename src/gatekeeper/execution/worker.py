"""Sequential offline execution with durable progress and conservative interruption recovery."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from time import perf_counter

import httpx
from fastapi import FastAPI

from gatekeeper.contracts.candidates import Candidate
from gatekeeper.contracts.common import JsonObject
from gatekeeper.contracts.executions import (
    ExecutionAttempt,
    ExecutionError,
    ExecutionEvidence,
    ExecutionSnapshot,
)
from gatekeeper.contracts.providers import Provider
from gatekeeper.contracts.scenarios import Scenario
from gatekeeper.evidence.normalization import malformed_response, normalize, parse_json, sanitize
from gatekeeper.integrations.chat import (
    InvocationFailure,
    build_request,
    configuration_failure,
    response_error,
    send_request,
)
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.executions import (
    claim_attempt,
    claim_run,
    finish_run,
    recover_interrupted,
)
from gatekeeper.persistence.records import timestamp
from gatekeeper.resolver import CredentialUnavailableError, resolve_environment_credential
from gatekeeper.utils.json import canonical_json


# Attempt outcome carries normalized evidence and artifacts independently of rule evaluation.
@dataclass
class AttemptOutcome:
    evidence: ExecutionEvidence
    request: JsonObject | None
    response: JsonObject | None
    fatal: bool = False


# Capture one attempt, preserving failures without retrying or forwarding private run configuration.
async def invoke_attempt(
    client: httpx.AsyncClient,
    candidate: Candidate,
    provider: Provider,
    scenario: Scenario,
    attempt: ExecutionAttempt,
    timeout_ms: int,
) -> AttemptOutcome:
    """Collect evidence for one attempt without retrying or grading its response.

    Args:
        client: Shared asynchronous HTTP client used for the provider request.
        candidate: Frozen model, prompt, tool, and generation configuration.
        provider: Frozen provider destination and environment credential reference.
        scenario: Scenario input and history; private evaluation rules are excluded.
        attempt: Claimed attempt identity, sequence number, and start time.
        timeout_ms: Maximum duration of the awaited provider request in milliseconds.

    Returns:
        Normalized evidence, sanitized request and response objects when available,
        and a flag indicating whether remaining attempts should be skipped.
    """
    started_at = attempt.started_at or timestamp()
    body = None
    response_body = None
    credential = ""
    duration_ms = None
    request_started = None
    fatal = False

    try:
        body = build_request(candidate, provider, scenario)
        credential = resolve_environment_credential(provider.credential_ref).get_secret_value()

        if sanitize(body, credential) != body:
            body = sanitize(body, credential)

            raise configuration_failure(
                "credential_in_input", "Provider credentials cannot be included in model input."
            )

        request_started = perf_counter()

        async with asyncio.timeout(timeout_ms / 1000):
            response = await send_request(client, provider, body, credential)

        duration_ms = (perf_counter() - request_started) * 1000

        try:
            parsed = parse_json(response.text)

            if isinstance(parsed, dict):
                response_body = sanitize(parsed, credential)
        except (ValueError, TypeError):
            response_body = None

        if not response.is_success:
            raise response_error(response.status_code)

        if response_body is None:
            raise malformed_response()

        evidence = normalize(
            response_body,
            candidate,
            provider.provider_type,
            attempt.id,
            attempt.run_id,
            scenario.id,
            attempt.attempt_number,
            started_at,
            timestamp(),
            duration_ms,
        )

        if response_body != parsed:
            evidence.completeness_issues.append("credential_redacted")

        return AttemptOutcome(evidence, body, response_body)
    except CredentialUnavailableError:
        error = ExecutionError(
            code="credential_unavailable",
            source="configuration",
            message="The configured provider credential is unavailable.",
        )
        fatal = True
    except InvocationFailure as failure:
        error = failure.error
        fatal = failure.fatal
    except (TimeoutError, httpx.TimeoutException):
        error = ExecutionError(
            code="request_timeout", source="transport", message="The provider request timed out."
        )
    except httpx.HTTPError:
        error = ExecutionError(
            code="transport_error", source="transport", message="The provider request failed."
        )
    except Exception:
        error = ExecutionError(
            code="execution_internal_error",
            source="infrastructure",
            message="Execution could not collect evidence for this attempt.",
        )
        fatal = True

    if duration_ms is None and request_started is not None:
        duration_ms = (perf_counter() - request_started) * 1000

    evidence = ExecutionEvidence(
        execution_id=attempt.id,
        run_id=attempt.run_id,
        scenario_id=scenario.id,
        attempt_number=attempt.attempt_number,
        status="timed_out" if error.code == "request_timeout" else "failed",
        started_at=started_at,
        completed_at=timestamp(),
        duration_ms=duration_ms,
        requested_model=(
            candidate.model_name.replace(credential, "[REDACTED]")
            if credential
            else candidate.model_name
        ),
        source="backend_observation",
        provider_type=provider.provider_type,
        adapter=candidate.adapter,
        completeness_issues=["provider_response_unavailable"],
        error=error,
    )

    return AttemptOutcome(evidence, body, response_body, fatal)


# Commit terminal attempt state together with its evidence so polling cannot observe partial writes.
def save_outcome(database: Database, outcome: AttemptOutcome) -> None:
    """Persist an attempt result and its artifacts in one database transaction.

    Args:
        database: Database owning the attempt and run records.
        outcome: Evidence, sanitized artifacts, and fatal-error flag to persist.

    Returns:
        None; updates durable evidence, attempt state, and optionally run state.
    """
    evidence = outcome.evidence

    with database.connection() as connection:
        connection.execute(
            "INSERT INTO execution_evidence (execution_id, normalized, request, response) "
            "VALUES (?, ?, ?, ?)",
            (
                str(evidence.execution_id),
                canonical_json(evidence.model_dump(mode="json")),
                canonical_json(outcome.request) if outcome.request is not None else None,
                canonical_json(outcome.response) if outcome.response is not None else None,
            ),
        )
        connection.execute(
            "UPDATE execution_attempts SET status = ?, completed_at = ?, error = ? WHERE id = ?",
            (
                evidence.status,
                evidence.completed_at.isoformat(),
                canonical_json(evidence.error.model_dump()) if evidence.error else None,
                str(evidence.execution_id),
            ),
        )

        if outcome.fatal:
            finish_run(connection, str(evidence.run_id), "failed", evidence.error)


# Run a frozen configuration sequentially; each attempt gets its own one-request boundary.
async def execute_run(
    database: Database, client: httpx.AsyncClient, run_id: str, configuration: ExecutionSnapshot
) -> None:
    """Execute a claimed run sequentially using its frozen configuration.

    Args:
        database: Database used to claim attempts and save their outcomes.
        client: Shared asynchronous HTTP client for provider requests.
        run_id: Identifier of the run already claimed by the worker.
        configuration: Immutable snapshot of candidate, provider, settings, and scenarios.

    Returns:
        None; returns when no more attempts can be claimed or an outcome is fatal.
    """
    candidate = configuration.candidate
    provider = configuration.provider
    scenarios = {scenario.id: scenario for scenario in configuration.scenarios}

    while (attempt := claim_attempt(database, run_id)) is not None:
        outcome = await invoke_attempt(
            client,
            candidate,
            provider,
            scenarios[attempt.scenario_id],
            attempt,
            configuration.settings.timeout_ms,
        )

        save_outcome(database, outcome)

        if outcome.fatal:
            return


# Poll SQLite as the durable queue and contain unexpected run-level failures.
async def run_worker(database: Database, client: httpx.AsyncClient) -> None:
    """Poll the durable queue and execute one claimed run at a time.

    Args:
        database: Database containing queued runs, snapshots, and attempt records.
        client: Shared asynchronous HTTP client owned by the application lifespan.

    Returns:
        None; normally runs until its task is cancelled.
    """

    while True:
        claimed = claim_run(database)

        if claimed is None:
            await asyncio.sleep(0.5)
            continue

        run_id, configuration = claimed

        try:
            await execute_run(database, client, run_id, configuration)
        except Exception:
            error = ExecutionError(
                code="worker_internal_error",
                source="infrastructure",
                message="Execution stopped because of an internal worker failure.",
            )

            with database.connection() as connection:
                connection.execute(
                    "UPDATE execution_attempts SET status = 'failed', completed_at = ?, error = ? "
                    "WHERE run_id = ? AND status = 'running'",
                    (timestamp().isoformat(), canonical_json(error.model_dump()), run_id),
                )
                finish_run(connection, run_id, "failed", error)


# Manage the background worker and recover interrupted execution at startup and shutdown.
@asynccontextmanager
async def execution_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage the execution worker for the application lifetime.

    Args:
        app: FastAPI application whose state.database supplies execution storage.

    Yields:
        None while the application and its execution worker are active.
    """
    database = app.state.database

    recover_interrupted(database)

    async with httpx.AsyncClient(timeout=None, follow_redirects=False) as client:
        worker = asyncio.create_task(run_worker(database, client))

        try:
            yield
        finally:
            worker.cancel()

            with suppress(asyncio.CancelledError):
                await worker

            recover_interrupted(database)
