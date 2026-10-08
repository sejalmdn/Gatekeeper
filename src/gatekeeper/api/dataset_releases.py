"""Dataset release API routes."""

from __future__ import annotations

import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.dataset_releases import DatasetRelease, DatasetReleaseCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.projects import project_or_404, release_from_row, timestamp
from gatekeeper.utils.json import canonical_json, digest

# Dataset release router group.
router = APIRouter(prefix="/v1/projects/{project_id}/dataset-releases")


# Create dataset release endpoint.
@router.post("", response_model=DatasetRelease, status_code=status.HTTP_201_CREATED)
async def create_dataset_release(
    project_id: UUID, payload: DatasetReleaseCreate, database: Database = Depends(get_database)
) -> DatasetRelease:
    scenarios = [scenario.model_dump(mode="json") for scenario in payload.scenarios]
    release = DatasetRelease(
        id=uuid4(),
        project_id=project_id,
        dataset_name=payload.dataset_name,
        version=payload.version,
        scenarios=scenarios,
        content_digest=digest(scenarios),
        created_at=timestamp(),
    )
    try:
        with database.connection() as connection:
            project_or_404(connection, project_id)
            connection.execute(
                """INSERT INTO dataset_releases
                (id, project_id, dataset_name, version, scenarios, content_digest, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(release.id),
                    str(project_id),
                    release.dataset_name,
                    release.version,
                    canonical_json(scenarios),
                    release.content_digest,
                    release.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="dataset release already exists"
        ) from error
    return release


# List dataset releases endpoint.
@router.get("", response_model=list[DatasetRelease])
async def list_dataset_releases(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[DatasetRelease]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM dataset_releases WHERE project_id = ? ORDER BY created_at",
            (str(project_id),),
        ).fetchall()
    return [release_from_row(row) for row in rows]


# Get dataset release endpoint.
@router.get("/{dataset_release_id}", response_model=DatasetRelease)
async def get_dataset_release(
    project_id: UUID, dataset_release_id: UUID, database: Database = Depends(get_database)
) -> DatasetRelease:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM dataset_releases WHERE id = ? AND project_id = ?",
            (str(dataset_release_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="dataset release not found"
        )
    return release_from_row(row)
