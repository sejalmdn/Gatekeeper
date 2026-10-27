"""Model provider API routes."""

import logging
import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.providers import Provider, ProviderCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import project_or_404, provider_from_row, timestamp

# Resource activity is emitted after successful database commits.
logger = logging.getLogger(__name__)

# Project-scoped provider router group.
router = APIRouter(prefix="/v1/projects/{project_id}/providers")


# Create a provider.
@router.post("", response_model=Provider, status_code=status.HTTP_201_CREATED)
async def create_provider(
    project_id: UUID, payload: ProviderCreate, database: Database = Depends(get_database)
) -> Provider:
    """Persist payload under project_id in database and return the saved provider."""
    logger.info("provider_creation_requested project_id=%s", project_id)

    provider = Provider(
        id=uuid4(), project_id=project_id, created_at=timestamp(), **payload.model_dump()
    )
    try:
        with database.connection() as connection:
            project_or_404(connection, project_id)
            connection.execute(
                """INSERT INTO providers
                (id, project_id, name, provider_type, base_url, credential_ref, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(provider.id),
                    str(project_id),
                    provider.name,
                    provider.provider_type,
                    provider.base_url,
                    provider.credential_ref,
                    provider.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="provider already exists") from error
    logger.info(
        "provider_created project_id=%s provider_id=%s provider_type=%s",
        project_id,
        provider.id,
        provider.provider_type,
    )
    return provider


# List providers in a project.
@router.get("", response_model=list[Provider])
async def list_providers(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[Provider]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM providers WHERE project_id = ? ORDER BY created_at",
            (str(project_id),),
        ).fetchall()
    return [provider_from_row(row) for row in rows]


# Get one project-scoped provider.
@router.get("/{provider_id}", response_model=Provider)
async def get_provider(
    project_id: UUID, provider_id: UUID, database: Database = Depends(get_database)
) -> Provider:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM providers WHERE id = ? AND project_id = ?",
            (str(provider_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="provider not found")
    return provider_from_row(row)
