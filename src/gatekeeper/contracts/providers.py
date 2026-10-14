"""Model provider creation and read contracts."""

from datetime import datetime
from uuid import UUID

from gatekeeper.contracts.common import Contract, NonEmptyString


# Provider creation contract.
class ProviderCreate(Contract):
    name: NonEmptyString
    provider_type: NonEmptyString
    base_url: NonEmptyString | None = None
    credential_ref: NonEmptyString


# Provider read contract.
class Provider(ProviderCreate):
    id: UUID
    project_id: UUID
    created_at: datetime
