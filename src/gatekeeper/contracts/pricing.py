"""Private deployment pricing and reproducible decimal cost records."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import Field, HttpUrl, model_validator

from gatekeeper.contracts.common import Contract, NonEmptyString

# Money is serialized as decimal strings and rejects negative or nonfinite values.
Money = Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]


# One reviewed standard token tariff for an exact destination and model identity.
class PricingEntry(Contract):
    provider: NonEmptyString
    api_destination: HttpUrl
    model: NonEmptyString
    aliases: list[NonEmptyString] = Field(default_factory=list)
    input_usd_per_million: Money
    output_usd_per_million: Money
    source_url: HttpUrl
    verified_on: date
    catalog_version: NonEmptyString


# Catalog identities and reviewed aliases must be unique within each destination.
class PricingCatalog(Contract):
    entries: list[PricingEntry] = Field(default_factory=list)

    # Reject ambiguous identity mappings before deployment configuration is frozen.
    @model_validator(mode="after")
    def unique_identities(self) -> PricingCatalog:
        """Validate this catalog's identity keys; return self or raise for ambiguity."""
        seen: set[tuple[str, str, str]] = set()

        for entry in self.entries:
            for identity in [entry.model, *entry.aliases]:
                key = (entry.provider, str(entry.api_destination), identity)

                if key in seen:
                    raise ValueError("ambiguous pricing identity")

                seen.add(key)

        return self


# Calculations remain separate from observed usage and provider-reported charges.
class ExecutionCost(Contract):
    estimated_usd: Money | None = None
    input_usd: Money | None = None
    output_usd: Money | None = None
    input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    pricing_entry: PricingEntry | None = None
    reason: str | None = "pricing_unavailable"
