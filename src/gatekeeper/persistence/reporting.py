"""Consistent, bounded batch reads for read-only run reporting."""

import json
import logging
import sqlite3
from time import perf_counter
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError

from gatekeeper.contracts.evaluation_runs import EvaluationRunStatus
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.contracts.reporting import ReportingAttempt, RunSummary
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import timestamp
from gatekeeper.reporting.aggregation import aggregate_run

# Report logs contain identities, counts, duration, and safe failure codes only.
logger = logging.getLogger(__name__)
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


# Scope access before reading private snapshots or observations in one read transaction.
def read_summary(database: Database, project_id: UUID, run_id: UUID) -> RunSummary:
    """Read saved reporting inputs for project_id/run_id from database; return a summary or 404."""
    started = perf_counter()

    try:
        with database.connection() as connection:
            connection.execute("BEGIN")
            run = connection.execute(
                "SELECT status FROM evaluation_runs WHERE id = ? AND project_id = ?",
                (str(run_id), str(project_id)),
            ).fetchone()

            if run is None:
                raise HTTPException(status_code=404, detail="evaluation run not found")

            status = EvaluationRunStatus(run["status"])

            if status in TERMINAL_STATUSES:
                result = stored_summary(connection, project_id, run_id, status)
            else:
                result = compute_summary(connection, project_id, run_id, status)
    except HTTPException:
        logger.info(
            "report_unavailable project_id=%s run_id=%s error_code=run_not_found duration_ms=%.2f",
            project_id,
            run_id,
            (perf_counter() - started) * 1000,
        )
        raise
    except Exception:
        logger.error(
            "report_failed project_id=%s run_id=%s error_code=report_read_error duration_ms=%.2f",
            project_id,
            run_id,
            (perf_counter() - started) * 1000,
        )
        raise

    logger.info(
        "report_read project_id=%s run_id=%s scenario_count=%d planned_attempts=%d "
        "availability=%s duration_ms=%.2f",
        project_id,
        run_id,
        len(result.scenarios),
        result.aggregates.attempts.planned_attempts if result.aggregates else 0,
        result.availability,
        (perf_counter() - started) * 1000,
    )
    return result


# Aggregate frozen reporting inputs using the caller's consistent transaction.
def compute_summary(
    connection: sqlite3.Connection, project_id: UUID, run_id: UUID, status: EvaluationRunStatus
) -> RunSummary:
    """Load frozen inputs from connection for project_id/run_id/status and return aggregation."""
    frozen = connection.execute(
        "SELECT configuration FROM execution_snapshots WHERE run_id = ?", (str(run_id),)
    ).fetchone()

    if frozen is None:
        result = RunSummary(
            project_id=project_id,
            evaluation_run_id=run_id,
            execution_status=status,
            availability="unavailable",
            reason="frozen_snapshot_unavailable",
        )
    else:
        snapshot = ExecutionSnapshot.model_validate_json(frozen["configuration"])
        rows = connection.execute(
            """SELECT a.id, a.scenario_id, a.attempt_number, a.status,
            e.verdict, e.evaluator_version, e.automatic_tool_validation,
            x.execution_id IS NOT NULL AS has_evidence,
            json_extract(x.normalized, '$.duration_ms') AS duration_ms,
            json_extract(x.normalized, '$.input_tokens') AS input_tokens,
            json_extract(x.normalized, '$.output_tokens') AS output_tokens
            FROM execution_attempts a
            LEFT JOIN attempt_evaluations e ON e.execution_id = a.id
            LEFT JOIN execution_evidence x ON x.execution_id = a.id
            WHERE a.run_id = ? ORDER BY a.position""",
            (str(run_id),),
        ).fetchall()
        outcomes = connection.execute(
            "SELECT r.execution_id, r.rule_binding_id, r.outcome "
            "FROM rule_evaluation_results r JOIN execution_attempts a "
            "ON a.id = r.execution_id WHERE a.run_id = ?",
            (str(run_id),),
        ).fetchall()
        by_execution: dict[str, dict[str, str]] = {}

        for outcome in outcomes:
            by_execution.setdefault(outcome["execution_id"], {})[outcome["rule_binding_id"]] = (
                outcome["outcome"]
            )

        attempts = [
            ReportingAttempt.model_validate(
                {
                    "scenario_id": row["scenario_id"],
                    "attempt_number": row["attempt_number"],
                    "status": row["status"],
                    "verdict": row["verdict"] or "not_evaluated",
                    "evaluator_version": row["evaluator_version"],
                    "has_evidence": bool(row["has_evidence"]),
                    "automatic_tool_validation": json.loads(
                        row["automatic_tool_validation"] or "[]"
                    ),
                    "outcomes": by_execution.get(row["id"], {}),
                    "duration_ms": row["duration_ms"],
                    "input_tokens": row["input_tokens"],
                    "output_tokens": row["output_tokens"],
                }
            )
            for row in rows
        ]
        result = aggregate_run(project_id, run_id, status, snapshot, attempts)

    return result


# Read terminal reports without touching frozen inputs or attempt evidence.
def stored_summary(
    connection: sqlite3.Connection, project_id: UUID, run_id: UUID, status: EvaluationRunStatus
) -> RunSummary:
    """Read a validated report from connection for scoped identities/status, or return unknown."""
    row = connection.execute(
        "SELECT summary FROM evaluation_run_summaries WHERE run_id = ?",
        (str(run_id),),
    ).fetchone()

    if row is not None:
        try:
            result = RunSummary.model_validate_json(row["summary"])

            if (
                result.project_id == project_id
                and result.evaluation_run_id == run_id
                and result.execution_status == status
            ):
                return result
        except ValidationError:
            pass

    return RunSummary(
        project_id=project_id,
        evaluation_run_id=run_id,
        execution_status=status,
        availability="unavailable",
        reason="stored_summary_unavailable",
    )


# Isolate reporting failures so terminal state and evidence can still commit.
def persist_summary(connection: sqlite3.Connection, run_id: str) -> None:
    """Generate and store run_id's terminal report in connection; contain reporting failures."""
    connection.execute("SAVEPOINT terminal_summary")

    try:
        run = connection.execute(
            "SELECT project_id, status FROM evaluation_runs WHERE id = ?", (run_id,)
        ).fetchone()
        result = compute_summary(
            connection, UUID(run["project_id"]), UUID(run_id), EvaluationRunStatus(run["status"])
        )
        encoded = result.model_dump_json()
        RunSummary.model_validate_json(encoded)

        connection.execute(
            "INSERT INTO evaluation_run_summaries (run_id, summary, generated_at) VALUES (?, ?, ?)",
            (run_id, encoded, timestamp().isoformat()),
        )
    except Exception:
        connection.execute("ROLLBACK TO terminal_summary")
        logger.error("report_storage_failed run_id=%s error_code=summary_persistence_error", run_id)
    finally:
        connection.execute("RELEASE terminal_summary")


# Remove obsolete reports alongside supported changes to saved reporting inputs.
def refresh_summary(connection: sqlite3.Connection, run_id: str) -> None:
    """Invalidate run_id's reports in connection and regenerate only when its run is terminal."""
    connection.execute("DELETE FROM evaluation_run_summaries WHERE run_id = ?", (run_id,))
    run = connection.execute(
        "SELECT status FROM evaluation_runs WHERE id = ?", (run_id,)
    ).fetchone()

    if run["status"] in TERMINAL_STATUSES:
        persist_summary(connection, run_id)
