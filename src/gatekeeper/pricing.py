"""Deployment-managed pricing snapshots and pure standard-rate calculations."""

import os
from decimal import Decimal, localcontext
from pathlib import Path

from gatekeeper.contracts.executions import ExecutionEvidence
from gatekeeper.contracts.pricing import ExecutionCost, PricingCatalog


# Read an explicit deployment override or the packaged reviewed catalog without network access.
def load_catalog(provider: str) -> PricingCatalog:
    """Load validated deployment prices for provider; return an independent private catalog."""
    path = Path(
        os.environ.get("GATEKEEPER_PRICING_CATALOG", Path(__file__).with_name("pricing.json"))
    )
    catalog = PricingCatalog.model_validate_json(path.read_text(encoding="utf-8"))

    return PricingCatalog(
        entries=[entry for entry in catalog.entries if entry.provider == provider]
    )


# Calculate only from observed identities and usage, without suffix matching or token inference.
def calculate_cost(
    evidence: ExecutionEvidence, catalog: PricingCatalog | None, destination: str
) -> ExecutionCost:
    """Price evidence using frozen catalog/destination; return breakdown or missing reason."""
    result = ExecutionCost(input_tokens=evidence.input_tokens, output_tokens=evidence.output_tokens)

    if evidence.status != "completed":
        return result.model_copy(update={"reason": "invocation_unsuccessful"})

    if evidence.input_tokens is None or evidence.output_tokens is None:
        return result.model_copy(update={"reason": "usage_unavailable"})

    if not evidence.returned_model:
        return result.model_copy(update={"reason": "model_identity_unavailable"})

    matches = [
        entry
        for entry in (catalog.entries if catalog else [])
        if entry.provider == evidence.provider_type
        and str(entry.api_destination) == destination
        and evidence.returned_model in [entry.model, *entry.aliases]
        and evidence.requested_model in [entry.model, *entry.aliases]
    ]

    if len(matches) != 1:
        return result.model_copy(
            update={"reason": "pricing_ambiguous" if matches else "pricing_unavailable"}
        )

    entry = matches[0]

    with localcontext() as context:
        context.prec = max(
            28,
            len(str(evidence.input_tokens))
            + len(entry.input_usd_per_million.as_tuple().digits)
            + len(str(evidence.output_tokens))
            + len(entry.output_usd_per_million.as_tuple().digits)
            + abs(entry.input_usd_per_million.as_tuple().exponent)
            + abs(entry.output_usd_per_million.as_tuple().exponent)
            + 10,
        )
        input_usd = evidence.input_tokens * entry.input_usd_per_million / Decimal(1_000_000)
        output_usd = evidence.output_tokens * entry.output_usd_per_million / Decimal(1_000_000)

        return ExecutionCost(
            estimated_usd=input_usd + output_usd,
            input_usd=input_usd,
            output_usd=output_usd,
            input_tokens=evidence.input_tokens,
            output_tokens=evidence.output_tokens,
            pricing_entry=entry,
            reason=None,
        )
