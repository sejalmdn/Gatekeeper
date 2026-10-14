"""Evaluation-run creation and read contracts."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from gatekeeper.contracts.common import Contract


# Evaluation-run lifecycle states.
class EvaluationRunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# Evaluation-run creation contract.
class EvaluationRunCreate(Contract):
    candidate_id: UUID
    dataset_id: UUID
    run_settings_id: UUID


# Evaluation-run read contract.
class EvaluationRun(EvaluationRunCreate):
    id: UUID
    project_id: UUID
    status: EvaluationRunStatus
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
