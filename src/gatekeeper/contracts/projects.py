"""Project creation and read contracts."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from gatekeeper.contracts.common import Contract, NonEmptyString


# Project creation contract.
class ProjectCreate(Contract):
    name: NonEmptyString
    description: str | None = None


# Project read contract.
class Project(ProjectCreate):
    id: UUID
    created_at: datetime
