"""Evaluation-run API routes."""

import sqlite3
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.evaluation_runs import EvaluationRun, EvaluationRunCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import evaluation_run_from_row, project_or_404, timestamp

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
    return run


# List evaluation runs in a project.
@router.get("", response_model=list[EvaluationRun])
async def list_evaluation_runs(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[EvaluationRun]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM evaluation_runs WHERE project_id = ? ORDER BY created_at",
            (str(project_id),),
        ).fetchall()
    return [evaluation_run_from_row(row) for row in rows]


# Get one project-scoped evaluation run.
@router.get("/{evaluation_run_id}", response_model=EvaluationRun)
async def get_evaluation_run(
    project_id: UUID,
    evaluation_run_id: UUID,
    database: Database = Depends(get_database),
) -> EvaluationRun:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM evaluation_runs WHERE id = ? AND project_id = ?",
            (str(evaluation_run_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="evaluation run not found")
    return evaluation_run_from_row(row)
