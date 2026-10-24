// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { CandidateDetail } from "../pages/Candidates";
import type { Candidate, Provider } from "../types";

let container: HTMLDivElement;
let root: Root;
const candidate: Candidate = {
  id: "c",
  project_id: "p",
  provider_id: "provider",
  name: "Support baseline",
  adapter: "openrouter",
  model_name: "example/model",
  system_prompt:
    "Store policy:\nKeep the customer's latest correction.\n".repeat(30),
  generation_parameters: {
    max_output_tokens: 1024,
    temperature: 0.2,
    top_k: null,
    top_p: null,
  },
  tool_definitions: [
    {
      name: "lookup_order",
      description: "Read an order, never render <script>alert(1)</script>.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
        },
        required: ["order_id"],
      },
    },
  ],
  response_format: { type: "json_object" },
  created_at: "2026-10-24T08:00:00Z",
};
const provider: Provider = {
  id: "provider",
  project_id: "p",
  name: "OpenRouter",
  provider_type: "openrouter",
  base_url: null,
  credential_ref: "env:MODEL_KEY",
  created_at: candidate.created_at,
};

// Creates a real routed detail page with isolated transport and clipboard mocks.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "getCandidate").mockResolvedValue(candidate);
  vi.spyOn(api, "getProvider").mockResolvedValue(provider);
});

// Disposes route state and browser mocks after every interaction.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Resolves the current candidate and provider through the page's loading boundary.
async function renderPage(): Promise<void> {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/projects/p/candidates/c"]}>
        <Routes>
          <Route
            path="/projects/:projectId/candidates/:recordId"
            element={<CandidateDetail />}
          />
        </Routes>
      </MemoryRouter>,
    );
  });
}

// Retrieves an action by its accessible label for clipboard interaction.
function copyButton(label: string): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )!;
}

// Preserve full configuration values and links while rendering schema content as text.
it("shows identity, parameter values, tools, and configured response format", async () => {
  await renderPage();
  expect(container.querySelector("h1")?.textContent).toBe("Support baseline");
  const header = container.querySelector(".candidate-details__header")!;
  expect(
    header.querySelector(
      'a[href="/projects/p/evaluation-runs/new?candidate=c"]',
    )?.textContent,
  ).toBe("Run Evaluation");
  expect(
    header.querySelector('a[href="/projects/p/candidates"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('a[href="/projects/p/providers/provider"]')
      ?.textContent,
  ).toBe("OpenRouter");
  expect(
    container.querySelector('a[href="/projects/p/candidates"]'),
  ).not.toBeNull();
  expect(container.querySelector("time")?.dateTime).toBe(candidate.created_at);
  const parameters = container.querySelector(".candidate-details__parameters")!;
  expect(parameters.textContent).toContain("max_output_tokens1024");
  expect(parameters.textContent).toContain("top_knull");
  const tool = container.querySelector<HTMLDetailsElement>(
    ".candidate-details__tool",
  )!;
  expect(tool.open).toBe(false);
  await act(async () => tool.querySelector("summary")!.click());
  expect(tool.open).toBe(true);
  expect(
    JSON.parse(
      container.querySelector('[aria-label="Generation parameters JSON"]')!
        .textContent!,
    ),
  ).toEqual(candidate.generation_parameters);
  expect(
    JSON.parse(
      container.querySelector('[aria-label="lookup_order definition"]')!
        .textContent!,
    ),
  ).toEqual(candidate.tool_definitions[0]);
  expect(container.querySelector("script")).toBeNull();
  const schemaContent = container.querySelector<HTMLElement>(
    '[aria-label="lookup_order definition"]',
  )!;
  const schemaView = EditorView.findFromDOM(schemaContent)!;
  expect(schemaView.state.readOnly).toBe(true);
  expect(schemaContent.getAttribute("contenteditable")).toBe("false");
  expect(schemaContent.getAttribute("aria-readonly")).toBe("true");
  expect(schemaContent.tabIndex).toBe(0);
  expect(schemaView.state.doc.toString()).toBe(
    JSON.stringify(candidate.tool_definitions[0], null, 2),
  );
  expect(
    container.querySelector('[aria-label="Response format JSON"]')?.textContent,
  ).toContain("json_object");
});

// Copy the entire prompt even while its visual preview is collapsed.
it("expands long prompts and copies the complete prompt and tool array", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await renderPage();
  const expand = container.querySelector<HTMLButtonElement>(
    ".candidate-details__expand",
  )!;
  expect(expand.getAttribute("aria-expanded")).toBe("false");
  expect(
    container.querySelector(".candidate-details__prompt-body--collapsed"),
  ).not.toBeNull();
  await act(async () => copyButton("Copy system prompt").click());
  expect(writeText).toHaveBeenLastCalledWith(candidate.system_prompt);
  expect(copyButton("Copy system prompt").textContent).toContain("Copied");
  await act(async () => expand.click());
  expect(expand.getAttribute("aria-expanded")).toBe("true");
  expect(
    container.querySelector(".candidate-details__prompt-body--collapsed"),
  ).toBeNull();
  await act(async () => expand.click());
  expect(expand.textContent).toContain("Read more");
  await act(async () => copyButton("Copy tool definitions").click());
  expect(writeText).toHaveBeenLastCalledWith(
    JSON.stringify(candidate.tool_definitions, null, 2),
  );
});

// Make clipboard denial visible and allow a successful retry.
it("reports clipboard errors without claiming the copy succeeded", async () => {
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error("Denied"))
    .mockResolvedValueOnce(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  await renderPage();
  await act(async () => copyButton("Copy system prompt").click());
  expect(copyButton("Copy system prompt").textContent).toContain("Copy failed");
  await act(async () => copyButton("Copy system prompt").click());
  expect(copyButton("Copy system prompt").textContent).toContain("Copied");
});

// Missing optional configuration stays explicit without inventing defaults.
it("handles empty configuration and unavailable provider metadata", async () => {
  vi.mocked(api.getCandidate).mockResolvedValue({
    ...candidate,
    system_prompt: "",
    tool_definitions: [],
    generation_parameters: {},
    response_format: null,
  });
  vi.mocked(api.getProvider).mockRejectedValue(
    new Error("Provider unavailable"),
  );
  await renderPage();
  expect(container.textContent).toContain("No system prompt configured.");
  expect(container.textContent).toContain("No tools configured.");
  expect(container.textContent).toContain(
    "No generation overrides configured.",
  );
  expect(
    container.querySelector('a[href="/projects/p/providers/provider"]')
      ?.textContent,
  ).toBe("View provider");
  expect(container.querySelector(".candidate-details__expand")).toBeNull();
  expect(
    container.querySelector('[aria-label="Copy tool definitions"]'),
  ).toBeNull();
  expect(
    container.querySelector('[aria-label="Response format JSON"]'),
  ).toBeNull();
});
