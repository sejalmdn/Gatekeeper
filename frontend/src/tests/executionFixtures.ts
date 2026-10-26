import type { Candidate, Dataset, EvaluationRun, RunSettings } from "../types";

export const candidate: Candidate = {
  id: "c",
  project_id: "p",
  provider_id: "provider",
  name: "Baseline",
  adapter: "openrouter",
  model_name: "example/model",
  system_prompt: "Support customers.",
  generation_parameters: {},
  tool_definitions: [],
  response_format: null,
  created_at: "2026-10-24T08:00:00Z",
};
export const dataset: Dataset = {
  id: "d",
  project_id: "p",
  name: "Ecommerce",
  description: "Six scenarios",
  created_at: candidate.created_at,
};
export const settings: RunSettings = {
  id: "s",
  project_id: "p",
  name: "Saved settings",
  attempts_per_scenario: 3,
  timeout_ms: 30000,
  pass_threshold: 0.8,
  created_at: candidate.created_at,
};
export const run: EvaluationRun = {
  id: "r",
  project_id: "p",
  candidate_id: "c",
  dataset_id: "d",
  run_settings_id: "s",
  status: "pending",
  created_at: candidate.created_at,
  started_at: null,
  completed_at: null,
  queued_at: null,
  cancel_requested_at: null,
  snapshot_digest: null,
  error: null,
  total_attempts: 0,
  finished_attempts: 0,
};
