"""Read-only summaries with explicit denominators and missing observations."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from gatekeeper.contracts.common import Contract
from gatekeeper.contracts.evaluation_runs import EvaluationRunStatus
from gatekeeper.contracts.evaluations import AttemptVerdict, CheckResult, RuleOutcome
from gatekeeper.contracts.executions import AttemptStatus
from gatekeeper.contracts.pricing import ExecutionCost, Money, PricingEntry
from gatekeeper.contracts.rules import RuleRole, RuleType, Severity

# Numeric report boundaries reject negative counts and rates outside zero through one.
Count = Annotated[int, Field(ge=0)]
Rate = Annotated[float, Field(ge=0, le=1)]
Observation = Annotated[float, Field(ge=0)]

# Scenario assessments describe evidence rather than execution lifecycle or release decisions.
Assessment = Literal["met", "not_met", "inconclusive", "pending"]
Stability = Literal[
    "consistent_pass", "consistent_fail", "flaky", "inconclusive", "pending", "insufficient_repeats"
]


# Lightweight reporting input excludes candidate responses and private rule parameters.
class ReportingAttempt(Contract):
    scenario_id: UUID
    attempt_number: Annotated[int, Field(ge=1)]
    status: AttemptStatus
    verdict: AttemptVerdict = "not_evaluated"
    evaluator_version: str | None = None
    has_evaluation: bool = False
    has_evidence: bool = False
    tool_request_count: int | None = None
    automatic_tool_validation: list[CheckResult] = Field(default_factory=list)
    outcomes: dict[str, RuleOutcome] = Field(default_factory=dict)
    cost: ExecutionCost | None = None
    duration_ms: Observation | None = None
    input_tokens: Count | None = None
    output_tokens: Count | None = None


# Attempt denominators remain independent of rule and tool-check counts.
class AttemptTotals(Contract):
    planned_attempts: Count
    passing_attempts: Count
    decisive_attempts: Count
    pass_rate: Rate | None
    execution_status_counts: dict[str, Count]
    evaluation_verdict_counts: dict[str, Count]


# Frozen binding identity and role group outcomes without exposing expectations.
class BindingSummary(Contract):
    rule_binding_id: UUID
    rule_key: str
    rule_type: RuleType
    role: RuleRole
    severity: Severity
    planned_results: Count
    outcome_counts: dict[str, Count]


# Scored-rule coverage never changes required-check assessments.
class WeightedScore(Contract):
    planned_weight: Count
    known_weight: Count
    passing_weight: Count
    coverage: Rate | None
    weighted_score: Rate | None
    reason: Literal["no_scored_rules", "incomplete_scored_results"] | None = None


# Missing metric observations stay distinct from observed zero values.
class MetricStatistics(Contract):
    observed_count: Count
    missing_count: Count
    minimum: Observation | None
    maximum: Observation | None
    mean: Observation | None
    sum: Observation | None


# Decimal monetary statistics preserve provenance and incomplete coverage.
class CostStatistics(Contract):
    observed_count: Count
    missing_count: Count
    minimum: Money | None
    maximum: Money | None
    mean: Money | None
    sum: Money | None
    sum_label: str = "Sum of known estimates"
    pricing_entries: list[PricingEntry] = Field(default_factory=list)


# Only completed invocations contribute metric observations.
class OperationalMetrics(Contract):
    estimated_cost_usd: CostStatistics | None = None
    completed_invocations: Count
    excluded_unsuccessful_attempts: Count
    excluded_unexecuted_attempts: Count
    excluded_in_progress_attempts: Count
    latency_ms: MetricStatistics
    input_tokens: MetricStatistics
    output_tokens: MetricStatistics
    total_tokens: MetricStatistics


# Ordered scenario report is derived entirely from frozen configuration and saved results.
class ScenarioSummary(Contract):
    scenario_id: UUID
    scenario_key: str
    scenario_name: str
    pass_threshold: Rate
    assessment: Assessment
    stability: Stability
    reasons: list[str]
    attempts: AttemptTotals
    bindings: list[BindingSummary]
    automatic_tool_validation_counts: dict[str, Count]
    score: WeightedScore
    tool_requests_observed: Count | None = None
    tool_requests_absent: Count | None = None
    tool_requests_unknown: Count | None = None
    metrics: OperationalMetrics


# Run totals have no run-wide verdict or additional threshold.
class RunAggregates(Contract):
    attempts: AttemptTotals
    scenario_assessment_counts: dict[str, Count]
    bindings: list[BindingSummary]
    automatic_tool_validation_counts: dict[str, Count]
    score: WeightedScore
    metrics: OperationalMetrics


# Historical runs without snapshots explicitly lack defensible aggregates.
class RunSummary(Contract):
    project_id: UUID
    evaluation_run_id: UUID
    execution_status: EvaluationRunStatus
    evaluator_versions: list[str] = Field(default_factory=list)
    availability: Literal["available", "unavailable"]
    reason: str | None = None
    aggregates: RunAggregates | None = None
    scenarios: list[ScenarioSummary] = Field(default_factory=list)
