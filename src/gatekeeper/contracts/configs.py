"""Evaluator and scoring configuration contracts."""

from __future__ import annotations

import math
from datetime import datetime
from uuid import UUID

from pydantic import field_validator

from gatekeeper.contracts.common import Contract, JsonObject, NonEmptyString
from gatekeeper.utils.json import canonical_json

# Finite JSON numeric value type.
Numeric = int | float


# Shared evaluator and scoring configuration input contract.
class ConfigValues(Contract):
    settings: JsonObject
    thresholds: dict[NonEmptyString, Numeric]
    weights: dict[NonEmptyString, Numeric]
    default_attempts: int

    # JSON numeric-map type validation.
    @field_validator("thresholds", "weights", mode="before")
    @classmethod
    def reject_non_numeric_map_values(cls, value: object) -> object:
        if isinstance(value, dict) and any(
            type(item) not in (int, float) for item in value.values()
        ):
            raise ValueError("values must be JSON numbers")
        return value

    # Opaque settings validation.
    @field_validator("settings")
    @classmethod
    def validate_settings(cls, value: JsonObject) -> JsonObject:
        canonical_json(value)
        return value

    # Threshold map validation.
    @field_validator("thresholds")
    @classmethod
    def validate_thresholds(cls, value: dict[str, Numeric]) -> dict[str, Numeric]:
        if not value:
            raise ValueError("must not be empty")
        if any(not name.strip() for name in value):
            raise ValueError("names must not be blank")
        if any(not math.isfinite(threshold) for threshold in value.values()):
            raise ValueError("values must be finite")
        return value

    # Severity-weight map validation.
    @field_validator("weights")
    @classmethod
    def validate_weights(cls, value: dict[str, Numeric]) -> dict[str, Numeric]:
        if not value:
            raise ValueError("must not be empty")
        if any(not name.strip() for name in value):
            raise ValueError("names must not be blank")
        if any(not math.isfinite(weight) or weight <= 0 for weight in value.values()):
            raise ValueError("values must be finite and positive")
        return value

    # Repeated-run policy validation.
    @field_validator("default_attempts", mode="before")
    @classmethod
    def reject_non_integer_attempts(cls, value: object) -> object:
        if type(value) is not int:
            raise ValueError("must be an integer")
        return value

    # Positive repeated-run policy validation.
    @field_validator("default_attempts")
    @classmethod
    def validate_default_attempts(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("must be positive")
        return value


# Configuration creation contract.
class ConfigCreate(ConfigValues):
    name: NonEmptyString
    version: NonEmptyString

    # Configuration release-string validation.
    @field_validator("name", "version")
    @classmethod
    def reject_blank_release_strings(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


# Immutable configuration release read contract.
class Config(ConfigCreate):
    id: UUID
    project_id: UUID
    digest: str
    created_at: datetime
