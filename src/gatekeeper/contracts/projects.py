"""Project creation and read contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import field_validator

from gatekeeper.contracts.common import Contract, NonEmptyString


# Project creation contract.
class ProjectCreate(Contract):
    name: NonEmptyString

    # Project name validation.
    @field_validator("name")
    @classmethod
    def reject_blank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


# Project read contract.
class Project(ProjectCreate):
    id: UUID
    created_at: datetime
