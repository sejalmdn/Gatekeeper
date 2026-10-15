"""Dataset creation and read contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field, model_validator

from gatekeeper.contracts.common import Contract, NonEmptyString
from gatekeeper.contracts.scenarios import ScenarioCreate


# Dataset creation contract.
class DatasetCreate(Contract):
    name: NonEmptyString
    description: str | None = None
    scenarios: list[ScenarioCreate] = Field(min_length=1)

    # Keep scenario keys unique within the immutable dataset.
    @model_validator(mode="after")
    def validate_unique_scenario_keys(self) -> DatasetCreate:
        scenario_keys = [scenario.scenario_key for scenario in self.scenarios]
        if len(scenario_keys) != len(set(scenario_keys)):
            raise ValueError("scenario_key values must be unique")
        return self


# Dataset metadata returned without its separately readable scenarios.
class Dataset(Contract):
    id: UUID
    project_id: UUID
    name: NonEmptyString
    description: str | None = None
    created_at: datetime
