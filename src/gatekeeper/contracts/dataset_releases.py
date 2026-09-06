"""Dataset release creation and read contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import field_validator

from gatekeeper.contracts.common import Contract, JsonObject, NonEmptyString
from gatekeeper.utils.json import canonical_json


# Scenario contract.
class Scenario(Contract):
    scenario_id: NonEmptyString
    input: JsonObject

    # Scenario identifier validation.
    @field_validator("scenario_id")
    @classmethod
    def reject_blank_scenario_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value

    # Scenario input validation.
    @field_validator("input")
    @classmethod
    def validate_input(cls, value: JsonObject) -> JsonObject:
        canonical_json(value)
        return value

# Dataset release creation contract.
class DatasetReleaseCreate(Contract):
    dataset_name: NonEmptyString
    version: NonEmptyString
    scenarios: list[Scenario]

    # Dataset release string validation.
    @field_validator("dataset_name", "version")
    @classmethod
    def reject_blank_release_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value

    # Dataset scenarios validation.
    @field_validator("scenarios")
    @classmethod
    def validate_scenarios(cls, value: list[Scenario]) -> list[Scenario]:
        if not value:
            raise ValueError("must not be empty")
        if len({scenario.scenario_id for scenario in value}) != len(value):
            raise ValueError("scenario_id values must be unique")
        canonical_json([scenario.model_dump(mode="json") for scenario in value])
        return value


# Dataset release read contract.
class DatasetRelease(DatasetReleaseCreate):
    id: UUID
    project_id: UUID
    content_digest: str
    created_at: datetime
