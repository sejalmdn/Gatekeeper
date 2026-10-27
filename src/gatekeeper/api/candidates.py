"""Candidate API routes."""

import logging
import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.candidates import Candidate, CandidateCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import candidate_from_row, project_or_404, timestamp
from gatekeeper.utils.json import canonical_json
from gatekeeper.utils.providers import PROVIDER_ADAPTERS

# Resource activity is emitted after successful database commits.
logger = logging.getLogger(__name__)

# Project-scoped candidate router group.
router = APIRouter(prefix="/v1/projects/{project_id}/candidates")


# Create an immutable candidate.
@router.post("", response_model=Candidate, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    project_id: UUID, payload: CandidateCreate, database: Database = Depends(get_database)
) -> Candidate:
    """Persist payload under project_id in database and return the immutable candidate."""
    logger.info("candidate_creation_requested project_id=%s", project_id)

    try:
        with database.connection() as connection:
            project_or_404(connection, project_id)
            provider = connection.execute(
                "SELECT provider_type FROM providers WHERE id = ? AND project_id = ?",
                (str(payload.provider_id), str(project_id)),
            ).fetchone()
            if provider is None:
                raise HTTPException(status_code=404, detail="provider not found")
            adapter = PROVIDER_ADAPTERS.get(provider["provider_type"])
            if adapter is None:
                raise HTTPException(status_code=422, detail="unsupported provider type")
            candidate = Candidate(
                id=uuid4(),
                project_id=project_id,
                created_at=timestamp(),
                adapter=adapter,
                **payload.model_dump(),
            )
            connection.execute(
                """INSERT INTO candidates
                (id, project_id, provider_id, name, adapter, model_name, system_prompt,
                 generation_parameters, tool_definitions, response_format, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(candidate.id),
                    str(project_id),
                    str(candidate.provider_id),
                    candidate.name,
                    candidate.adapter,
                    candidate.model_name,
                    candidate.system_prompt,
                    canonical_json(candidate.generation_parameters),
                    canonical_json(
                        [tool.model_dump(mode="json") for tool in candidate.tool_definitions]
                    ),
                    (
                        canonical_json(candidate.response_format)
                        if candidate.response_format is not None
                        else None
                    ),
                    candidate.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="candidate already exists") from error
    logger.info(
        "candidate_created project_id=%s candidate_id=%s provider_id=%s",
        project_id,
        candidate.id,
        candidate.provider_id,
    )
    return candidate


# List candidates in a project.
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


# Get one project-scoped candidate.
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
        raise HTTPException(status_code=404, detail="candidate not found")
    return candidate_from_row(row)
