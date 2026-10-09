"""Shared Pydantic configuration and JSON contract types."""

from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, JsonValue

# Shared JSON object type.
JsonObject = dict[str, JsonValue]

# Non-blank string validation.
def reject_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be blank")
    return value


# Shared non-empty string annotation.
NonEmptyString = Annotated[str, Field(min_length=1), AfterValidator(reject_blank)]


# Base contract with strict input handling.
class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
