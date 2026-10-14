"""Project API routes."""

from __future__ import annotations

import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.projects import Project, ProjectCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import project_from_row, timestamp

# Project router group.
router = APIRouter(prefix="/v1/projects")


# Create project endpoint.
@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, database: Database = Depends(get_database)
) -> Project:
    project = Project(
        id=uuid4(),
        name=payload.name,
        description=payload.description,
        created_at=timestamp(),
    )
    try:
        with database.connection() as connection:
            connection.execute(
                "INSERT INTO projects (id, name, description, created_at) VALUES (?, ?, ?, ?)",
                (
                    str(project.id),
                    project.name,
                    project.description,
                    project.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="project already exists"
        ) from error
    return project


# List projects endpoint.
@router.get("", response_model=list[Project])
async def list_projects(database: Database = Depends(get_database)) -> list[Project]:
    with database.connection() as connection:
        return [
            project_from_row(row)
            for row in connection.execute("SELECT * FROM projects ORDER BY created_at")
        ]


# Get project endpoint.
@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: UUID, database: Database = Depends(get_database)) -> Project:
    with database.connection() as connection:
        row = connection.execute(
            "SELECT * FROM projects WHERE id = ?", (str(project_id),)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    return project_from_row(row)
