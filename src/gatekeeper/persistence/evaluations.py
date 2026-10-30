"""Atomic result storage and attempt evaluation reads after caller-enforced run scoping."""

import json
import logging
import sqlite3
from collections import Counter
from time import perf_counter
from uuid import UUID

from fastapi import HTTPException

from gatekeeper.contracts.evaluations import (
    AttemptEvaluation,
    AttemptEvaluationDetail,
    AttemptEvaluationSummary,
    RuleEvaluationResult,
)
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.executions import attempt_from_row
from gatekeeper.persistence.reporting import refresh_summary
from gatekeeper.utils.json import canonical_json

# Storage activity excludes expectations and response content.
logger = logging.getLogger(__name__)


# Commit the entire evaluation in one transaction, retaining already-saved evidence on failure.
def save_evaluation(database: Database, run_id: UUID, evaluation: AttemptEvaluation) -> None:
    """Persist evaluation in database atomically; log run_id and safe storage failure codes."""
    started = perf_counter()

    try:
        with database.connection() as connection:
            connection.execute(
                "INSERT INTO attempt_evaluations VALUES (?, ?, ?, ?, ?)",
                (
                    str(evaluation.execution_id),
                    evaluation.verdict,
                    evaluation.evaluator_version,
                    evaluation.evaluated_at.isoformat(),
                    canonical_json(
                        [item.model_dump() for item in evaluation.automatic_tool_validation]
                    ),
                ),
            )
            connection.executemany(
                "INSERT INTO rule_evaluation_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        str(evaluation.execution_id),
                        str(result.rule_binding_id),
                        result.rule_key,
                        result.rule_type,
                        result.role,
                        result.severity,
                        result.outcome,
                        result.reason,
                        result.explanation,
                        canonical_json(result.evidence_references),
                    )
                    for result in evaluation.rule_results
                ],
            )

            refresh_summary(connection, str(run_id))
    except Exception:
        logger.error(
            "evaluation_storage_failed run_id=%s execution_id=%s "
            "error_code=evaluation_storage_error duration_ms=%.2f",
            run_id,
            evaluation.execution_id,
            (perf_counter() - started) * 1000,
        )
        raise

    logger.info(
        "evaluation_saved run_id=%s execution_id=%s rule_count=%d duration_ms=%.2f",
        run_id,
        evaluation.execution_id,
        len(evaluation.rule_results),
        (perf_counter() - started) * 1000,
    )


# Read summaries in attempt order with absent evaluations represented explicitly.
def evaluation_summaries(
    connection: sqlite3.Connection, run_id: UUID
) -> list[AttemptEvaluationSummary]:
    """Read attempt summaries for scoped run_id from connection without loading rule details."""
    rows = connection.execute(
        "SELECT a.*, e.verdict, e.evaluator_version, e.evaluated_at FROM execution_attempts a "
        "LEFT JOIN attempt_evaluations e ON e.execution_id = a.id "
        "WHERE a.run_id = ? ORDER BY a.position",
        (str(run_id),),
    ).fetchall()
    counts = connection.execute(
        "SELECT r.execution_id, r.outcome, COUNT(*) AS count FROM rule_evaluation_results r "
        "JOIN execution_attempts a ON a.id = r.execution_id WHERE a.run_id = ? "
        "GROUP BY r.execution_id, r.outcome",
        (str(run_id),),
    ).fetchall()
    by_execution: dict[str, dict[str, int]] = {}

    for row in counts:
        by_execution.setdefault(row["execution_id"], {})[row["outcome"]] = row["count"]

    return [
        AttemptEvaluationSummary(
            **attempt_from_row(row).model_dump(),
            verdict=row["verdict"] or "not_evaluated",
            evaluator_version=row["evaluator_version"],
            evaluated_at=row["evaluated_at"],
            outcome_counts=by_execution.get(row["id"], {}) if row["verdict"] else {},
        )
        for row in rows
    ]


# Read a detailed result only for an attempt owned by the already-scoped run.
def evaluation_detail(
    connection: sqlite3.Connection, run_id: UUID, execution_id: UUID
) -> AttemptEvaluationDetail:
    """Read execution_id's evaluation from scoped run_id/connection, or raise HTTP 404."""
    row = connection.execute(
        "SELECT * FROM execution_attempts WHERE run_id = ? AND id = ?",
        (str(run_id), str(execution_id)),
    ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="execution attempt not found")

    header = connection.execute(
        "SELECT * FROM attempt_evaluations WHERE execution_id = ?",
        (str(execution_id),),
    ).fetchone()
    attempt = attempt_from_row(row)

    if header is None:
        return AttemptEvaluationDetail(**attempt.model_dump())

    rows = connection.execute(
        "SELECT * FROM rule_evaluation_results WHERE execution_id = ? ORDER BY rule_key, "
        "rule_binding_id",
        (str(execution_id),),
    ).fetchall()
    results = [
        RuleEvaluationResult(
            **{
                key: row[key]
                for key in row.keys()
                if key not in {"execution_id", "evidence_references"}
            },
            evidence_references=json.loads(row["evidence_references"]),
        )
        for row in rows
    ]
    snapshot_row = connection.execute(
        "SELECT configuration FROM execution_snapshots WHERE run_id = ?", (str(run_id),)
    ).fetchone()
    configurations = (
        ExecutionSnapshot.model_validate_json(snapshot_row["configuration"]).effective_rules.get(
            str(attempt.scenario_id), []
        )
        if snapshot_row
        else []
    )

    return AttemptEvaluationDetail(
        **attempt.model_dump(),
        verdict=header["verdict"],
        evaluator_version=header["evaluator_version"],
        evaluated_at=header["evaluated_at"],
        automatic_tool_validation=json.loads(header["automatic_tool_validation"]),
        rule_results=results,
        rule_configurations=configurations,
        outcome_counts=dict(Counter(result.outcome for result in results)),
    )
