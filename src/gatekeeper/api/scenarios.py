"""Read-only dataset scenario API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.scenarios import Scenario
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import dataset_or_404, scenario_from_row

# Dataset-scoped scenario router group.
router = APIRouter(prefix="/v1/projects/{project_id}/datasets/{dataset_id}/scenarios")


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
