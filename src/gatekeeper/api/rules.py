"""Dataset rule-binding API routes."""

import logging
import sqlite3
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from gatekeeper.api.dependencies import get_database
from gatekeeper.contracts.rules import RULE_SCENARIO_TYPES, RuleBinding, RuleBindingCreate
from gatekeeper.contracts.scenarios import ScenarioType
from gatekeeper.persistence.database import Database
from gatekeeper.persistence.records import dataset_or_404, rule_binding_from_row, timestamp
from gatekeeper.utils.json import canonical_json

# Resource activity is emitted after successful database commits.
logger = logging.getLogger(__name__)

# Dataset-scoped rule-binding router group.
router = APIRouter(prefix="/v1/projects/{project_id}/datasets/{dataset_id}/rule-bindings")


# Create a dataset or scenario rule binding.
@router.post("", response_model=RuleBinding, status_code=status.HTTP_201_CREATED)
async def create_rule_binding(
    project_id: UUID,
    dataset_id: UUID,
    payload: RuleBindingCreate,
    database: Database = Depends(get_database),
) -> RuleBinding:
    """Save payload for project_id/dataset_id in database and return the rule binding."""
    logger.info(
        "rule_binding_creation_requested project_id=%s dataset_id=%s", project_id, dataset_id
    )

    binding = RuleBinding(
        id=uuid4(), dataset_id=dataset_id, created_at=timestamp(), **payload.model_dump()
    )
    try:
        with database.connection() as connection:
            dataset_or_404(connection, project_id, dataset_id)
            if binding.scenario_id is not None:
                scenario = connection.execute(
                    "SELECT scenario_type FROM scenarios WHERE id = ? AND dataset_id = ?",
                    (str(binding.scenario_id), str(dataset_id)),
                ).fetchone()
                if scenario is None:
                    raise HTTPException(status_code=404, detail="scenario not found")
                scenario_type = ScenarioType(scenario["scenario_type"])
                if scenario_type not in RULE_SCENARIO_TYPES[binding.rule_type]:
                    raise HTTPException(
                        status_code=422,
                        detail="rule type does not support the scenario type",
                    )
            connection.execute(
                """INSERT INTO rule_bindings
                (id, dataset_id, scenario_id, rule_key, rule_type, role, severity,
                 parameters, applies_to, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(binding.id),
                    str(dataset_id),
                    str(binding.scenario_id) if binding.scenario_id else None,
                    binding.rule_key,
                    binding.rule_type,
                    binding.role,
                    binding.severity,
                    canonical_json(binding.parameters),
                    canonical_json(binding.applies_to) if binding.applies_to else None,
                    binding.created_at.isoformat(),
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="rule binding already exists") from error
    logger.info(
        "rule_binding_created project_id=%s dataset_id=%s scenario_id=%s rule_binding_id=%s "
        "rule_type=%s",
        project_id,
        dataset_id,
        binding.scenario_id,
        binding.id,
        binding.rule_type,
    )
    return binding


# List rule bindings in a dataset.
@router.get("", response_model=list[RuleBinding])
async def list_rule_bindings(
    project_id: UUID, dataset_id: UUID, database: Database = Depends(get_database)
) -> list[RuleBinding]:
    with database.connection() as connection:
        dataset_or_404(connection, project_id, dataset_id)
        rows = connection.execute(
            "SELECT * FROM rule_bindings WHERE dataset_id = ? ORDER BY created_at",
            (str(dataset_id),),
        ).fetchall()
    return [rule_binding_from_row(row) for row in rows]


# Get one dataset-scoped rule binding.
@router.get("/{rule_binding_id}", response_model=RuleBinding)
async def get_rule_binding(
    project_id: UUID,
    dataset_id: UUID,
    rule_binding_id: UUID,
    database: Database = Depends(get_database),
) -> RuleBinding:
    with database.connection() as connection:
        dataset_or_404(connection, project_id, dataset_id)
        row = connection.execute(
            "SELECT * FROM rule_bindings WHERE id = ? AND dataset_id = ?",
            (str(rule_binding_id), str(dataset_id)),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="rule binding not found")
    return rule_binding_from_row(row)
