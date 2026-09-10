import { describe, expect, it, vi } from "vitest";

import { createEvaluation, createProject } from "./api";

// API client request tests.
describe("Gatekeeper API client", () => {
  // Send project names to the collection endpoint.
  it("creates a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "project-1", name: "Payments", created_at: "2026-01-01" }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createProject("Payments");

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Payments" }) }),
    );
  });

  // Freeze evaluation source IDs in the API payload.
  it("creates an evaluation from source records", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await createEvaluation("project-1", "candidate-1", "dataset-1", "config-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/projects/project-1/evaluations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          candidate_id: "candidate-1",
          dataset_release_id: "dataset-1",
          config_id: "config-1",
        }),
      }),
    );
  });
});
