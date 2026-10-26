"""Dataset API routes."""

import logging
import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.datasets import Dataset, DatasetCreate
from gatekeeper.contracts.scenarios import Scenario
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import dataset_from_row, project_or_404, timestamp
from gatekeeper.utils.json import canonical_json
from gatekeeper.utils.logging import log_event

# Resource activity is emitted after successful database commits.
logger = logging.getLogger(__name__)

# Project-scoped dataset router group.
router = APIRouter(prefix="/v1/projects/{project_id}/datasets")


# Create an immutable dataset and its complete scenario collection atomically.
@router.post("", response_model=Dataset, status_code=status.HTTP_201_CREATED)
async def create_dataset(
    project_id: UUID, payload: DatasetCreate, database: Database = Depends(get_database)
) -> Dataset:
    """Atomically save payload and scenarios under project_id in database; return the dataset."""
    dataset = Dataset(
        id=uuid4(),
        project_id=project_id,
        name=payload.name,
        description=payload.description,
        created_at=timestamp(),
    )
    scenarios = [
        Scenario(
            id=uuid4(),
            dataset_id=dataset.id,
            created_at=timestamp(),
            **scenario.model_dump(),
        )
        for scenario in payload.scenarios
    ]
    try:
        with database.connection() as connection:
            project_or_404(connection, project_id)
            connection.execute(
                """INSERT INTO datasets (id, project_id, name, description, created_at)
                VALUES (?, ?, ?, ?, ?)""",
                (
                    str(dataset.id),
                    str(project_id),
                    dataset.name,
                    dataset.description,
                    dataset.created_at.isoformat(),
                ),
            )
            connection.executemany(
                """INSERT INTO scenarios
                (id, dataset_id, scenario_key, name, scenario_type, input, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        str(scenario.id),
                        str(dataset.id),
                        scenario.scenario_key,
                        scenario.name,
                        scenario.scenario_type,
                        canonical_json(scenario.input),
                        scenario.created_at.isoformat(),
                    )
                    for scenario in scenarios
                ],
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="dataset already exists") from error
    log_event(
        logger,
        "dataset.created",
        project_id=project_id,
        dataset_id=dataset.id,
        total_scenarios=len(scenarios),
        single_turn=sum(s.scenario_type == "single_turn" for s in scenarios),
        multi_turn=sum(s.scenario_type == "multi_turn" for s in scenarios),
        tool_use=sum(s.scenario_type == "tool_use" for s in scenarios),
    )
    return dataset


# List datasets in a project.
@router.get("", response_model=list[Dataset])
async def list_datasets(
    project_id: UUID, database: Database = Depends(get_database)
) -> list[Dataset]:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        rows = connection.execute(
            "SELECT * FROM datasets WHERE project_id = ? ORDER BY created_at",
            (str(project_id),),
        ).fetchall()
    return [dataset_from_row(row) for row in rows]


# Get one project-scoped dataset.
@router.get("/{dataset_id}", response_model=Dataset)
async def get_dataset(
    project_id: UUID, dataset_id: UUID, database: Database = Depends(get_database)
) -> Dataset:
    with database.connection() as connection:
        project_or_404(connection, project_id)
        row = connection.execute(
            "SELECT * FROM datasets WHERE id = ? AND project_id = ?",
            (str(dataset_id), str(project_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return dataset_from_row(row)
