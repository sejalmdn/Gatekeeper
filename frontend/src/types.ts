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
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}
