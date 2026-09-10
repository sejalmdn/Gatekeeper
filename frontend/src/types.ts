// JSON object values accepted by the Gatekeeper API.
export type JsonObject = Record<string, unknown>;

// Control-plane project record.
export interface Project {
  id: string;
  name: string;
  created_at: string;
}

// Candidate record with a frozen runtime configuration.
export interface Candidate {
  id: string;
  project_id: string;
  application_version: string;
  runtime_configuration: JsonObject;
  runtime_configuration_digest: string;
  created_at: string;
}

// Scenario data that is safe to send to a runner.
export interface Scenario {
  scenario_id: string;
  input: JsonObject;
}

// Immutable scenario dataset release.
export interface DatasetRelease {
  id: string;
  project_id: string;
  dataset_name: string;
  version: string;
  scenarios: Scenario[];
  content_digest: string;
  created_at: string;
}

// Immutable evaluator and scoring configuration release.
export interface Config {
  id: string;
  project_id: string;
  name: string;
  version: string;
  settings: JsonObject;
  thresholds: Record<string, number>;
  weights: Record<string, number>;
  default_attempts: number;
  digest: string;
  created_at: string;
}

// Evaluation record composed from immutable source snapshots.
export interface Evaluation {
  id: string;
  project_id: string;
  candidate_id: string;
  dataset_release_id: string;
  config_id: string;
  candidate_digest: string;
  dataset_release_digest: string;
  config_digest: string;
  candidate_snapshot: Candidate;
  dataset_release_snapshot: DatasetRelease;
  config_snapshot: Config;
  created_at: string;
}
