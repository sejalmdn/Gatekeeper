"""Evaluation run-setting contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from gatekeeper.contracts.common import Contract, NonEmptyString


# Run-setting creation contract.
class RunSettingsCreate(Contract):
    name: NonEmptyString
    attempts_per_scenario: int = Field(gt=0)
    timeout_ms: int = Field(gt=0)
    pass_threshold: float = Field(ge=0, le=1)


# Run-setting read contract.
class RunSettings(RunSettingsCreate):
    id: UUID
    project_id: UUID
    created_at: datetime
