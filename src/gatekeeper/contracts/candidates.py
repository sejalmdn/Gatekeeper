"""Candidate creation and read contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import field_validator

from gatekeeper.contracts.common import Contract, JsonObject, NonEmptyString
from gatekeeper.utils.json import canonical_json


# Candidate creation contract.
class CandidateCreate(Contract):
    application_version: NonEmptyString
    runtime_configuration: JsonObject

    # Application version validation.
    @field_validator("application_version")
    @classmethod
    def reject_blank_application_version(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value

    # Runtime configuration validation.
    @field_validator("runtime_configuration")
    @classmethod
    def validate_runtime_configuration(cls, value: JsonObject) -> JsonObject:
        if not value:
            raise ValueError("must not be empty")
        canonical_json(value)
        return value


# Candidate read contract.
class Candidate(CandidateCreate):
    id: UUID
    project_id: UUID
    runtime_configuration_digest: str
    created_at: datetime
