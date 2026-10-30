// JSON values accepted by the Gatekeeper API.
export type JsonObject = Record<string, unknown>;

// Control-plane project record.
export interface Project {
  id: string;
  name: string;
  created_at: string;
}

// Model provider connection metadata.
export interface Provider {
  id: string;
  project_id: string;
  name: string;
  provider_type: string;
  base_url: string | null;
  credential_ref: string;
  created_at: string;
}

// Provider-neutral tool definition exposed to a candidate.
export interface ToolDefinition {
  name: string;
  description: string | null;
  parameters: JsonObject;
}

// Configured model or agent candidate.
export interface Candidate {
  id: string;
  project_id: string;
  provider_id: string;
  name: string;
  adapter: string;
  model_name: string;
  system_prompt: string;
  generation_parameters: JsonObject;
  tool_definitions: ToolDefinition[];
  response_format: JsonObject | null;
  created_at: string;
}

// Dataset container for typed evaluation scenarios.
export interface Dataset {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

// Supported Phase 1 scenario types.
export type ScenarioType = "single_turn" | "multi_turn" | "tool_use";

// Typed scenario stored under a dataset.
export interface Scenario {
  id: string;
  dataset_id: string;
  scenario_key: string;
  name: string;
  scenario_type: ScenarioType;
  input: JsonObject;
  created_at: string;
}

// Candidate creation payload.
export type CandidateCreate = Omit<
  Candidate,
  "id" | "project_id" | "created_at" | "adapter"
>;

// Scenario creation payload.
export type ScenarioCreate = Omit<Scenario, "id" | "dataset_id" | "created_at">;

// Atomic dataset creation payload with its immutable scenario collection.
export interface DatasetCreate {
  name: string;
  description: string | null;
  scenarios: ScenarioCreate[];
}

// Built-in checks available through the rule-binding contract.
export type RuleType =
  | "metric.latency"
  | "metric.tokens"
  | "metric.cost"
  | "response.required_text"
  | "response.forbidden_text"
  | "response.regex"
  | "response.json_valid"
  | "response.json_schema"
  | "response.json_field"
  | "response.length"
  | "judge.rubric"
  | "tool.selection"
  | "tool.argument_field"
  | "tool.expected_calls";

// Private rule configuration and its dataset or scenario scope.
export interface RuleBindingCreate {
  scenario_id: string | null;
  rule_key: string;
  rule_type: RuleType;
  role: "required" | "scored" | "informational";
  severity: "critical" | "high" | "medium" | "low";
  parameters: JsonObject;
  applies_to: ScenarioType[] | null;
}

// Persisted private rule definition.
export interface RuleBinding extends RuleBindingCreate {
  id: string;
  dataset_id: string;
  created_at: string;
}

// Resolved rule origin and replacement information for scenario inspection.
export interface EffectiveRuleBinding extends RuleBinding {
  source: "dataset" | "scenario";
  overridden_rule_id: string | null;
}

// Immutable settings used by a pending evaluation run.
export interface RunSettingsCreate {
  name: string;
  attempts_per_scenario: number;
  timeout_ms: number;
  pass_threshold: number;
}

// Saved project-level evaluation settings.
export interface RunSettings extends RunSettingsCreate {
  id: string;
  project_id: string;
  created_at: string;
}

// References selected when preparing an evaluation.
export interface EvaluationRunCreate {
  candidate_id: string;
  dataset_id: string;
  run_settings_id: string;
}

// Run lifecycle metadata; pending records do not imply execution.
export interface EvaluationRun extends EvaluationRunCreate {
  id: string;
  project_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  queued_at: string | null;
  cancel_requested_at: string | null;
  snapshot_digest: string | null;
  error: ExecutionError | null;
  total_attempts: number;
  finished_attempts: number;
}

// Structured execution failures do not imply a failed evaluation rule.
export interface ExecutionError {
  code: string;
  source: "configuration" | "provider" | "transport" | "infrastructure";
  message: string;
  http_status: number | null;
}

// Observed attempt states remain separate from grading outcomes.
export type AttemptStatus =
  "pending" | "running" | "completed" | "failed" | "timed_out" | "skipped";

// Lightweight attempt metadata returned by progress polling.
export interface ExecutionAttempt {
  id: string;
  run_id: string;
  scenario_id: string;
  scenario_key: string;
  scenario_name: string;
  scenario_type: ScenarioType;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string | null;
  completed_at: string | null;
  error: ExecutionError | null;
}

// Requested calls are evidence of intent, without claims of actual tool execution.
export interface ToolRequest {
  call_id: string | null;
  name: string | null;
  arguments_text: string | null;
  arguments: JsonObject | null;
  issues: string[];
}

// Transport-independent observations preserve unknown usage and incomplete output.
export interface ExecutionEvidence {
  version: number;
  execution_id: string;
  run_id: string;
  scenario_id: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string;
  completed_at: string;
  duration_ms: number | null;
  response_text: string | null;
  refusal: string | null;
  finish_reason: string | null;
  requested_model: string;
  returned_model: string | null;
  provider_request_id: string | null;
  provider_type: string;
  adapter: string;
  source: "direct_provider_response" | "backend_observation";
  tool_requests: ToolRequest[] | null;
  input_tokens: number | null;
  output_tokens: number | null;
  completeness_issues: string[];
  error: ExecutionError | null;
}

// Large evidence artifacts are loaded only when an attempt is opened.
export interface ExecutionAttemptDetail extends ExecutionAttempt {
  evidence: ExecutionEvidence | null;
  request: JsonObject | null;
  response: JsonObject | null;
}

// Grading outcomes remain independent of invocation lifecycle.
export type RuleOutcome = "pass" | "fail" | "cannot_evaluate" | "error";
export type AttemptVerdict = RuleOutcome | "not_evaluated";

// Safe evaluator explanation with pointers into normalized evidence.
export interface CheckResult {
  outcome: RuleOutcome;
  reason: string;
  explanation: string;
  evidence_references: string[];
}

// Frozen authored rule identity attached to one result.
export interface RuleEvaluationResult extends CheckResult {
  rule_binding_id: string;
  rule_key: string;
  rule_type: RuleType;
  role: RuleBindingCreate["role"];
  severity: RuleBindingCreate["severity"];
}

// Lightweight grades used for repeated-attempt inspection.
export interface AttemptEvaluationSummary extends ExecutionAttempt {
  verdict: AttemptVerdict;
  evaluator_version: string | null;
  evaluated_at: string | null;
  outcome_counts: Record<string, number>;
}

// Full grades are fetched only for an opened attempt.
export interface AttemptEvaluationDetail extends AttemptEvaluationSummary {
  automatic_tool_validation: CheckResult[];
  rule_results: RuleEvaluationResult[];
  rule_configurations?: EffectiveRuleBinding[];
}

// Backend denominators are displayed without recomputing assessment.
export interface AttemptTotals {
  planned_attempts: number;
  passing_attempts: number;
  decisive_attempts: number;
  pass_rate: number | null;
  execution_status_counts: Record<string, number>;
  evaluation_verdict_counts: Record<string, number>;
}

// Outcome counts for an individual frozen rule binding.
export interface BindingSummary {
  rule_binding_id: string;
  rule_key: string;
  rule_type: RuleType;
  role: RuleBindingCreate["role"];
  severity: RuleBindingCreate["severity"];
  planned_results: number;
  outcome_counts: Record<string, number>;
}

// Weighted score is unavailable until scored evidence is complete.
export interface WeightedScore {
  planned_weight: number;
  known_weight: number;
  passing_weight: number;
  coverage: number | null;
  weighted_score: number | null;
  reason: "no_scored_rules" | "incomplete_scored_results" | null;
}

// Supplied statistics preserve missing observations and observed zero.
export interface MetricStatistics {
  observed_count: number;
  missing_count: number;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  sum: number | null;
}

// Candidate operational observations exclude unsuccessful and unexecuted attempts.
export interface OperationalMetrics {
  completed_invocations: number;
  excluded_unsuccessful_attempts: number;
  excluded_unexecuted_attempts: number;
  excluded_in_progress_attempts: number;
  latency_ms: MetricStatistics;
  input_tokens: MetricStatistics;
  output_tokens: MetricStatistics;
  total_tokens: MetricStatistics;
}

// Shared totals never imply a run-wide pass/fail verdict.
export interface RunAggregates {
  attempts: AttemptTotals;
  scenario_assessment_counts: Record<string, number>;
  bindings: BindingSummary[];
  automatic_tool_validation_counts: Record<string, number>;
  score: WeightedScore;
  metrics: OperationalMetrics;
}

// Scenarios retain frozen backend order, assessment, and repeated-attempt stability.
export interface ScenarioSummary {
  scenario_id: string;
  scenario_key: string;
  scenario_name: string;
  pass_threshold: number;
  assessment: "met" | "not_met" | "inconclusive" | "pending";
  stability:
    | "consistent_pass"
    | "consistent_fail"
    | "flaky"
    | "inconclusive"
    | "pending"
    | "insufficient_repeats";
  reasons: string[];
  attempts: AttemptTotals;
  bindings: BindingSummary[];
  automatic_tool_validation_counts: Record<string, number>;
  score: WeightedScore;
  metrics: OperationalMetrics;
}

// Reporting availability is separate from execution and stored attempt grades.
export interface RunSummary {
  project_id: string;
  evaluation_run_id: string;
  execution_status: EvaluationRun["status"];
  evaluator_versions: string[];
  availability: "available" | "unavailable";
  reason: string | null;
  aggregates: RunAggregates | null;
  scenarios: ScenarioSummary[];
}
