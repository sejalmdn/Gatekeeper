import type { Candidate, Config, DatasetRelease, Evaluation, JsonObject, Project, Scenario } from "./types";

// API error that retains the server's useful message.
export class ApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Read the API base URL while keeping same-origin production as the default.
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

// Convert FastAPI error details into readable form text.
function errorMessage(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === "object" && item !== null && "msg" in item ? item.msg : item))
      .join("; ");
  }
  return "The request could not be completed.";
}

// Send a JSON API request and surface structured API errors.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = typeof body === "object" && body !== null && "detail" in body ? body.detail : body;
    throw new ApiError(response.status, errorMessage(detail));
  }
  return body as T;
}

// List all projects.
export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/v1/projects");
}

// Fetch one project.
export function getProject(projectId: string): Promise<Project> {
  return request<Project>(`/v1/projects/${projectId}`);
}

// Create a project.
export function createProject(name: string): Promise<Project> {
  return request<Project>("/v1/projects", { method: "POST", body: JSON.stringify({ name }) });
}

// List project candidates.
export function listCandidates(projectId: string): Promise<Candidate[]> {
  return request<Candidate[]>(`/v1/projects/${projectId}/candidates`);
}

// Fetch one candidate.
export function getCandidate(projectId: string, candidateId: string): Promise<Candidate> {
  return request<Candidate>(`/v1/projects/${projectId}/candidates/${candidateId}`);
}

// Create an immutable candidate record.
export function createCandidate(
  projectId: string,
  applicationVersion: string,
  runtimeConfiguration: JsonObject,
): Promise<Candidate> {
  return request<Candidate>(`/v1/projects/${projectId}/candidates`, {
    method: "POST",
    body: JSON.stringify({
      application_version: applicationVersion,
      runtime_configuration: runtimeConfiguration,
    }),
  });
}

// List project dataset releases.
export function listDatasetReleases(projectId: string): Promise<DatasetRelease[]> {
  return request<DatasetRelease[]>(`/v1/projects/${projectId}/dataset-releases`);
}

// Fetch one dataset release.
export function getDatasetRelease(projectId: string, releaseId: string): Promise<DatasetRelease> {
  return request<DatasetRelease>(`/v1/projects/${projectId}/dataset-releases/${releaseId}`);
}

// Create an immutable dataset release.
export function createDatasetRelease(
  projectId: string,
  datasetName: string,
  version: string,
  scenarios: Scenario[],
): Promise<DatasetRelease> {
  return request<DatasetRelease>(`/v1/projects/${projectId}/dataset-releases`, {
    method: "POST",
    body: JSON.stringify({ dataset_name: datasetName, version, scenarios }),
  });
}

// List project configuration releases.
export function listConfigs(projectId: string): Promise<Config[]> {
  return request<Config[]>(`/v1/projects/${projectId}/configs`);
}

// Fetch one configuration release.
export function getConfig(projectId: string, configId: string): Promise<Config> {
  return request<Config>(`/v1/projects/${projectId}/configs/${configId}`);
}

// Create an immutable evaluator and scoring configuration release.
export function createConfig(
  projectId: string,
  name: string,
  version: string,
  settings: JsonObject,
  thresholds: Record<string, number>,
  weights: Record<string, number>,
  defaultAttempts: number,
): Promise<Config> {
  return request<Config>(`/v1/projects/${projectId}/configs`, {
    method: "POST",
    body: JSON.stringify({
      name,
      version,
      settings,
      thresholds,
      weights,
      default_attempts: defaultAttempts,
    }),
  });
}

// List project frozen evaluations.
export function listEvaluations(projectId: string): Promise<Evaluation[]> {
  return request<Evaluation[]>(`/v1/projects/${projectId}/evaluations`);
}

// Fetch one frozen evaluation.
export function getEvaluation(projectId: string, evaluationId: string): Promise<Evaluation> {
  return request<Evaluation>(`/v1/projects/${projectId}/evaluations/${evaluationId}`);
}

// Create a frozen evaluation from existing immutable records.
export function createEvaluation(
  projectId: string,
  candidateId: string,
  datasetReleaseId: string,
  configId: string,
): Promise<Evaluation> {
  return request<Evaluation>(`/v1/projects/${projectId}/evaluations`, {
    method: "POST",
    body: JSON.stringify({
      candidate_id: candidateId,
      dataset_release_id: datasetReleaseId,
      config_id: configId,
    }),
  });
}
