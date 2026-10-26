"""Versioned transport-independent attempt and evidence contracts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from gatekeeper.contracts.candidates import Candidate
from gatekeeper.contracts.common import Contract, JsonObject
from gatekeeper.contracts.providers import Provider
from gatekeeper.contracts.rules import EffectiveRuleBinding
from gatekeeper.contracts.run_settings import RunSettings
from gatekeeper.contracts.scenarios import Scenario, ScenarioType

# Persisted attempt lifecycle, independent of future grading.
AttemptStatus = Literal["pending", "running", "completed", "failed", "timed_out", "skipped"]


# Safe machine-readable explanation without provider credentials or exception text.
class ExecutionError(Contract):
    code: str
    source: Literal["configuration", "provider", "transport", "infrastructure"]
    message: str
    http_status: int | None = None


# One requested function call, without any claim of tool execution.
class ToolRequest(Contract):
    call_id: str | None = None
    name: str | None = None
    arguments_text: str | None = None
    arguments: JsonObject | None = None
    issues: list[str] = Field(default_factory=list)


# Provider-neutral observations retained independently from transport artifacts.
class ExecutionEvidence(Contract):
    version: Literal[1] = 1
    execution_id: UUID
    run_id: UUID
    scenario_id: UUID
    attempt_number: int = Field(ge=1)
    status: AttemptStatus
    started_at: datetime
    completed_at: datetime
    duration_ms: float | None = Field(default=None, ge=0)
    response_text: str | None = None
    refusal: str | None = None
    finish_reason: str | None = None
    requested_model: str
    returned_model: str | None = None
    provider_request_id: str | None = None
    provider_type: str
    adapter: str
    source: Literal["direct_provider_response", "backend_observation"] = "direct_provider_response"
    tool_requests: list[ToolRequest] | None = None
    input_tokens: int | None = Field(default=None, ge=0, strict=True)
    output_tokens: int | None = Field(default=None, ge=0, strict=True)
    completeness_issues: list[str] = Field(default_factory=list)
    error: ExecutionError | None = None


# Lightweight progress record excludes large evidence artifacts.
class ExecutionAttempt(Contract):
    id: UUID
    run_id: UUID
    scenario_id: UUID
    scenario_key: str
    scenario_name: str
    scenario_type: ScenarioType
    attempt_number: int = Field(ge=1)
    status: AttemptStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: ExecutionError | None = None


# Inspectable attempt with credential-free request and sanitized response artifacts.
class ExecutionAttemptDetail(ExecutionAttempt):
    evidence: ExecutionEvidence | None = None
    request: JsonObject | None = None
    response: JsonObject | None = None


# Private persisted snapshot is never accepted by an invocation adapter.
class ExecutionSnapshot(Contract):
    version: Literal[1] = 1
    candidate: Candidate
    provider: Provider
    settings: RunSettings
    scenarios: list[Scenario]
    effective_rules: dict[str, list[EffectiveRuleBinding]]
