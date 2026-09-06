"""Project API routes."""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.projects import Project, ProjectCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.projects import project_from_row, timestamp

# Project router group.
router = APIRouter(prefix="/v1/projects")


# Create project endpoint.
@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate, database: Database = Depends(get_database)
) -> Project:
    project = Project(id=uuid4(), name=payload.name, created_at=timestamp())
    with database.connection() as connection:
        connection.execute(
            "INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)",
            (str(project.id), project.name, project.created_at.isoformat()),
        )
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
