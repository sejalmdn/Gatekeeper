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


# Supported provider-neutral generation settings; null leaves a setting unspecified.
class GenerationParameters(Contract):
    temperature: float | None = Field(default=None, ge=0, le=2, strict=True)
    top_p: float | None = Field(default=None, gt=0, le=1, strict=True)
    top_k: int | None = Field(default=None, ge=1, strict=True)
    max_output_tokens: int | None = Field(default=None, ge=1, strict=True)


# Candidate fields shared by creation and historical records.
class CandidateConfiguration(Contract):
    provider_id: UUID
    name: NonEmptyString
    model_name: NonEmptyString
    system_prompt: str = ""
    tool_definitions: list[ToolDefinition] = Field(default_factory=list)
    response_format: JsonObject | None = None

    # Candidate JSON field validation.
    @field_validator("response_format")
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


# Candidate creation accepts only the supported generation controls.
class CandidateCreate(CandidateConfiguration):
    generation_parameters: GenerationParameters = Field(
        default_factory=lambda: GenerationParameters(max_output_tokens=1024)
    )


# Historical candidate settings remain readable without rewriting frozen configurations.
class Candidate(CandidateConfiguration):
    generation_parameters: JsonObject = Field(default_factory=dict)
    adapter: NonEmptyString
    id: UUID
    project_id: UUID
    created_at: datetime
