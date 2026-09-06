"""Shared Pydantic configuration and JSON contract types."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, JsonValue

# Shared JSON object type.
JsonObject = dict[str, JsonValue]

# Shared non-empty string annotation.
NonEmptyString = Annotated[str, Field(min_length=1)]


# Base contract with strict input handling.
class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")
