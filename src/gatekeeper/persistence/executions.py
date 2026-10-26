"""Transactional queue, frozen run configuration, and execution evidence storage."""

import json
import sqlite3
from datetime import datetime
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
from gatekeeper.utils.json import canonical_json, digest
from gatekeeper.utils.rules import resolve_effective_rules


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
    """Validate, snapshot, and allocate a pending run atomically and idempotently.

    Args:
        database: Database containing the run and its source configuration.
        project_id: Project scope required to start the run.
        run_id: Pending run to queue.

    Returns:
        The queued or previously started run; invalid configuration raises HTTP 422.
    """

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        run = read_run(connection, project_id, run_id)

        if run.status != "pending" or run.queued_at is not None:
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
                raise HTTPException(status_code=422, detail=error.error.message) from error

        bindings = [
            rule_binding_from_row(row)
            for row in connection.execute(
                "SELECT * FROM rule_bindings WHERE dataset_id = ? ORDER BY created_at, id",
                (str(run.dataset_id),),
            ).fetchall()
        ]
        configuration = {
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
        return read_run(connection, project_id, run_id)


# Persist cancellation without interrupting an in-flight provider request.
def cancel_run(database: Database, project_id: UUID, run_id: UUID) -> EvaluationRun:
    """Request cancellation while allowing an active provider request to finish.

    Args:
        database: Database containing run and attempt state.
        project_id: Project scope required to cancel the run.
        run_id: Run whose cancellation should be recorded.

    Returns:
        The current run; pending runs are cancelled immediately and repeated calls are safe.
    """

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        run = read_run(connection, project_id, run_id)

        if run.status not in {"pending", "running"} or run.cancel_requested_at is not None:
            return run

        now = timestamp().isoformat()

        connection.execute(
            "UPDATE evaluation_runs SET cancel_requested_at = ? WHERE id = ?", (now, str(run_id))
        )

        if run.status == "pending":
            finish_run(connection, str(run_id), "cancelled", skipped_error("run_cancelled"))

        return read_run(connection, project_id, run_id)


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
) -> None:
    """Finalize a run and mark its remaining pending attempts as skipped.

    Args:
        connection: Open connection whose caller owns the transaction.
        run_id: Run to finalize.
        status: Terminal run status to persist.
        error: Optional reason for failure or skipped attempts.

    Returns:
        None; updates run and pending-attempt records within the caller transaction.
    """
    now = timestamp().isoformat()
    encoded = canonical_json(error.model_dump()) if error else None

    connection.execute(
        "UPDATE execution_attempts SET status = 'skipped', completed_at = ?, error = ? "
        "WHERE run_id = ? AND status = 'pending'",
        (now, encoded, run_id),
    )
    connection.execute(
        "UPDATE evaluation_runs SET status = ?, completed_at = ?, error = ? WHERE id = ?",
        (status, now, encoded if status == "failed" else None, run_id),
    )


# Recover uncertain in-flight work without resending requests that may already have been billed.
def recover_interrupted(database: Database) -> None:
    """Fail uncertain in-flight runs without retrying potentially billed requests.

    Args:
        database: Database whose running attempts require interruption recovery.

    Returns:
        None; marks running attempts failed, skips pending siblings, and leaves queued runs intact.
    """

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
            connection.execute(
                "UPDATE execution_attempts SET status = 'failed', completed_at = ?, error = ? "
                "WHERE run_id = ? AND status = 'running'",
                (timestamp().isoformat(), canonical_json(error.model_dump()), run["id"]),
            )
            finish_run(connection, run["id"], "failed", error)


# Claim the oldest queued run before beginning network work outside the transaction.
def claim_run(database: Database) -> tuple[str, ExecutionSnapshot] | None:
    """Atomically claim the oldest queued run before any network activity.

    Args:
        database: Database containing the durable run queue and frozen snapshots.

    Returns:
        The run ID and validated snapshot, or None when no queued run is available.
    """

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute(
            """SELECT r.id, s.configuration FROM evaluation_runs r
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
        return row["id"], ExecutionSnapshot.model_validate_json(row["configuration"])


# Claim the next attempt or finish the run after cancellation or exhaustion.
def claim_attempt(database: Database, run_id: str) -> ExecutionAttempt | None:
    """Claim the next pending attempt or finalize a cancelled or exhausted run.

    Args:
        database: Database containing the active run and its allocated attempts.
        run_id: Claimed run whose next attempt is needed.

    Returns:
        The newly running attempt, or None after cancellation or run completion.
    """

    with database.connection() as connection:
        connection.execute("BEGIN IMMEDIATE")
        run = connection.execute(
            "SELECT cancel_requested_at FROM evaluation_runs WHERE id = ?", (run_id,)
        ).fetchone()

        if run["cancel_requested_at"]:
            finish_run(connection, run_id, "cancelled", skipped_error("run_cancelled"))
            return None

        row = connection.execute(
            "SELECT * FROM execution_attempts WHERE run_id = ? AND status = 'pending' "
            "ORDER BY position LIMIT 1",
            (run_id,),
        ).fetchone()

        if row is None:
            finish_run(connection, run_id, "completed")
            return None

        now = timestamp().isoformat()

        connection.execute(
            "UPDATE execution_attempts SET status = 'running', started_at = ? WHERE id = ?",
            (now, row["id"]),
        )
        result = attempt_from_row(row)
        result.status = "running"
        result.started_at = datetime.fromisoformat(now)

        return ExecutionAttempt.model_validate(result.model_dump())


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
        **attempt_from_row(row).model_dump(),
        evidence=json.loads(artifact["normalized"]) if artifact else None,
        request=json.loads(artifact["request"]) if artifact and artifact["request"] else None,
        response=json.loads(artifact["response"]) if artifact and artifact["response"] else None,
    )
