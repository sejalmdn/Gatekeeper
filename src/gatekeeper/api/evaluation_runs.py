"""Evaluation-run API routes."""

import logging
import sqlite3
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.evaluation_runs import EvaluationRun, EvaluationRunCreate
from gatekeeper.contracts.evaluations import AttemptEvaluationDetail, AttemptEvaluationSummary
from gatekeeper.contracts.executions import ExecutionAttempt, ExecutionAttemptDetail
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.evaluations import evaluation_detail, evaluation_summaries
from gatekeeper.persistence.executions import (
    attempt_detail,
    attempt_from_row,
    cancel_run,
    queue_run,
    read_run,
)
from gatekeeper.persistence.records import project_or_404, timestamp

# Resource activity is emitted after successful database commits.
logger = logging.getLogger(__name__)

# Project-scoped evaluation-run router group.
router = APIRouter(prefix="/v1/projects/{project_id}/evaluation-runs")


# Assert that an evaluation source belongs to the project.
def source_or_404(
    connection: sqlite3.Connection,
    table: Literal["candidates", "datasets", "run_settings"],
    source_id: UUID,
    project_id: UUID,
    detail: str,
) -> None:
    row = connection.execute(
        f"SELECT 1 FROM {table} WHERE id = ? AND project_id = ?",
        (str(source_id), str(project_id)),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=detail)


# Create a pending evaluation run.
@router.post("", response_model=EvaluationRun, status_code=status.HTTP_201_CREATED)
async def create_evaluation_run(
    project_id: UUID, payload: EvaluationRunCreate, database: Database = Depends(get_database)
) -> EvaluationRun:
    """Save payload under project_id in database and return the pending run."""
    logger.info("run_creation_requested project_id=%s", project_id)

    run = EvaluationRun(
        id=uuid4(),
        project_id=project_id,
        status="pending",
        created_at=timestamp(),
        **payload.model_dump(),
    )
    with database.connection() as connection:
        project_or_404(connection, project_id)
        source_or_404(
            connection, "candidates", payload.candidate_id, project_id, "candidate not found"
        )
        source_or_404(connection, "datasets", payload.dataset_id, project_id, "dataset not found")
        source_or_404(
            connection,
            "run_settings",
            payload.run_settings_id,
            project_id,
            "run settings not found",
        )
        connection.execute(
            """INSERT INTO evaluation_runs
            (id, project_id, candidate_id, dataset_id, run_settings_id, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                str(run.id),
                str(project_id),
                str(run.candidate_id),
                str(run.dataset_id),
                str(run.run_settings_id),
                run.status,
                run.created_at.isoformat(),
            ),
        )
    logger.info(
        "run_created project_id=%s run_id=%s candidate_id=%s dataset_id=%s run_settings_id=%s",
        project_id,
        run.id,
        run.candidate_id,
        run.dataset_id,
        run.run_settings_id,
    )
    return run


# List evaluation runs in a project.
@router.get("", response_model=list[EvaluationRun])
async def list_evaluation_runs(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[EvaluationRun]:
    """List project runs with their current execution progress.

    Args:
        project_id: Project whose evaluation runs are listed.
        database: Database containing the runs and attempts.

    Returns:
        Evaluation runs belonging to the project.
    """
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM evaluation_runs WHERE project_id = ? ORDER BY created_at",
            (str(project_id),),
        ).fetchall()

        return [read_run(connection, project_id, UUID(row["id"])) for row in rows]


# Get one project-scoped evaluation run.
@router.get("/{evaluation_run_id}", response_model=EvaluationRun)
async def get_evaluation_run(
    project_id: UUID,
    evaluation_run_id: UUID,
    database: Database = Depends(get_database),
) -> EvaluationRun:
    """Read a run within its project scope.

    Args:
        project_id: Project required to access the run.
        evaluation_run_id: Run identifier to load.
        database: Database containing the run and attempts.

    Returns:
        The run with current progress, or HTTP 404 when absent.
    """
    with database.connection() as connection:
        return read_run(connection, project_id, evaluation_run_id)


# Freeze private configuration and queue exactly one set of scenario attempts.
@router.post("/{evaluation_run_id}/start", response_model=EvaluationRun)
async def start_evaluation_run(
    project_id: UUID, evaluation_run_id: UUID, database: Database = Depends(get_database)
) -> EvaluationRun:
    """Queue evaluation_run_id in project_id/database and return the saved execution state."""
    logger.info("run_start_requested project_id=%s run_id=%s", project_id, evaluation_run_id)
    return queue_run(database, project_id, evaluation_run_id)


# Request cancellation while retaining all observations already collected.
@router.post("/{evaluation_run_id}/cancel", response_model=EvaluationRun)
async def cancel_evaluation_run(
    project_id: UUID, evaluation_run_id: UUID, database: Database = Depends(get_database)
) -> EvaluationRun:
    """Cancel evaluation_run_id in project_id/database and return the saved execution state."""
    return cancel_run(database, project_id, evaluation_run_id)


# Read lightweight attempt progress after checking the run's project scope.
@router.get("/{evaluation_run_id}/attempts", response_model=list[ExecutionAttempt])
async def list_execution_attempts(
    project_id: UUID, evaluation_run_id: UUID, database: Database = Depends(get_database)
) -> list[ExecutionAttempt]:
    """List ordered attempt summaries after checking project access.

    Args:
        project_id: Project required to access the run.
        evaluation_run_id: Run whose attempts are listed.
        database: Database containing the run and attempts.

    Returns:
        Ordered attempt summaries without large evidence artifacts.
    """
    with database.connection() as connection:
        read_run(connection, project_id, evaluation_run_id)
        rows = connection.execute(
            "SELECT * FROM execution_attempts WHERE run_id = ? ORDER BY position",
            (str(evaluation_run_id),),
        ).fetchall()

        return [attempt_from_row(row) for row in rows]


# Return normalized evidence and sanitized transport artifacts for one scoped attempt.
@router.get("/{evaluation_run_id}/attempts/{execution_id}", response_model=ExecutionAttemptDetail)
async def get_execution_attempt(
    project_id: UUID,
    evaluation_run_id: UUID,
    execution_id: UUID,
    database: Database = Depends(get_database),
) -> ExecutionAttemptDetail:
    """Read one attempt with its evidence and sanitized artifacts.

    Args:
        project_id: Project required to access the run.
        evaluation_run_id: Run containing the attempt.
        execution_id: Attempt identifier to inspect.
        database: Database containing attempts and evidence.

    Returns:
        Attempt details, or HTTP 404 when the run or attempt is absent.
    """
    with database.connection() as connection:
        read_run(connection, project_id, evaluation_run_id)
        return attempt_detail(connection, evaluation_run_id, execution_id)


# List evaluation verdicts independently from attempt execution status.
@router.get("/{evaluation_run_id}/evaluations", response_model=list[AttemptEvaluationSummary])
async def list_attempt_evaluations(
    project_id: UUID, evaluation_run_id: UUID, database: Database = Depends(get_database)
) -> list[AttemptEvaluationSummary]:
    """Read evaluation summaries for evaluation_run_id within project_id using database."""
    with database.connection() as connection:
        read_run(connection, project_id, evaluation_run_id)
        return evaluation_summaries(connection, evaluation_run_id)


# Inspect required baseline validation and every frozen bound-rule outcome.
@router.get(
    "/{evaluation_run_id}/attempts/{execution_id}/evaluation",
    response_model=AttemptEvaluationDetail,
)
async def get_attempt_evaluation(
    project_id: UUID,
    evaluation_run_id: UUID,
    execution_id: UUID,
    database: Database = Depends(get_database),
) -> AttemptEvaluationDetail:
    """Read execution_id's evaluation within project_id/evaluation_run_id from database."""
    with database.connection() as connection:
        read_run(connection, project_id, evaluation_run_id)
        return evaluation_detail(connection, evaluation_run_id, execution_id)
