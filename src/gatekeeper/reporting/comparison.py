"""Pure common-rule comparison over frozen settings and saved observations."""

from decimal import Decimal, localcontext
from uuid import UUID

from gatekeeper.contracts.comparisons import (
    CommonRuleComparison,
    ComparisonDifferences,
    ComparisonRun,
    ComparisonSide,
    RunComparison,
    ScenarioComparison,
)
from gatekeeper.contracts.evaluations import AttemptVerdict
from gatekeeper.contracts.executions import ExecutionSnapshot
from gatekeeper.contracts.reporting import BindingSummary, ReportingAttempt
from gatekeeper.contracts.rules import EffectiveRuleBinding
from gatekeeper.reporting.aggregation import (
    attempt_totals,
    binding_summary,
    metrics,
    weighted_score,
)


# Recompute required verdicts without trusting original verdicts influenced by exclusive rules.
def common_attempt(
    attempt: ReportingAttempt, required: list[EffectiveRuleBinding]
) -> ReportingAttempt:
    """Project attempt onto required rules plus saved automatic checks; return a copied verdict."""
    verdict: AttemptVerdict = "not_evaluated"
    outcomes = {attempt.outcomes.get(str(rule.id), "not_evaluated") for rule in required}
    outcomes.update(check.outcome for check in attempt.automatic_tool_validation)

    if attempt.has_evaluation and attempt.has_evidence:
        if "fail" in outcomes:
            verdict = "fail"
        elif "error" in outcomes:
            verdict = "error"
        elif required:
            verdict = (
                "cannot_evaluate"
                if "cannot_evaluate" in outcomes
                or "not_evaluated" in outcomes
                or attempt.status != "completed"
                else "pass"
            )

    return attempt.model_copy(update={"verdict": verdict})


# Build one side with common-rule coverage and independent operational metrics.
def side(
    attempts: list[ReportingAttempt],
    planned: int,
    bindings: list[BindingSummary],
    included: int,
    excluded: int,
    metric_attempts: list[ReportingAttempt] | None = None,
    metric_planned: int | None = None,
) -> ComparisonSide:
    """Summarize projected attempts and bindings; retain included/excluded scenario counts."""
    totals = attempt_totals(attempts, planned)

    return ComparisonSide(
        attempts=totals,
        pass_rate=totals.pass_rate if included else None,
        reason=None if included else "no_common_required_rules",
        score=weighted_score(bindings),
        metrics=metrics(
            metric_attempts if metric_attempts is not None else attempts,
            metric_planned if metric_planned is not None else planned,
        ),
        included_scenarios=included,
        excluded_scenarios=excluded,
    )


# Subtract decimal money without float conversion or truncation of tiny amounts.
def difference(a: float | Decimal | None, b: float | Decimal | None) -> float | Decimal | None:
    """Return b minus a, preserving decimal precision, or None when either operand is missing."""
    if a is None or b is None:
        return None

    if isinstance(a, Decimal) and isinstance(b, Decimal):
        with localcontext() as context:
            context.prec = max(
                28,
                len(a.as_tuple().digits)
                + len(b.as_tuple().digits)
                + abs(a.as_tuple().exponent)
                + abs(b.as_tuple().exponent)
                + 10,
            )
            return b - a

    return b - a


# Rates use percentage points while metric statistics retain their original units.
def differences(a: ComparisonSide, b: ComparisonSide) -> ComparisonDifferences:
    """Compare sides a and b; return B minus A for rates and every metric statistic."""
    values = {}

    for name in (
        "latency_ms",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "estimated_cost_usd",
    ):
        left, right = getattr(a.metrics, name), getattr(b.metrics, name)
        values[name] = {
            key: difference(getattr(left, key, None), getattr(right, key, None))
            for key in ("minimum", "maximum", "mean", "sum")
        }

    return ComparisonDifferences(
        pass_rate_pp=(b.pass_rate - a.pass_rate) * 100
        if a.pass_rate is not None and b.pass_rate is not None
        else None,
        weighted_score_pp=(b.score.weighted_score - a.score.weighted_score) * 100
        if a.score.weighted_score is not None and b.score.weighted_score is not None
        else None,
        metrics=values,
    )


# Match immutable effective binding identities separately within each frozen scenario.
def compare_runs(
    project_id: UUID,
    run_a: ComparisonRun,
    run_b: ComparisonRun,
    a: ExecutionSnapshot,
    b: ExecutionSnapshot,
    attempts_a: list[ReportingAttempt],
    attempts_b: list[ReportingAttempt],
) -> RunComparison:
    """Compare scoped frozen runs and saved attempts; return ordered common-rule statistics."""
    result = RunComparison(
        project_id=project_id, run_a=run_a, run_b=run_b, availability="available"
    )
    all_bindings: list[list[BindingSummary]] = [[], []]
    included_attempts: list[list[ReportingAttempt]] = [[], []]
    included = 0

    for setting in ("attempts_per_scenario", "timeout_ms", "pass_threshold"):
        if getattr(a.settings, setting) != getattr(b.settings, setting):
            result.warnings.append(f"different_{setting}")

    if min(a.settings.attempts_per_scenario, b.settings.attempts_per_scenario) == 1:
        result.warnings.append("single_attempt_evidence")

    for scenario in a.scenarios:
        key = str(scenario.id)
        rules_a, rules_b = a.effective_rules.get(key, []), b.effective_rules.get(key, [])
        common = {rule.id for rule in rules_a} & {rule.id for rule in rules_b}
        required = [rule for rule in rules_a if rule.id in common and rule.role == "required"]
        included += bool(required)
        sides, summaries, exclusive = [], [], []

        for index, (snapshot, rules, observed) in enumerate(
            ((a, rules_a, attempts_a), (b, rules_b, attempts_b))
        ):
            planned = snapshot.settings.attempts_per_scenario
            selected = [
                item
                for item in observed
                if item.scenario_id == scenario.id and item.attempt_number <= planned
            ]
            projected = [common_attempt(item, required) for item in selected]
            bindings = [
                binding_summary(rule, selected, planned) for rule in rules if rule.id in common
            ]
            summaries.append({item.rule_binding_id: item for item in bindings})
            exclusive.append(
                [
                    binding_summary(rule, selected, planned)
                    for rule in rules
                    if rule.id not in common
                ]
            )
            all_bindings[index].extend(bindings)

            if required:
                included_attempts[index].extend(projected)

            sides.append(side(projected, planned, bindings, int(bool(required)), int(not required)))

        common_rules = []

        for rule in rules_a:
            if rule.id not in common:
                continue

            left, right = summaries[0][rule.id], summaries[1][rule.id]
            rate_a = left.outcome_counts["pass"] / left.planned_results
            rate_b = right.outcome_counts["pass"] / right.planned_results
            common_rules.append(
                CommonRuleComparison(
                    run_a=left,
                    run_b=right,
                    pass_rate_a=rate_a,
                    pass_rate_b=rate_b,
                    pass_rate_difference_pp=(rate_b - rate_a) * 100,
                )
            )

        result.scenarios.append(
            ScenarioComparison(
                scenario_id=scenario.id,
                scenario_key=scenario.scenario_key,
                scenario_name=scenario.name,
                run_a=sides[0],
                run_b=sides[1],
                differences=differences(*sides),
                common_rules=common_rules,
                only_in_run_a=exclusive[0],
                only_in_run_b=exclusive[1],
            )
        )

    aggregates = [
        side(
            included_attempts[index],
            snapshot.settings.attempts_per_scenario * included,
            all_bindings[index],
            included,
            len(a.scenarios) - included,
            observed,
            snapshot.settings.attempts_per_scenario * len(a.scenarios),
        )
        for index, (snapshot, observed) in enumerate(((a, attempts_a), (b, attempts_b)))
    ]
    result.aggregate_a, result.aggregate_b = aggregates
    result.differences = differences(*aggregates)

    if any(
        side.reason is None
        and any(
            side.attempts.evaluation_verdict_counts[key]
            for key in ("error", "cannot_evaluate", "not_evaluated")
        )
        for scenario in result.scenarios
        for side in (scenario.run_a, scenario.run_b)
    ) or any(
        getattr(side.metrics, name).missing_count
        for side in aggregates
        for name in (
            "latency_ms",
            "input_tokens",
            "output_tokens",
            "total_tokens",
            "estimated_cost_usd",
        )
    ):
        result.warnings.append("incomplete_coverage")

    if not any(item.common_rules for item in result.scenarios):
        result.warnings.append("no_common_rules_metrics_only")

    if any(
        item.outcome_counts[key]
        for bindings in all_bindings
        for item in bindings
        for key in ("cannot_evaluate", "error", "not_evaluated")
    ) or any(
        item.metrics.completed_invocations
        < snapshot.settings.attempts_per_scenario * len(a.scenarios)
        for item, snapshot in zip(aggregates, (a, b), strict=True)
    ):
        if "incomplete_coverage" not in result.warnings:
            result.warnings.append("incomplete_coverage")

    if {
        entry.model_dump_json()
        for entry in aggregates[0].metrics.estimated_cost_usd.pricing_entries
    } != {
        entry.model_dump_json()
        for entry in aggregates[1].metrics.estimated_cost_usd.pricing_entries
    }:
        result.warnings.append("different_cost_pricing_provenance")

    return result
