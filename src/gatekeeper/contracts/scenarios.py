"""Typed Phase 1 scenario contracts."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from gatekeeper.contracts.common import Contract, JsonObject, NonEmptyString


# Supported Phase 1 scenario types.
class ScenarioType(StrEnum):
    SINGLE_TURN = "single_turn"
    MULTI_TURN = "multi_turn"
    TOOL_USE = "tool_use"


# Text conversation message.
class Message(Contract):
    role: Literal["user", "assistant"]
    content: NonEmptyString


# Single-turn input.
class SingleTurnInput(Contract):
    user_message: NonEmptyString


# Multi-turn input.
class MultiTurnInput(Contract):
    history: list[Message] = Field(min_length=1)
    user_message: NonEmptyString


# Tool-use input with optional supplied history.
class ToolUseInput(Contract):
    history: list[Message] = Field(default_factory=list)
    user_message: NonEmptyString


# Scenario creation contract with type-specific input validation.
class ScenarioCreate(Contract):
    scenario_key: NonEmptyString
    name: NonEmptyString
    scenario_type: ScenarioType
    input: JsonObject

    # Match the input object to the declared scenario type.
    @model_validator(mode="after")
    def validate_typed_input(self) -> ScenarioCreate:
        contracts = {
            ScenarioType.SINGLE_TURN: SingleTurnInput,
            ScenarioType.MULTI_TURN: MultiTurnInput,
            ScenarioType.TOOL_USE: ToolUseInput,
        }
        parsed = contracts[self.scenario_type].model_validate(self.input)
        self.input = parsed.model_dump(mode="json")
        return self


# Scenario read contract.
class Scenario(ScenarioCreate):
    id: UUID
    dataset_id: UUID
    created_at: datetime
