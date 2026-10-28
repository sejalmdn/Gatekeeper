"""Pure aggregation independent of invocation, evaluation, and persistence."""

from collections import Counter
from uuid import UUID

from gatekeeper.contracts.evaluation_runs import EvaluationRunStatus
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.contracts.reporting import (
    AttemptTotals,
    BindingSummary,
    MetricStatistics,
    OperationalMetrics,
    ReportingAttempt,
    RunAggregates,
    RunSummary,
    ScenarioSummary,
    Stability,
    WeightedScore,
)
from gatekeeper.contracts.rules import EffectiveRuleBinding

# Fixed product weights apply only to scored bindings.
WEIGHTS = {"critical": 4, "high": 3, "medium": 2, "low": 1}
OUTCOMES = ("pass", "fail", "cannot_evaluate", "error", "not_evaluated")


# Keep missing planned attempts visible in both independent count families.
def attempt_totals(attempts: list[ReportingAttempt], planned: int) -> AttemptTotals:
    """Summarize attempts using planned as the pass-rate denominator; return explicit counts."""
    statuses = Counter(attempt.status for attempt in attempts)
    verdicts = Counter(attempt.verdict for attempt in attempts)
    statuses["not_allocated"] = planned - len(attempts)
    verdicts["not_evaluated"] += planned - len(attempts)

    return AttemptTotals(
        planned_attempts=planned,
        passing_attempts=verdicts["pass"],
        decisive_attempts=verdicts["pass"] + verdicts["fail"],
        pass_rate=verdicts["pass"] / planned if planned else None,
        execution_status_counts={
            key: statuses[key]
            for key in (
                "pending",
                "running",
                "completed",
                "failed",
                "timed_out",
                "skipped",
                "not_allocated",
            )
        },
        evaluation_verdict_counts={key: verdicts[key] for key in OUTCOMES},
    )


# Count each planned frozen binding once per attempt without multiplying attempt totals.
def binding_summary(
    binding: EffectiveRuleBinding, attempts: list[ReportingAttempt], planned: int
) -> BindingSummary:
    """Group saved outcomes for binding across attempts and planned slots; return its summary."""
    counts = Counter(attempt.outcomes.get(str(binding.id), "not_evaluated") for attempt in attempts)
    counts["not_evaluated"] += planned - len(attempts)

    return BindingSummary(
        rule_binding_id=binding.id,
        rule_key=binding.rule_key,
        rule_type=binding.rule_type,
        role=binding.role,
        severity=binding.severity,
        planned_results=planned,
        outcome_counts={key: counts[key] for key in OUTCOMES},
    )


# Require complete decisive scored evidence before publishing a weighted score.
def weighted_score(bindings: list[BindingSummary]) -> WeightedScore:
    """Compute fixed severity weights for bindings; return score, coverage, and missing reason."""
    scored = [binding for binding in bindings if binding.role == "scored"]
    planned = sum(WEIGHTS[item.severity] * item.planned_results for item in scored)
    passing = sum(WEIGHTS[item.severity] * item.outcome_counts["pass"] for item in scored)
    known = passing + sum(WEIGHTS[item.severity] * item.outcome_counts["fail"] for item in scored)

    return WeightedScore(
        planned_weight=planned,
        known_weight=known,
        passing_weight=passing,
        coverage=known / planned if planned else None,
        weighted_score=passing / planned if planned and known == planned else None,
        reason=(
            "no_scored_rules"
            if not planned
            else "incomplete_scored_results"
            if known != planned
            else None
        ),
    )


# Preserve zero-valued observations while keeping empty statistics null.
def statistics(values: list[float | int | None]) -> MetricStatistics:
    """Summarize non-null values and count missing entries; return metric statistics."""
    observed = [value for value in values if value is not None]

    return MetricStatistics(
        observed_count=len(observed),
        missing_count=len(values) - len(observed),
        minimum=min(observed) if observed else None,
        maximum=max(observed) if observed else None,
        mean=sum(observed) / len(observed) if observed else None,
        sum=sum(observed) if observed else None,
    )


# Separate invocation success from eligibility of each individual metric.
def metrics(attempts: list[ReportingAttempt], planned: int) -> OperationalMetrics:
    """Aggregate completed attempts' observations with planned exclusion counts; return metrics."""
    completed = [attempt for attempt in attempts if attempt.status == "completed"]

    return OperationalMetrics(
        completed_invocations=len(completed),
        excluded_unsuccessful_attempts=sum(
            attempt.status in {"failed", "timed_out"} for attempt in attempts
        ),
        excluded_unexecuted_attempts=planned
        - sum(
            attempt.status in {"completed", "failed", "timed_out", "running"}
            for attempt in attempts
        ),
        excluded_in_progress_attempts=sum(attempt.status == "running" for attempt in attempts),
        latency_ms=statistics([attempt.duration_ms for attempt in completed]),
        input_tokens=statistics([attempt.input_tokens for attempt in completed]),
        output_tokens=statistics([attempt.output_tokens for attempt in completed]),
        total_tokens=statistics(
            [
                attempt.input_tokens + attempt.output_tokens
                if attempt.input_tokens is not None and attempt.output_tokens is not None
                else None
                for attempt in completed
            ]
        ),
    )


# Automatic checks remain distinct from authored binding outcomes.
def automatic_counts(attempts: list[ReportingAttempt]) -> dict[str, int]:
    """Count saved automatic tool checks in attempts; return counts by outcome."""
    counts = Counter(
        check.outcome for attempt in attempts for check in attempt.automatic_tool_validation
    )

    return {key: counts[key] for key in OUTCOMES if key != "not_evaluated"}


# Unknown outcomes take precedence over apparent threshold success or stability.
def scenario_reasons(
    attempts: list[ReportingAttempt], bindings: list[BindingSummary], planned: int
) -> list[str]:
    """Find unknown evidence in attempts and planned bindings; return stable safe reason codes."""
    reasons = set()

    if not any(binding.role == "required" for binding in bindings):
        reasons.add("no_required_checks")

    if len(attempts) != planned:
        reasons.add("missing_attempts")

    for attempt in attempts:
        if attempt.status != "completed":
            reasons.add("invocation_unsuccessful")

        if not attempt.has_evidence:
            reasons.add("missing_evidence")

        if attempt.evaluator_version is None:
            reasons.add("missing_evaluation")

        if attempt.verdict not in {"pass", "fail"}:
            reasons.add("non_decisive_evaluation")

        for check in attempt.automatic_tool_validation:
            if check.outcome in {"error", "cannot_evaluate"}:
                reasons.add("unknown_automatic_validation")

    if any(
        binding.outcome_counts[key]
        for binding in bindings
        for key in ("error", "cannot_evaluate", "not_evaluated")
    ):
        reasons.add("incomplete_rule_results")

    return sorted(reasons)


# Classify repeats only after all planned evidence is decisive.
def stability(totals: AttemptTotals, pending: bool, reasons: list[str]) -> Stability:
    """Classify totals given pending state and unknown reasons; return repeat stability."""
    if pending:
        return "pending"

    if reasons:
        return "inconclusive"

    if totals.decisive_attempts < 2:
        return "insufficient_repeats"

    if totals.passing_attempts == totals.decisive_attempts:
        return "consistent_pass"

    return "flaky" if totals.passing_attempts else "consistent_fail"


# Build scenario reports in snapshot order and sum run weights across all planned slots.
def aggregate_run(
    project_id: UUID,
    run_id: UUID,
    status: EvaluationRunStatus,
    snapshot: ExecutionSnapshot,
    attempts: list[ReportingAttempt],
) -> RunSummary:
    """Aggregate saved attempts against snapshot for scoped run_id/status; return a run report."""
    scenarios = []
    active = status in {"pending", "running"}
    planned = snapshot.settings.attempts_per_scenario
    by_scenario: dict[UUID, list[ReportingAttempt]] = {}

    for attempt in attempts:
        by_scenario.setdefault(attempt.scenario_id, []).append(attempt)

    for scenario in snapshot.scenarios:
        observed = [
            attempt
            for attempt in by_scenario.get(scenario.id, [])
            if 1 <= attempt.attempt_number <= planned
        ]
        bindings = [
            binding_summary(binding, observed, planned)
            for binding in snapshot.effective_rules.get(str(scenario.id), [])
        ]
        totals = attempt_totals(observed, planned)
        pending = active and (
            len(observed) < planned
            or any(
                attempt.status in {"pending", "running"}
                or (attempt.status == "completed" and attempt.evaluator_version is None)
                for attempt in observed
            )
        )
        reasons = scenario_reasons(observed, bindings, planned)
        assessment = (
            "inconclusive"
            if reasons
            else (
                "met"
                if totals.pass_rate is not None
                and totals.pass_rate >= snapshot.settings.pass_threshold
                else "not_met"
            )
        )
        scenarios.append(
            ScenarioSummary(
                scenario_id=scenario.id,
                scenario_key=scenario.scenario_key,
                scenario_name=scenario.name,
                pass_threshold=snapshot.settings.pass_threshold,
                assessment="pending" if pending else assessment,
                stability=stability(totals, pending, reasons),
                reasons=[] if pending else reasons,
                attempts=totals,
                bindings=bindings,
                automatic_tool_validation_counts=automatic_counts(observed),
                score=weighted_score(bindings),
                metrics=metrics(observed, planned),
            )
        )

    grouped: dict[tuple[UUID, str], BindingSummary] = {}

    for scenario in scenarios:
        for binding in scenario.bindings:
            key = (binding.rule_binding_id, binding.role)

            if key not in grouped:
                grouped[key] = binding.model_copy(deep=True)
            else:
                grouped[key].planned_results += binding.planned_results

                for outcome, count in binding.outcome_counts.items():
                    grouped[key].outcome_counts[outcome] += count

    all_bindings = list(grouped.values())
    total_planned = planned * len(scenarios)

    return RunSummary(
        project_id=project_id,
        evaluation_run_id=run_id,
        execution_status=status,
        availability="available",
        evaluator_versions=sorted(
            {
                attempt.evaluator_version
                for attempt in attempts
                if attempt.evaluator_version is not None
            }
        ),
        scenarios=scenarios,
        aggregates=RunAggregates(
            attempts=attempt_totals(attempts, total_planned),
            scenario_assessment_counts={
                key: sum(scenario.assessment == key for scenario in scenarios)
                for key in ("met", "not_met", "inconclusive", "pending")
            },
            bindings=all_bindings,
            automatic_tool_validation_counts=automatic_counts(attempts),
            score=weighted_score(all_bindings),
            metrics=metrics(attempts, total_planned),
        ),
    )
