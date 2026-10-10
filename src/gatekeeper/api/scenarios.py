"""Dataset scenario API routes."""

import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.scenarios import Scenario, ScenarioCreate
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import dataset_or_404, scenario_from_row, timestamp
from gatekeeper.utils.json import canonical_json

# Dataset-scoped scenario router group.
router = APIRouter(prefix="/v1/projects/{project_id}/datasets/{dataset_id}/scenarios")


# Create a typed scenario.
@router.post("", response_model=Scenario, status_code=status.HTTP_201_CREATED)
async def create_scenario(
    project_id: UUID,
    dataset_id: UUID,
    payload: ScenarioCreate,
    database: Database = Depends(get_database),
) -> Scenario:
    scenario = Scenario(
        id=uuid4(), dataset_id=dataset_id, created_at=timestamp(), **payload.model_dump()
    )
    try:
        with database.connection() as connection:
            dataset_or_404(connection, project_id, dataset_id)
            connection.execute(
                """INSERT INTO scenarios
                (id, dataset_id, scenario_key, name, scenario_type, input, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(scenario.id),
                    str(dataset_id),
                    scenario.scenario_key,
                    scenario.name,
                    scenario.scenario_type,
                    canonical_json(scenario.input),
                    scenario.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="scenario already exists") from error
    return scenario


# List scenarios in a dataset.
@router.get("", response_model=list[Scenario])
async def list_scenarios(
    project_id: UUID, dataset_id: UUID, database: Database = Depends(get_database)
) -> list[Scenario]:
    with database.connection() as connection:
        dataset_or_404(connection, project_id, dataset_id)
        rows = connection.execute(
            "SELECT * FROM scenarios WHERE dataset_id = ? ORDER BY created_at",
            (str(dataset_id),),
        ).fetchall()
    return [scenario_from_row(row) for row in rows]


# Get one dataset-scoped scenario.
@router.get("/{scenario_id}", response_model=Scenario)
async def get_scenario(
    project_id: UUID,
    dataset_id: UUID,
    scenario_id: UUID,
    database: Database = Depends(get_database),
) -> Scenario:
    with database.connection() as connection:
        dataset_or_404(connection, project_id, dataset_id)
        row = connection.execute(
            "SELECT * FROM scenarios WHERE id = ? AND dataset_id = ?",
            (str(scenario_id), str(dataset_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="scenario not found")
    return scenario_from_row(row)
