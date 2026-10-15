import type {
  Candidate,
  CandidateCreate,
  Dataset,
  DatasetCreate,
  Project,
  Provider,
  Scenario,
} from "./types";

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
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? item.msg
          : item,
      )
      .join("; ");
  }
  return "The request could not be completed.";
}

// Send a JSON API request and surface structured API errors.
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? body.detail
        : body;
    throw new ApiError(response.status, errorMessage(detail));
  }
  return body as T;
}

// Project operations.
export const listProjects = (): Promise<Project[]> =>
  request<Project[]>("/v1/projects");
export const getProject = (projectId: string): Promise<Project> =>
  request<Project>(`/v1/projects/${projectId}`);
export const createProject = (name: string): Promise<Project> =>
  request<Project>("/v1/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

// Provider operations.
export const listProviders = (projectId: string): Promise<Provider[]> =>
  request<Provider[]>(`/v1/projects/${projectId}/providers`);
export const getProvider = (
  projectId: string,
  providerId: string,
): Promise<Provider> =>
  request<Provider>(`/v1/projects/${projectId}/providers/${providerId}`);
export function createProvider(
  projectId: string,
  payload: Pick<
    Provider,
    "name" | "provider_type" | "base_url" | "credential_ref"
  >,
): Promise<Provider> {
  return request<Provider>(`/v1/projects/${projectId}/providers`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Candidate operations.
export const listCandidates = (projectId: string): Promise<Candidate[]> =>
  request<Candidate[]>(`/v1/projects/${projectId}/candidates`);
export const getCandidate = (
  projectId: string,
  candidateId: string,
): Promise<Candidate> =>
  request<Candidate>(`/v1/projects/${projectId}/candidates/${candidateId}`);
export function createCandidate(
  projectId: string,
  payload: CandidateCreate,
): Promise<Candidate> {
  return request<Candidate>(`/v1/projects/${projectId}/candidates`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Dataset operations.
export const listDatasets = (projectId: string): Promise<Dataset[]> =>
  request<Dataset[]>(`/v1/projects/${projectId}/datasets`);
export const getDataset = (
  projectId: string,
  datasetId: string,
): Promise<Dataset> =>
  request<Dataset>(`/v1/projects/${projectId}/datasets/${datasetId}`);
export function createDataset(
  projectId: string,
  payload: DatasetCreate,
): Promise<Dataset> {
  return request<Dataset>(`/v1/projects/${projectId}/datasets`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Scenario operations.
export const listScenarios = (
  projectId: string,
  datasetId: string,
): Promise<Scenario[]> =>
  request<Scenario[]>(
    `/v1/projects/${projectId}/datasets/${datasetId}/scenarios`,
  );
