"""Credential-free fixed judge configuration and separately persisted observations."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from gatekeeper.contracts.common import Contract, NonEmptyString
from gatekeeper.contracts.pricing import Money


# Deployment policy is frozen only for new rubric-bearing runs.
class JudgeConfiguration(Contract):
    model: Literal["nvidia/nemotron-3.5-lightning:free"] = "nvidia/nemotron-3.5-lightning:free"
    endpoint: Literal["https://openrouter.ai/api/v1/chat/completions"] = (
        "https://openrouter.ai/api/v1/chat/completions"
    )
    provider: Literal["openrouter"] = "openrouter"
    prompt_version: Literal["rubric-v1"] = "rubric-v1"
    temperature: Literal[0] = 0
    timeout_seconds: Literal[60] = 60
    max_output_tokens: Literal[4096] = 4096
    pricing_version: Literal["openrouter-free-v1"] = "openrouter-free-v1"
    input_usd_per_million: Literal[0] = 0
    output_usd_per_million: Literal[0] = 0


# Strict result parsing excludes boolean, fractional, empty, and extra result fields.
class JudgeScore(Contract):
    binding_id: UUID
    score: int = Field(strict=True, ge=1, le=5)
    reason: NonEmptyString


# One batch must cover exactly the applicable binding identifiers.
class JudgeScores(Contract):
    results: list[JudgeScore]


# Judge observations never enter candidate evidence or operational metrics.
class JudgeRecord(Contract):
    configuration: JudgeConfiguration
    outcome: Literal["completed", "cannot_evaluate", "error"]
    reason: str | None = None
    requested_model: str
    requested_provider: Literal["openrouter"] = "openrouter"
    reported_model: str | None = None
    reported_provider: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    latency_ms: float | None = Field(default=None, ge=0)
    input_tokens: int | None = Field(default=None, ge=0, strict=True)
    output_tokens: int | None = Field(default=None, ge=0, strict=True)
    estimated_usd: Money | None = None
    provider_reported_usd: Money | None = None
    results: list[JudgeScore] = Field(default_factory=list)
