"""Candidate API routes."""

from __future__ import annotations

import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.candidates import Candidate, CandidateCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.projects import candidate_from_row, project_or_404, timestamp
from gatekeeper.utils.json import canonical_json, digest

# Candidate router group.
router = APIRouter(prefix="/v1/projects/{project_id}/candidates")


# Create candidate endpoint.
@router.post("", response_model=Candidate, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    project_id: UUID, payload: CandidateCreate, database: Database = Depends(get_database)
) -> Candidate:
    configuration = payload.runtime_configuration
    candidate = Candidate(
        id=uuid4(),
        project_id=project_id,
        application_version=payload.application_version,
        runtime_configuration=configuration,
        runtime_configuration_digest=digest(configuration),
        created_at=timestamp(),
    )
    try:
        with database.connection() as connection:
            project_or_404(connection, project_id)
            connection.execute(
                """INSERT INTO candidates
                (id, project_id, application_version, runtime_configuration,
                 runtime_configuration_digest, created_at) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    str(candidate.id),
                    str(project_id),
                    candidate.application_version,
                    canonical_json(configuration),
                    candidate.runtime_configuration_digest,
                    candidate.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="candidate already exists"
        ) from error
    return candidate


# List candidates endpoint.
@router.get("", response_model=list[Candidate])
async def list_candidates(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[Candidate]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM candidates WHERE project_id = ? ORDER BY created_at",
            (str(project_id),),
        ).fetchall()
    return [candidate_from_row(row) for row in rows]


# Get candidate endpoint.
@router.get("/{candidate_id}", response_model=Candidate)
async def get_candidate(
    project_id: UUID, candidate_id: UUID, database: Database = Depends(get_database)
) -> Candidate:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM candidates WHERE id = ? AND project_id = ?",
            (str(candidate_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="candidate not found")
    return candidate_from_row(row)
