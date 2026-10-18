"""Model provider creation and read contracts."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import field_validator

from gatekeeper.contracts.common import Contract, NonEmptyString
from gatekeeper.resolver import ENVIRONMENT_REFERENCE


# Provider services available for new connections.
class ProviderType(StrEnum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    GROQ = "groq"
    OPENROUTER = "openrouter"


# Provider creation contract.
class ProviderCreate(Contract):
    name: NonEmptyString
    provider_type: ProviderType
    base_url: NonEmptyString | None = None
    credential_ref: NonEmptyString

    # Enforce the credential reference format without resolving its value.
    @field_validator("credential_ref")
    @classmethod
    def validate_credential_ref(cls, value: str) -> str:
        if ENVIRONMENT_REFERENCE.fullmatch(value) is None:
            raise ValueError("must be a valid environment credential reference")
        return value


# Provider read contract.
class Provider(ProviderCreate):
    provider_type: NonEmptyString
    id: UUID
    project_id: UUID
    created_at: datetime
