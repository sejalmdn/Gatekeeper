"""Administrator configuration API routes."""

from __future__ import annotations

import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.configs import Config, ConfigCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.projects import config_from_row, project_or_404, timestamp
from gatekeeper.utils.json import canonical_json, digest

# Administrator control-plane router group; authentication is deferred.
router = APIRouter(prefix="/v1/projects/{project_id}/configs")


# Configuration content digest generator.
def config_digest(payload: ConfigCreate) -> str:
    return digest(
        {
            "settings": payload.settings,
            "thresholds": payload.thresholds,
            "weights": payload.weights,
            "default_attempts": payload.default_attempts,
        }
    )


# Publish an immutable configuration release endpoint.
@router.post("", response_model=Config, status_code=status.HTTP_201_CREATED)
async def create_config(
    project_id: UUID, payload: ConfigCreate, database: Database = Depends(get_database)
) -> Config:
    now = timestamp()
    config = Config(
        id=uuid4(),
        project_id=project_id,
        name=payload.name,
        version=payload.version,
        settings=payload.settings,
        thresholds=payload.thresholds,
        weights=payload.weights,
        default_attempts=payload.default_attempts,
        digest=config_digest(payload),
        created_at=now,
    )
    try:
        with database.connection() as connection:
            project_or_404(connection, project_id)
            connection.execute(
                """INSERT INTO configs
                (id, project_id, name, version, settings, thresholds, weights,
                 default_attempts, digest, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(config.id),
                    str(config.project_id),
                    config.name,
                    config.version,
                    canonical_json(config.settings),
                    canonical_json(config.thresholds),
                    canonical_json(config.weights),
                    config.default_attempts,
                    config.digest,
                    config.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="config release already exists"
        ) from error
    return config


# List immutable configuration releases endpoint.
@router.get("", response_model=list[Config])
async def list_configs(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[Config]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM configs WHERE project_id = ? ORDER BY created_at", (str(project_id),)
        ).fetchall()
    return [config_from_row(row) for row in rows]


# Get immutable configuration release endpoint.
@router.get("/{config_id}", response_model=Config)
async def get_config(
    project_id: UUID, config_id: UUID, database: Database = Depends(get_database)
) -> Config:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM configs WHERE id = ? AND project_id = ?",
            (str(config_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="config not found")
    return config_from_row(row)
