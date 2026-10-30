"""Read-only comparison boundaries expose report metadata and numerical differences."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import Field

from gatekeeper.contracts.common import Contract
from gatekeeper.contracts.evaluation_runs import EvaluationRunStatus
from gatekeeper.contracts.reporting import (
    AttemptTotals,
    BindingSummary,
    OperationalMetrics,
    WeightedScore,
)
from gatekeeper.contracts.run_settings import RunSettings


# Safe frozen metadata excludes provider configuration and candidate invocation inputs.
class ComparisonRun(Contract):
    id: UUID
    candidate_id: UUID
    candidate_name: str | None = None
    model: str | None = None
    dataset_id: UUID
    dataset_name: str
    status: EvaluationRunStatus
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    settings: RunSettings | None = None


# Each side retains planned denominators, scores, and observation coverage.
class ComparisonSide(Contract):
    attempts: AttemptTotals
    pass_rate: float | None
    reason: str | None = None
    score: WeightedScore
    metrics: OperationalMetrics
    included_scenarios: int
    excluded_scenarios: int


# Differences always mean B minus A, with rates expressed in percentage points.
class ComparisonDifferences(Contract):
    pass_rate_pp: float | None
    weighted_score_pp: float | None
    metrics: dict[str, dict[str, float | Decimal | None]]


# Common binding identity is evaluated independently against each planned repeat policy.
class CommonRuleComparison(Contract):
    run_a: BindingSummary
    run_b: BindingSummary
    pass_rate_a: float | None
    pass_rate_b: float | None
    pass_rate_difference_pp: float | None


# Scenario order follows the frozen dataset, including scenarios without shared rules.
class ScenarioComparison(Contract):
    scenario_id: UUID
    scenario_key: str
    scenario_name: str
    run_a: ComparisonSide
    run_b: ComparisonSide
    differences: ComparisonDifferences
    common_rules: list[CommonRuleComparison]
    only_in_run_a: list[BindingSummary]
    only_in_run_b: list[BindingSummary]


# Historical snapshot gaps remain explicitly unavailable rather than reconstructed.
class RunComparison(Contract):
    project_id: UUID
    run_a: ComparisonRun
    run_b: ComparisonRun
    availability: Literal["available", "unavailable"]
    reason: str | None = None
    warnings: list[str] = Field(default_factory=list)
    aggregate_a: ComparisonSide | None = None
    aggregate_b: ComparisonSide | None = None
    differences: ComparisonDifferences | None = None
    scenarios: list[ScenarioComparison] = Field(default_factory=list)
