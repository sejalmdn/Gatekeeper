"""Async semantic grading around the pure deterministic evaluator."""

from datetime import UTC, datetime

import httpx

from gatekeeper.contracts.evaluations import AttemptEvaluation
from gatekeeper.contracts.executions import ExecutionEvidence, ExecutionSnapshot
from gatekeeper.contracts.judging import JudgeConfiguration, JudgeRecord
from gatekeeper.contracts.pricing import ExecutionCost
from gatekeeper.contracts.scenarios import Scenario
from gatekeeper.evaluation.engine import attempt_verdict, evaluate_attempt
from gatekeeper.integrations.judge import JudgeRateLimiter, judge_attempt


# Combine independently collected judge results with the existing verdict and scoring policy.
async def coordinate_evaluation(
    client: httpx.AsyncClient,
    configuration: ExecutionSnapshot,
    scenario: Scenario,
    evidence: ExecutionEvidence,
    cost: ExecutionCost | None,
    limiter: JudgeRateLimiter,
) -> AttemptEvaluation:
    """Evaluate saved evidence/cost with frozen configuration/scenario using client and limiter."""
    rules = configuration.effective_rules[str(scenario.id)]
    evaluation = evaluate_attempt(evidence, rules, configuration.candidate.tool_definitions, cost)
    rubric_rules = [rule for rule in rules if rule.rule_type == "judge.rubric"]
    judge_configuration = JudgeConfiguration()

    if (
        not rubric_rules
        or evidence.status != "completed"
        or scenario.scenario_type not in {"single_turn", "multi_turn"}
    ):
        return evaluation

    if evidence.response_text is None:
        record = JudgeRecord(
            configuration=judge_configuration,
            requested_model=judge_configuration.model,
            outcome="cannot_evaluate",
            reason="response_unavailable",
        )
    else:
        record = await judge_attempt(
            client, judge_configuration, scenario, evidence.response_text, rubric_rules, limiter
        )

    evaluation.judge = record
    thresholds = {rule.id: rule.parameters["min_score"] for rule in rubric_rules}
    scores = {result.binding_id: result for result in record.results}

    for result in evaluation.rule_results:
        if result.rule_binding_id not in thresholds:
            continue

        result.evidence_references = ["/response_text"]

        if record.outcome == "completed":
            scored = scores[result.rule_binding_id]
            result.score = scored.score
            result.outcome = (
                "pass" if scored.score >= thresholds[result.rule_binding_id] else "fail"
            )
            result.reason = (
                "rubric_satisfied" if result.outcome == "pass" else "rubric_not_satisfied"
            )
            result.explanation = scored.reason
        else:
            result.outcome = record.outcome
            result.reason = record.reason or "judge_internal_error"
            result.explanation = result.reason.replace("_", " ").capitalize() + "."

    evaluation.verdict = attempt_verdict(
        evaluation.rule_results, evaluation.automatic_tool_validation
    )
    evaluation.evaluator_version = "deterministic-v2+rubric-v1"
    evaluation.evaluated_at = datetime.now(UTC)

    return evaluation
