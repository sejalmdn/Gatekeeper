import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCandidate,
  createDataset,
  createProject,
  createProvider,
  createScenario,
  listScenarios,
} from "./api";

// API client request tests.
describe("Gatekeeper API client", () => {
  // Restore globals between request examples.
  afterEach(() => vi.unstubAllGlobals());

  // Return a successful JSON response for create requests.
  function stubRequest(): ReturnType<typeof vi.fn> {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  // Send project names to the collection endpoint.
  it("creates a project", async () => {
    const fetchMock = stubRequest();
    await createProject("Payments");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Payments" }),
      }),
    );
  });

  // Send provider connection fields to the project provider endpoint.
  it("creates a provider", async () => {
    const fetchMock = stubRequest();
    const payload = {
      name: "OpenAI",
      provider_type: "openai",
      base_url: null,
      credential_ref: "vault://openai",
    };
    await createProvider("project-1", payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects/project-1/providers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  // Preserve all candidate configuration fields in the create payload.
  it("creates a candidate tied to its provider", async () => {
    const fetchMock = stubRequest();
    const payload = {
      provider_id: "provider-1",
      name: "Support",
      adapter: "responses",
      model_name: "gpt-example",
      system_prompt: "Be concise",
      generation_parameters: {},
      tool_definitions: [],
      response_format: null,
    };
    await createCandidate("project-1", payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects/project-1/candidates",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  // Create dataset metadata without embedding scenarios.
  it("creates a dataset", async () => {
    const fetchMock = stubRequest();
    await createDataset("project-1", "Support", "Core support cases");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects/project-1/datasets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Support",
          description: "Core support cases",
        }),
      }),
    );
  });

  // Fetch scenarios separately from dataset metadata.
  it("lists scenarios from the nested collection", async () => {
    const fetchMock = stubRequest();
    await listScenarios("project-1", "dataset-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects/project-1/datasets/dataset-1/scenarios",
      expect.any(Object),
    );
  });

  // Send each supported scenario input shape unchanged.
  it.each([
    ["single_turn", { user_message: "Hello" }],
    [
      "multi_turn",
      {
        history: [{ role: "user", content: "Earlier" }],
        user_message: "Continue",
      },
    ],
    ["tool_use", { history: [], user_message: "Find my order" }],
  ] as const)("creates a %s scenario", async (scenarioType, input) => {
    const fetchMock = stubRequest();
    const payload = {
      scenario_key: "case-1",
      name: "Case 1",
      scenario_type: scenarioType,
      input,
    };
    await createScenario("project-1", "dataset-1", payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects/project-1/datasets/dataset-1/scenarios",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });
});
