import type {
  AttemptEvaluationDetail,
  AttemptEvaluationSummary,
  MetricStatistics,
  OperationalMetrics,
  RunSummary,
  ScenarioSummary,
} from "../types";
import { candidate } from "./executionFixtures";

export const evaluatedAttempt: AttemptEvaluationSummary = {
  id: "a1",
  run_id: "r",
  scenario_id: "s1",
  scenario_key: "refund",
  scenario_name: "Refund policy",
  scenario_type: "single_turn",
  attempt_number: 1,
  status: "completed",
  started_at: candidate.created_at,
  completed_at: candidate.created_at,
  error: null,
  verdict: "pass",
  evaluator_version: "deterministic-v1",
  evaluated_at: candidate.created_at,
  outcome_counts: { pass: 1 },
};

export const grade: AttemptEvaluationDetail = {
  ...evaluatedAttempt,
  automatic_tool_validation: [
    {
      outcome: "pass",
      reason: "valid_tool_schema",
      explanation: "Requested arguments match the candidate schema.",
      evidence_references: ["/tool_requests/0/arguments"],
    },
  ],
  rule_results: [
    {
      rule_binding_id: "b1",
      rule_key: "refund-content",
      rule_type: "response.required_text",
      role: "required",
      severity: "high",
      outcome: "pass",
      reason: "required_text_found",
      explanation: "Required text found in response.",
      evidence_references: ["/response_text"],
    },
  ],
};

const missing: MetricStatistics = {
  observed_count: 0,
  missing_count: 2,
  minimum: null,
  maximum: null,
  mean: null,
  sum: null,
};
const zero: MetricStatistics = {
  observed_count: 2,
  missing_count: 0,
  minimum: 0,
  maximum: 0,
  mean: 0,
  sum: 0,
};
export const metrics: OperationalMetrics = {
  completed_invocations: 2,
  excluded_unsuccessful_attempts: 1,
  excluded_unexecuted_attempts: 2,
  excluded_in_progress_attempts: 0,
  latency_ms: missing,
  input_tokens: missing,
  output_tokens: zero,
  total_tokens: missing,
};
export const scenario: ScenarioSummary = {
  scenario_id: "s1",
  scenario_key: "refund",
  scenario_name: "Refund policy",
  assessment: "not_met",
  stability: "flaky",
  pass_threshold: 0.8,
  reasons: [],
  attempts: {
    planned_attempts: 3,
    passing_attempts: 1,
    decisive_attempts: 2,
    pass_rate: 1 / 3,
    execution_status_counts: { completed: 2, timed_out: 1 },
    evaluation_verdict_counts: { pass: 1, fail: 1, cannot_evaluate: 1 },
  },
  bindings: [
    {
      rule_binding_id: "b1",
      rule_key: "refund-content",
      rule_type: "response.required_text",
      role: "required",
      severity: "high",
      planned_results: 3,
      outcome_counts: { pass: 1, fail: 1, not_evaluated: 1 },
    },
  ],
  automatic_tool_validation_counts: { pass: 2, error: 1 },
  score: {
    planned_weight: 3,
    known_weight: 2,
    passing_weight: 1,
    weighted_score: null,
    coverage: 2 / 3,
    reason: "incomplete_scored_results",
  },
  metrics,
};
export const report: RunSummary = {
  project_id: "p",
  evaluation_run_id: "r",
  execution_status: "completed",
  availability: "available",
  evaluator_versions: ["deterministic-v1"],
  reason: null,
  scenarios: [
    scenario,
    {
      ...scenario,
      scenario_id: "s2",
      scenario_key: "repeat",
      scenario_name: "Single observation",
      assessment: "met",
      stability: "insufficient_repeats",
    },
    {
      ...scenario,
      scenario_id: "s3",
      scenario_key: "unknown",
      scenario_name: "Missing evidence scenario",
      assessment: "inconclusive",
      stability: "inconclusive",
      reasons: ["missing_evidence", "new_reason_code"],
    },
  ],
  aggregates: {
    attempts: scenario.attempts,
    scenario_assessment_counts: {
      met: 1,
      not_met: 1,
      inconclusive: 1,
      pending: 0,
    },
    bindings: scenario.bindings,
    automatic_tool_validation_counts: scenario.automatic_tool_validation_counts,
    score: scenario.score,
    metrics,
  },
};
