"""Dataset creation and read contracts."""

from datetime import datetime
from uuid import UUID

from gatekeeper.contracts.common import Contract, NonEmptyString


# Dataset creation contract.
class DatasetCreate(Contract):
    name: NonEmptyString
    description: str | None = None


# Dataset read contract.
class Dataset(DatasetCreate):
    id: UUID
    project_id: UUID
    created_at: datetime
