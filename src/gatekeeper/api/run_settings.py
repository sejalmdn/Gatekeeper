"""Evaluation run-setting API routes."""

import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.run_settings import RunSettings, RunSettingsCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import project_or_404, run_settings_from_row, timestamp

# Project-scoped run-setting router group.
router = APIRouter(prefix="/v1/projects/{project_id}/run-settings")


# Create immutable run settings.
@router.post("", response_model=RunSettings, status_code=status.HTTP_201_CREATED)
async def create_run_settings(
    project_id: UUID, payload: RunSettingsCreate, database: Database = Depends(get_database)
) -> RunSettings:
    settings = RunSettings(
        id=uuid4(), project_id=project_id, created_at=timestamp(), **payload.model_dump()
    )
    try:
        with database.connection() as connection:
            project_or_404(connection, project_id)
            connection.execute(
                """INSERT INTO run_settings
                (id, project_id, name, attempts_per_scenario, timeout_ms,
                 pass_threshold, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(settings.id),
                    str(project_id),
                    settings.name,
                    settings.attempts_per_scenario,
                    settings.timeout_ms,
                    settings.pass_threshold,
                    settings.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="run settings already exist") from error
    return settings


# List run settings in a project.
@router.get("", response_model=list[RunSettings])
async def list_run_settings(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[RunSettings]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM run_settings WHERE project_id = ? ORDER BY created_at",
            (str(project_id),),
        ).fetchall()
    return [run_settings_from_row(row) for row in rows]


# Get one project-scoped run-setting record.
@router.get("/{run_settings_id}", response_model=RunSettings)
async def get_run_settings(
    project_id: UUID, run_settings_id: UUID, database: Database = Depends(get_database)
) -> RunSettings:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM run_settings WHERE id = ? AND project_id = ?",
            (str(run_settings_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="run settings not found")
    return run_settings_from_row(row)
