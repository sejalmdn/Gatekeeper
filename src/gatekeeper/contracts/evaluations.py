"""Attempt verdicts and deterministic evaluation results, separate from execution status."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from gatekeeper.contracts.common import Contract
from gatekeeper.contracts.executions import ExecutionAttempt
from gatekeeper.contracts.judging import JudgeRecord
from gatekeeper.contracts.rules import EffectiveRuleBinding, RuleRole, RuleType, Severity

# Rule outcomes preserve evaluator failures and insufficient evidence.
RuleOutcome = Literal["pass", "fail", "cannot_evaluate", "error"]
AttemptVerdict = Literal["pass", "fail", "cannot_evaluate", "error", "not_evaluated"]


# Safe explanation with pointers into the normalized execution evidence.
class CheckResult(Contract):
    outcome: RuleOutcome
    reason: str
    explanation: str
    evidence_references: list[str] = Field(default_factory=list)


# Bound-rule identity is copied from the frozen configuration.
class RuleEvaluationResult(CheckResult):
    rule_binding_id: UUID
    rule_key: str
    rule_type: RuleType
    role: RuleRole
    severity: Severity
    score: int | None = Field(default=None, strict=True, ge=1, le=5)


# Complete evaluation committed atomically after evidence has been saved.
class AttemptEvaluation(Contract):
    execution_id: UUID
    verdict: AttemptVerdict
    evaluator_version: str
    evaluated_at: datetime
    automatic_tool_validation: list[CheckResult] = Field(default_factory=list)
    rule_results: list[RuleEvaluationResult] = Field(default_factory=list)
    judge: JudgeRecord | None = None


# Lightweight evaluation information retains execution progress as an independent field.
class AttemptEvaluationSummary(ExecutionAttempt):
    verdict: AttemptVerdict = "not_evaluated"
    evaluator_version: str | None = None
    evaluated_at: datetime | None = None
    outcome_counts: dict[str, int] = Field(default_factory=dict)


# Detail includes baseline checks and individual frozen binding results.
class AttemptEvaluationDetail(AttemptEvaluationSummary):
    automatic_tool_validation: list[CheckResult] = Field(default_factory=list)
    rule_results: list[RuleEvaluationResult] = Field(default_factory=list)
    judge: JudgeRecord | None = None
    rule_configurations: list[EffectiveRuleBinding] = Field(default_factory=list)
