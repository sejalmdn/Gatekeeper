"""Evaluation-run creation and read contracts."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from gatekeeper.contracts.common import Contract
from gatekeeper.contracts.executions import ExecutionError


# Evaluation-run lifecycle states.
class EvaluationRunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


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
    queued_at: datetime | None = None
    cancel_requested_at: datetime | None = None
    snapshot_digest: str | None = None
    error: ExecutionError | None = None
    total_attempts: int = 0
    finished_attempts: int = 0
