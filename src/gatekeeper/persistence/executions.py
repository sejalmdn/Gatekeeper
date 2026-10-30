"""Transactional queue, frozen run configuration, and execution evidence storage."""

import json
import logging
import sqlite3
from datetime import datetime
from time import perf_counter
from uuid import UUID, uuid4

from fastapi import HTTPException

from gatekeeper.contracts.evaluation_runs import EvaluationRun
from gatekeeper.contracts.executions import (
    ExecutionAttempt,
    ExecutionAttemptDetail,
    ExecutionError,
    ExecutionSnapshot,
)
from gatekeeper.integrations.chat import InvocationFailure, build_request
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import (
    candidate_from_row,
    evaluation_run_from_row,
    provider_from_row,
    rule_binding_from_row,
    run_settings_from_row,
    scenario_from_row,
    timestamp,
)
from gatekeeper.persistence.reporting import TERMINAL_STATUSES, persist_summary
from gatekeeper.pricing import load_catalog
from gatekeeper.utils.json import canonical_json, digest
from gatekeeper.utils.logging import safe_label
from gatekeeper.utils.rules import resolve_effective_rules

# Log durable transitions once their owning transactions have committed.
logger = logging.getLogger(__name__)


# Load a scoped run with progress derived from its actual allocated attempts.
def read_run(connection: sqlite3.Connection, project_id: UUID, run_id: UUID) -> EvaluationRun:
    """Load a project-scoped run and derive progress from allocated attempts.

    Args:
        connection: Open SQLite connection used for the reads.
        project_id: Project scope required to access the run.
        run_id: Run identity to load.

    Returns:
        The run with total and finished attempt counts; missing runs raise HTTP 404.
    """
    row = connection.execute(
        "SELECT * FROM evaluation_runs WHERE id = ? AND project_id = ?",
        (str(run_id), str(project_id)),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="evaluation run not found")

    run = evaluation_run_from_row(row)
    counts = connection.execute(
        """SELECT COUNT(*) AS total, COUNT(CASE WHEN status NOT IN ('pending', 'running')
        THEN 1 END) AS finished FROM execution_attempts WHERE run_id = ?""",
        (str(run_id),),
    ).fetchone()
    run.total_attempts = counts["total"]
    run.finished_attempts = counts["finished"]

    return run


# Freeze all private run inputs and allocate attempt identities atomically once.
def queue_run(database: Database, project_id: UUID, run_id: UUID) -> EvaluationRun:
    """Freeze and queue run_id in project_id/database; return its current execution state."""

    started = perf_counter()

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        run = read_run(connection, project_id, run_id)

        if run.status != "pending" or run.queued_at is not None:
            logger.info("run_start_reused run_id=%s reason=already_started_or_terminal", run_id)
            return run

        candidate = candidate_from_row(
            connection.execute(
                "SELECT * FROM candidates WHERE id = ?", (str(run.candidate_id),)
            ).fetchone()
        )
        provider = provider_from_row(
            connection.execute(
                "SELECT * FROM providers WHERE id = ?", (str(candidate.provider_id),)
            ).fetchone()
        )
        settings = run_settings_from_row(
            connection.execute(
                "SELECT * FROM run_settings WHERE id = ?", (str(run.run_settings_id),)
            ).fetchone()
        )
        scenarios = [
            scenario_from_row(row)
            for row in connection.execute(
                "SELECT * FROM scenarios WHERE dataset_id = ? ORDER BY created_at, id",
                (str(run.dataset_id),),
            ).fetchall()
        ]

        if not scenarios:
            raise HTTPException(status_code=422, detail="The dataset has no scenarios to execute.")

        for scenario in scenarios:
            try:
                build_request(candidate, provider, scenario)
            except InvocationFailure as error:
                logger.warning(
                    "run_start_rejected run_id=%s scenario_id=%s error_code=%s",
                    run_id,
                    scenario.id,
                    error.error.code,
                )
                raise HTTPException(status_code=422, detail=error.error.message) from error

        bindings = [
            rule_binding_from_row(row)
            for row in connection.execute(
                "SELECT * FROM rule_bindings WHERE dataset_id = ? ORDER BY created_at, id",
                (str(run.dataset_id),),
            ).fetchall()
        ]
        configuration = {
            "pricing_catalog": load_catalog(provider.provider_type).model_dump(mode="json"),
            "version": 1,
            "candidate": candidate.model_dump(mode="json"),
            "provider": provider.model_dump(mode="json"),
            "settings": settings.model_dump(mode="json"),
            "scenarios": [scenario.model_dump(mode="json") for scenario in scenarios],
            "effective_rules": {
                str(scenario.id): [
                    binding.model_dump(mode="json")
                    for binding in resolve_effective_rules(
                        bindings, scenario.id, scenario.scenario_type
                    )
                ]
                for scenario in scenarios
            },
        }
        snapshot_digest = digest(configuration)

        connection.execute(
            "INSERT INTO execution_snapshots (run_id, version, configuration, digest) "
            "VALUES (?, 1, ?, ?)",
            (str(run_id), canonical_json(configuration), snapshot_digest),
        )
        position = 0

        for scenario in scenarios:
            for number in range(1, settings.attempts_per_scenario + 1):
                connection.execute(
                    """INSERT INTO execution_attempts
                    (id, run_id, scenario_id, scenario_key, scenario_name, scenario_type,
                     attempt_number, position, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                    (
                        str(uuid4()),
                        str(run_id),
                        str(scenario.id),
                        scenario.scenario_key,
                        scenario.name,
                        scenario.scenario_type,
                        number,
                        position,
                    ),
                )
                position += 1

        connection.execute(
            "UPDATE evaluation_runs SET queued_at = ?, snapshot_digest = ? WHERE id = ?",
            (timestamp().isoformat(), snapshot_digest, str(run_id)),
        )
        result = read_run(connection, project_id, run_id)

    logger.info(
        "run_queued project_id=%s run_id=%s candidate_id=%s dataset_id=%s total_scenarios=%d "
        "total_attempts=%d duration_ms=%d",
        project_id,
        run_id,
        run.candidate_id,
        run.dataset_id,
        len(scenarios),
        position,
        (perf_counter() - started) * 1000,
    )
    return result


# Persist cancellation without interrupting an in-flight provider request.
def cancel_run(database: Database, project_id: UUID, run_id: UUID) -> EvaluationRun:
    """Request cancellation for run_id in project_id/database and return its current state."""

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        run = read_run(connection, project_id, run_id)

        if run.status not in {"pending", "running"} or run.cancel_requested_at is not None:
            logger.info("run_cancel_skipped run_id=%s reason=already_requested_or_terminal", run_id)
            return run

        now = timestamp().isoformat()

        connection.execute(
            "UPDATE evaluation_runs SET cancel_requested_at = ? WHERE id = ?", (now, str(run_id))
        )

        skipped = 0

        if run.status == "pending":
            skipped = finish_run(
                connection, str(run_id), "cancelled", skipped_error("run_cancelled")
            )

        result = read_run(connection, project_id, run_id)

    logger.info("run_cancel_requested project_id=%s run_id=%s", project_id, run_id)

    if result.status == "cancelled":
        logger.info("run_cancelled run_id=%s skipped_attempts=%s", run_id, skipped)

    return result


# Explain unexecuted attempts without representing them as observed candidate failures.
def skipped_error(code: str) -> ExecutionError:
    """Describe an allocated attempt that was never sent to the provider.

    Args:
        code: Machine-readable reason the attempt was skipped.

    Returns:
        An infrastructure error that does not imply an observed candidate failure.
    """
    return ExecutionError(
        code=code, source="infrastructure", message="This attempt was not executed."
    )


# Finish a run and retain why its remaining allocated attempts were not invoked.
def finish_run(
    connection: sqlite3.Connection,
    run_id: str,
    status: str,
    error: ExecutionError | None = None,
) -> int:
    """Finalize run_id with status/error in connection; return the number of skipped attempts."""
    run = connection.execute(
        "SELECT status FROM evaluation_runs WHERE id = ?", (run_id,)
    ).fetchone()

    if run["status"] in TERMINAL_STATUSES:
        return 0

    now = timestamp().isoformat()
    encoded = canonical_json(error.model_dump()) if error else None

    skipped = connection.execute(
        "UPDATE execution_attempts SET status = 'skipped', completed_at = ?, error = ? "
        "WHERE run_id = ? AND status = 'pending'",
        (now, encoded, run_id),
    ).rowcount
    connection.execute(
        "UPDATE evaluation_runs SET status = ?, completed_at = ?, error = ? WHERE id = ?",
        (status, now, encoded if status == "failed" else None, run_id),
    )

    persist_summary(connection, run_id)

    return skipped


# Recover uncertain in-flight work without resending requests that may already have been billed.
def recover_interrupted(database: Database) -> None:
    """Fail interrupted runs in database without replaying requests; return None."""

    recovered = []

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        runs = connection.execute(
            "SELECT id FROM evaluation_runs WHERE status = 'running'"
        ).fetchall()
        error = ExecutionError(
            code="process_interrupted",
            source="infrastructure",
            message="Execution was interrupted; the provider outcome may be unknown.",
        )

        for run in runs:
            affected = connection.execute(
                "UPDATE execution_attempts SET status = 'failed', completed_at = ?, error = ? "
                "WHERE run_id = ? AND status = 'running'",
                (timestamp().isoformat(), canonical_json(error.model_dump()), run["id"]),
            ).rowcount
            skipped = finish_run(connection, run["id"], "failed", error)
            recovered.append((run["id"], affected, skipped))

    for run_id, affected, skipped in recovered:
        logger.warning(
            "run_interrupted run_id=%s affected_attempts=%s skipped_attempts=%s error_code=%s",
            run_id,
            affected,
            skipped,
            error.code,
        )
        logger.warning(
            "run_failed run_id=%s skipped_attempts=%s error_code=%s", run_id, skipped, error.code
        )


# Claim the oldest queued run before beginning network work outside the transaction.
def claim_run(database: Database) -> tuple[str, ExecutionSnapshot] | None:
    """Start the oldest queued run in database; return its ID and snapshot, or None."""

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            """SELECT r.id, r.dataset_id, s.configuration FROM evaluation_runs r
            JOIN execution_snapshots s ON s.run_id = r.id
            WHERE r.status = 'pending' AND r.queued_at IS NOT NULL
            ORDER BY r.queued_at, r.id LIMIT 1"""
        ).fetchone()

        if row is None:
            return None

        connection.execute(
            "UPDATE evaluation_runs SET status = 'running', started_at = ? WHERE id = ?",
            (timestamp().isoformat(), row["id"]),
        )
        snapshot = ExecutionSnapshot.model_validate_json(row["configuration"])

    logger.info(
        "run_started run_id=%s project_id=%s candidate_id=%s dataset_id=%s",
        row["id"],
        snapshot.candidate.project_id,
        snapshot.candidate.id,
        row["dataset_id"],
    )
    return row["id"], snapshot


# Claim the next attempt or finish the run after cancellation or exhaustion.
def claim_attempt(database: Database, run_id: str) -> ExecutionAttempt | None:
    """Start the next attempt for run_id in database, returning it or None when the run ends."""
    result = None
    terminal_status = None
    skipped = 0

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        run = connection.execute(
            "SELECT cancel_requested_at FROM evaluation_runs WHERE id = ?", (run_id,)
        ).fetchone()

        if run["cancel_requested_at"]:
            terminal_status = "cancelled"
            skipped = finish_run(connection, run_id, "cancelled", skipped_error("run_cancelled"))
        else:
            row = connection.execute(
                "SELECT * FROM execution_attempts WHERE run_id = ? AND status = 'pending' "
                "ORDER BY position LIMIT 1",
                (run_id,),
            ).fetchone()

            if row is None:
                terminal_status = "completed"
                skipped = finish_run(connection, run_id, "completed")
            else:
                now = timestamp().isoformat()
                connection.execute(
                    "UPDATE execution_attempts SET status = 'running', started_at = ? WHERE id = ?",
                    (now, row["id"]),
                )
                result = attempt_from_row(row)
                result.status = "running"
                result.started_at = datetime.fromisoformat(now)
                result = ExecutionAttempt.model_validate(result.model_dump())

    if terminal_status:
        logger.info("run_%s run_id=%s skipped_attempts=%s", terminal_status, run_id, skipped)
    elif result is not None:
        logger.info(
            "attempt_started run_id=%s execution_id=%s scenario_id=%s scenario_key=%s "
            "scenario_type=%s attempt_number=%d",
            run_id,
            result.id,
            result.scenario_id,
            safe_label(result.scenario_key),
            result.scenario_type,
            result.attempt_number,
        )

    return result


# Map an attempt summary without loading its potentially large artifacts.
def attempt_from_row(row: sqlite3.Row) -> ExecutionAttempt:
    """Map an attempt row to a lightweight progress contract.

    Args:
        row: SQLite attempt row containing lifecycle, scenario, and serialized error fields.

    Returns:
        An attempt summary without loading request, response, or evidence artifacts.
    """
    return ExecutionAttempt(
        **{
            key: row[key]
            for key in (
                "id",
                "run_id",
                "scenario_id",
                "scenario_key",
                "scenario_name",
                "scenario_type",
                "attempt_number",
                "status",
                "started_at",
                "completed_at",
            )
        },
        error=json.loads(row["error"]) if row["error"] else None,
    )


# Load one evidence record only after the run's project scope has been checked by its caller.
def attempt_detail(
    connection: sqlite3.Connection, run_id: UUID, execution_id: UUID
) -> ExecutionAttemptDetail:
    """Load one attempt and its optional evidence after caller-enforced project scoping.

    Args:
        connection: Open SQLite connection used to read the attempt and artifacts.
        run_id: Owning run identity already checked against the project.
        execution_id: Attempt identity whose detail is requested.

    Returns:
        The attempt with available artifacts; an unknown attempt raises HTTP 404.
    """
    row = connection.execute(
        "SELECT * FROM execution_attempts WHERE id = ? AND run_id = ?",
        (str(execution_id), str(run_id)),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="execution attempt not found")

    artifact = connection.execute(
        "SELECT * FROM execution_evidence WHERE execution_id = ?", (str(execution_id),)
    ).fetchone()

    return ExecutionAttemptDetail(
        cost=json.loads(artifact["cost"]) if artifact and artifact["cost"] else None,
        **attempt_from_row(row).model_dump(),
        evidence=json.loads(artifact["normalized"]) if artifact else None,
        request=json.loads(artifact["request"]) if artifact and artifact["request"] else None,
        response=json.loads(artifact["response"]) if artifact and artifact["response"] else None,
    )
