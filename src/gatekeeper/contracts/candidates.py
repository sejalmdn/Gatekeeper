"""Candidate creation and read contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator

from gatekeeper.contracts.common import Contract, JsonObject, NonEmptyString
from gatekeeper.utils.json import canonical_json


# Provider-neutral tool definition exposed to a candidate.
class ToolDefinition(Contract):
    name: NonEmptyString
    description: str | None = None
    parameters: JsonObject

    # JSON Schema serialization validation.
    @field_validator("parameters")
    @classmethod
    def validate_parameters(cls, value: JsonObject) -> JsonObject:
        canonical_json(value)
        return value


# Candidate creation contract.
class CandidateCreate(Contract):
    provider_id: UUID
    name: NonEmptyString
    adapter: NonEmptyString
    model_name: NonEmptyString
    system_prompt: str = ""
    generation_parameters: JsonObject = Field(default_factory=dict)
    tool_definitions: list[ToolDefinition] = Field(default_factory=list)
    response_format: JsonObject | None = None

    # Candidate JSON field validation.
    @field_validator("generation_parameters", "response_format")
    @classmethod
    def validate_json_fields(cls, value: JsonObject | None) -> JsonObject | None:
        if value is not None:
            canonical_json(value)
        return value

    # Unique tool-name validation.
    @field_validator("tool_definitions")
    @classmethod
    def validate_tool_names(cls, value: list[ToolDefinition]) -> list[ToolDefinition]:
        names = [tool.name for tool in value]
        if len(names) != len(set(names)):
            raise ValueError("tool names must be unique")
        return value


# Candidate read contract.
class Candidate(CandidateCreate):
    id: UUID
    project_id: UUID
    created_at: datetime
