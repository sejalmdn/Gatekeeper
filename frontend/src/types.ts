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
  "id" | "project_id" | "created_at"
>;

// Scenario creation payload.
export type ScenarioCreate = Omit<Scenario, "id" | "dataset_id" | "created_at">;
