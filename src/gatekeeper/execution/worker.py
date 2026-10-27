"""Sequential offline execution with durable progress and conservative interruption recovery."""

import asyncio
import logging
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
from gatekeeper.evaluation.engine import evaluate_attempt
from gatekeeper.evidence.normalization import malformed_response, normalize, parse_json, sanitize
from gatekeeper.integrations.chat import (
    InvocationFailure,
    build_request,
    configuration_failure,
    response_error,
    send_request,
)
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.evaluations import save_evaluation
from gatekeeper.persistence.executions import (
    claim_attempt,
    claim_run,
    finish_run,
    recover_interrupted,
)
from gatekeeper.persistence.records import timestamp
from gatekeeper.resolver import CredentialUnavailableError, resolve_environment_credential
from gatekeeper.utils.json import canonical_json
from gatekeeper.utils.logging import safe_label

# Worker activity includes identities and operational observations without invocation content.
logger = logging.getLogger(__name__)


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
    """Invoke candidate/provider for scenario/attempt using client and timeout_ms;
    return sanitized evidence, artifacts, and a fatal-error flag.
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

        logger.info(
            "provider_request_started run_id=%s execution_id=%s scenario_id=%s provider_id=%s "
            "provider_type=%s model_id=%s timeout_ms=%d",
            attempt.run_id,
            attempt.id,
            scenario.id,
            provider.id,
            provider.provider_type,
            safe_label(candidate.model_name.replace(credential, "REDACTED")),
            timeout_ms,
        )
        request_started = perf_counter()

        async with asyncio.timeout(timeout_ms / 1000):
            response = await send_request(client, provider, body, credential)

        duration_ms = (perf_counter() - request_started) * 1000
        logger.log(
            logging.INFO if response.is_success else logging.WARNING,
            "provider_response_received run_id=%s execution_id=%s provider_id=%s "
            "provider_type=%s http_status=%s duration_ms=%s",
            attempt.run_id,
            attempt.id,
            provider.id,
            provider.provider_type,
            response.status_code,
            round(duration_ms, 2),
        )

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
        logger.exception(
            "attempt_internal_error run_id=%s execution_id=%s error_code=execution_internal_error",
            attempt.run_id,
            attempt.id,
        )
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
    """Persist outcome evidence and attempt/run state atomically in database; return None."""
    evidence = outcome.evidence
    skipped = 0

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
            skipped = finish_run(connection, str(evidence.run_id), "failed", evidence.error)

    level = logging.INFO

    if outcome.fatal:
        level = logging.ERROR
    elif evidence.status != "completed" or evidence.completeness_issues:
        level = logging.WARNING

    logger.log(
        level,
        "evidence_saved run_id=%s execution_id=%s scenario_id=%s tool_request_count=%s "
        "completeness_issues=%s tool_issues=%s",
        evidence.run_id,
        evidence.execution_id,
        evidence.scenario_id,
        len(evidence.tool_requests or []),
        "|".join(evidence.completeness_issues) or "none",
        "|".join(sorted({issue for call in evidence.tool_requests or [] for issue in call.issues}))
        or "none",
    )
    logger.log(
        level,
        "attempt_%s run_id=%s execution_id=%s scenario_id=%s attempt_number=%s duration_ms=%s "
        "error_code=%s error_source=%s http_status=%s",
        evidence.status,
        evidence.run_id,
        evidence.execution_id,
        evidence.scenario_id,
        evidence.attempt_number,
        evidence.duration_ms,
        evidence.error.code if evidence.error else None,
        evidence.error.source if evidence.error else None,
        evidence.error.http_status if evidence.error else None,
    )

    if outcome.fatal:
        logger.error(
            "run_failed run_id=%s skipped_attempts=%s error_code=%s",
            evidence.run_id,
            skipped,
            evidence.error.code if evidence.error else None,
        )


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
        evaluation = evaluate_attempt(
            outcome.evidence,
            configuration.effective_rules[str(attempt.scenario_id)],
            candidate.tool_definitions,
        )
        save_evaluation(database, outcome.evidence.run_id, evaluation)

        if outcome.fatal:
            return


# Poll SQLite as the durable queue and contain unexpected run-level failures.
async def run_worker(database: Database, client: httpx.AsyncClient) -> None:
    """Poll database and execute queued runs with client until cancelled; return None."""
    logger.info("worker_started")

    try:
        while True:
            claimed = claim_run(database)

            if claimed is None:
                await asyncio.sleep(0.5)
                continue

            run_id, configuration = claimed
            started = perf_counter()
            logger.info("worker_run_picked_up run_id=%s", run_id)

            try:
                await execute_run(database, client, run_id, configuration)
                logger.info(
                    "worker_run_finished run_id=%s duration_ms=%d",
                    run_id,
                    (perf_counter() - started) * 1000,
                )
            except Exception:
                logger.exception(
                    "worker_run_failed run_id=%s error_code=worker_internal_error duration_ms=%d",
                    run_id,
                    (perf_counter() - started) * 1000,
                )
                error = ExecutionError(
                    code="worker_internal_error",
                    source="infrastructure",
                    message="Execution stopped because of an internal worker failure.",
                )

                with database.connection() as connection:
                    affected = connection.execute(
                        "UPDATE execution_attempts SET status = 'failed', completed_at = ?, "
                        "error = ? WHERE run_id = ? AND status = 'running'",
                        (timestamp().isoformat(), canonical_json(error.model_dump()), run_id),
                    ).rowcount
                    skipped = finish_run(connection, run_id, "failed", error)

                logger.error(
                    "run_failed run_id=%s error_code=%s affected_attempts=%s skipped_attempts=%s",
                    run_id,
                    error.code,
                    affected,
                    skipped,
                )
    except Exception:
        logger.exception("worker_failed stage=queue error_code=worker_internal_error")
        raise
    finally:
        logger.info("worker_stopped")


# Manage the background worker and recover interrupted execution at startup and shutdown.
@asynccontextmanager
async def execution_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start the worker for app, yield while serving, then stop and recover interrupted work."""
    database = app.state.database
    logger.info("application_starting")

    try:
        recover_interrupted(database)
    except Exception:
        logger.exception("application_startup_failed stage=recovery error_code=recovery_failed")
        raise

    async with httpx.AsyncClient(timeout=None, follow_redirects=False) as client:
        worker = asyncio.create_task(run_worker(database, client))
        logger.info("application_ready")

        try:
            yield
        finally:
            logger.info("application_shutdown_started")
            worker.cancel()

            try:
                with suppress(asyncio.CancelledError):
                    await worker

                recover_interrupted(database)
            except Exception:
                logger.error("application_shutdown_failed error_code=worker_cleanup_failed")
                raise

    logger.info("application_shutdown_completed")
