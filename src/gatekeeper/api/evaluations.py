"""Administrator frozen-evaluation API routes."""

from __future__ import annotations

import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.evaluations import Evaluation, EvaluationCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.projects import (
    candidate_from_row,
    config_from_row,
    evaluation_from_row,
    project_or_404,
    release_from_row,
    timestamp,
)
from gatekeeper.utils.json import canonical_json

# Administrator control-plane router group; authentication is deferred.
router = APIRouter(
    prefix="/v1/projects/{project_id}/evaluations", tags=["Administrator control plane"]
)


# Fetch a project-scoped source or report a missing source.
def source_or_404(
    connection: sqlite3.Connection, query: str, values: tuple[str, str], detail: str
) -> sqlite3.Row:
    row = connection.execute(query, values).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return row


# Create a frozen evaluation endpoint.
@router.post("", response_model=Evaluation, status_code=status.HTTP_201_CREATED)
async def create_evaluation(
    project_id: UUID, payload: EvaluationCreate, database: Database = Depends(get_database)
) -> Evaluation:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        candidate = candidate_from_row(
            source_or_404(
                connection,
                "SELECT * FROM candidates WHERE id = ? AND project_id = ?",
                (str(payload.candidate_id), str(project_id)),
                "candidate not found",
            )
        )
        release = release_from_row(
            source_or_404(
                connection,
                "SELECT * FROM dataset_releases WHERE id = ? AND project_id = ?",
                (str(payload.dataset_release_id), str(project_id)),
                "dataset release not found",
            )
        )
        config = config_from_row(
            source_or_404(
                connection,
                "SELECT * FROM configs WHERE id = ? AND project_id = ?",
                (str(payload.config_id), str(project_id)),
                "config not found",
            )
        )
        evaluation = Evaluation(
            id=uuid4(),
            project_id=project_id,
            candidate_id=candidate.id,
            dataset_release_id=release.id,
            config_id=config.id,
            candidate_digest=candidate.runtime_configuration_digest,
            dataset_release_digest=release.content_digest,
            config_digest=config.digest,
            candidate_snapshot=candidate,
            dataset_release_snapshot=release,
            config_snapshot=config,
            created_at=timestamp(),
        )
        connection.execute(
            """INSERT INTO evaluations
            (id, project_id, candidate_id, dataset_release_id, config_id, candidate_digest,
             dataset_release_digest, config_digest, candidate_snapshot, dataset_release_snapshot,
             config_snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                str(evaluation.id),
                str(evaluation.project_id),
                str(evaluation.candidate_id),
                str(evaluation.dataset_release_id),
                str(evaluation.config_id),
                evaluation.candidate_digest,
                evaluation.dataset_release_digest,
                evaluation.config_digest,
                canonical_json(evaluation.candidate_snapshot.model_dump(mode="json")),
                canonical_json(evaluation.dataset_release_snapshot.model_dump(mode="json")),
                canonical_json(evaluation.config_snapshot.model_dump(mode="json")),
                evaluation.created_at.isoformat(),
            ),
        )
    return evaluation


# List frozen evaluations endpoint.
@router.get("", response_model=list[Evaluation])
async def list_evaluations(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[Evaluation]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM evaluations WHERE project_id = ? ORDER BY created_at", (str(project_id),)
        ).fetchall()
    return [evaluation_from_row(row) for row in rows]


# Get frozen evaluation endpoint.
@router.get("/{evaluation_id}", response_model=Evaluation)
async def get_evaluation(
    project_id: UUID, evaluation_id: UUID, database: Database = Depends(get_database)
) -> Evaluation:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM evaluations WHERE id = ? AND project_id = ?",
            (str(evaluation_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="evaluation not found")
    return evaluation_from_row(row)
