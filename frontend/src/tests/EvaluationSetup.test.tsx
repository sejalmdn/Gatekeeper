// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { EvaluationSetup } from "../pages/EvaluationSetup";
import { EvaluationRunDetail } from "../pages/EvaluationRunDetail";
import type { Candidate, Dataset, EvaluationRun, RunSettings } from "../types";

let container: HTMLDivElement;
let root: Root;
const candidate: Candidate = {
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
const dataset: Dataset = {
  id: "d",
  project_id: "p",
  name: "Ecommerce",
  description: "Six scenarios",
  created_at: candidate.created_at,
};
const settings: RunSettings = {
  id: "s",
  project_id: "p",
  name: "Saved settings",
  attempts_per_scenario: 3,
  timeout_ms: 30000,
  pass_threshold: 0.8,
  created_at: candidate.created_at,
};
const run: EvaluationRun = {
  id: "r",
  project_id: "p",
  candidate_id: "c",
  dataset_id: "d",
  run_settings_id: "s",
  status: "pending",
  created_at: candidate.created_at,
  started_at: null,
  completed_at: null,
};

// Provides isolated project resources and real routed form interactions.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "listCandidates").mockResolvedValue([candidate]);
  vi.spyOn(api, "listDatasets").mockResolvedValue([dataset]);
  vi.spyOn(api, "listRunSettings").mockResolvedValue([]);
  vi.spyOn(api, "createRunSettings").mockResolvedValue(settings);
  vi.spyOn(api, "createEvaluationRun").mockResolvedValue(run);
  vi.spyOn(api, "getEvaluationRun").mockResolvedValue(run);
  vi.spyOn(api, "getCandidate").mockResolvedValue(candidate);
  vi.spyOn(api, "getDataset").mockResolvedValue(dataset);
  vi.spyOn(api, "getRunSettings").mockResolvedValue(settings);
});

// Disposes route state and restores transport after each scenario.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Exercises setup and saved confirmation through their actual route boundaries.
async function renderPage(
  path = "/projects/p/evaluation-runs/new?candidate=c",
): Promise<void> {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/projects/:projectId/evaluation-runs/new"
            element={<EvaluationSetup />}
          />
          <Route
            path="/projects/:projectId/evaluation-runs/:recordId"
            element={<EvaluationRunDetail />}
          />
          <Route
            path="/projects/p/candidates/c"
            element={<p>Candidate page</p>}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

// Updates controlled inputs with native DOM events.
async function enter(id: string, value: string): Promise<void> {
  const element = container.querySelector<HTMLInputElement | HTMLSelectElement>(
    `#${id}`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

// Bypasses browser constraint validation to verify submission guards as well.
async function submit(): Promise<void> {
  await act(async () =>
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}

// Persist only selected references and converted settings, without invoking a candidate.
it("preselects the candidate and saves a pending run with editable settings", async () => {
  await renderPage();
  expect(
    container.querySelector<HTMLSelectElement>("#evaluation-candidate")?.value,
  ).toBe("c");
  expect(
    container.querySelector<HTMLSelectElement>("#evaluation-dataset")?.value,
  ).toBe("");
  expect(container.textContent).toContain("without calling the model");
  await enter("evaluation-dataset", "d");
  await enter("evaluation-attempts", "5");
  await enter("evaluation-timeout", "12.5");
  await enter("evaluation-threshold", "90");
  await submit();
  expect(api.createRunSettings).toHaveBeenCalledWith("p", {
    name: expect.any(String),
    attempts_per_scenario: 5,
    timeout_ms: 12500,
    pass_threshold: 0.9,
  });
  expect(api.createEvaluationRun).toHaveBeenCalledExactlyOnceWith("p", {
    candidate_id: "c",
    dataset_id: "d",
    run_settings_id: "s",
  });
  expect(container.textContent).toContain("Pending · execution unavailable");
  expect(api.getEvaluationRun).toHaveBeenCalledWith("p", "r");
});

// Reuse settings rather than creating redundant records for every evaluation.
it("reuses existing settings and supports dataset entry", async () => {
  vi.mocked(api.listRunSettings).mockResolvedValue([settings]);
  await renderPage("/projects/p/evaluation-runs/new?dataset=d");
  expect(
    container.querySelector<HTMLSelectElement>("#evaluation-dataset")?.value,
  ).toBe("d");
  await enter("evaluation-candidate", "c");
  await submit();
  expect(api.createRunSettings).not.toHaveBeenCalled();
  expect(api.createEvaluationRun).toHaveBeenCalledOnce();
});

// Invalid values must not create either settings or a run.
it("rejects missing choices and invalid numeric settings", async () => {
  await renderPage("/projects/p/evaluation-runs/new?candidate=outside-project");
  expect(
    container.querySelector<HTMLSelectElement>("#evaluation-candidate")?.value,
  ).toBe("");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Choose a candidate",
  );
  await enter("evaluation-candidate", "c");
  await enter("evaluation-dataset", "d");
  await enter("evaluation-attempts", "1.5");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "whole attempts",
  );
  await enter("evaluation-attempts", "3");
  await enter("evaluation-threshold", "101");
  await submit();
  expect(api.createRunSettings).not.toHaveBeenCalled();
  expect(api.createEvaluationRun).not.toHaveBeenCalled();
});

// Retain successful settings and the user's draft if run creation fails.
it("retains the draft and saved settings across a failed run request", async () => {
  vi.mocked(api.createEvaluationRun).mockRejectedValueOnce(
    new Error("Save failed"),
  );
  await renderPage();
  await enter("evaluation-dataset", "d");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Save failed",
  );
  expect(
    container.querySelector<HTMLSelectElement>("#evaluation-dataset")?.value,
  ).toBe("d");
  await submit();
  expect(api.createRunSettings).toHaveBeenCalledOnce();
  expect(api.createEvaluationRun).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Pending · execution unavailable");
});

// A settings failure cannot create a run referencing a nonexistent settings record.
it("retains setup when saving settings fails", async () => {
  vi.mocked(api.createRunSettings).mockRejectedValueOnce(
    new Error("Settings unavailable"),
  );
  await renderPage();
  await enter("evaluation-dataset", "d");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Settings unavailable",
  );
  expect(api.createEvaluationRun).not.toHaveBeenCalled();
  await submit();
  expect(api.createEvaluationRun).toHaveBeenCalledOnce();
});

// Suppress repeated clicks throughout the two-request save sequence.
it("prevents duplicate submissions while a pending run is being saved", async () => {
  let resolveRun: (value: EvaluationRun) => void = () => undefined;
  vi.mocked(api.createEvaluationRun).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRun = resolve;
      }),
  );
  await renderPage();
  await enter("evaluation-dataset", "d");
  await submit();
  await submit();
  expect(api.createRunSettings).toHaveBeenCalledOnce();
  expect(api.createEvaluationRun).toHaveBeenCalledOnce();
  expect(
    container.querySelector<HTMLFieldSetElement>("fieldset")?.disabled,
  ).toBe(true);
  await act(async () => resolveRun(run));
  expect(container.textContent).toContain("Pending · execution unavailable");
});

// Cancellation returns to the candidate without persisting any setup.
it("cancels back to the originating candidate", async () => {
  await renderPage();
  const cancel = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent === "Cancel")!;
  await act(async () => cancel.click());
  expect(container.textContent).toBe("Candidate page");
  expect(api.createRunSettings).not.toHaveBeenCalled();
  expect(api.createEvaluationRun).not.toHaveBeenCalled();
});

// Give users a way to resolve missing setup prerequisites.
it("offers dataset creation when no datasets exist", async () => {
  vi.mocked(api.listDatasets).mockResolvedValue([]);
  await renderPage();
  expect(container.textContent).toContain("Add a dataset first");
  expect(
    container.querySelector('a[href="/projects/p/datasets/new"]'),
  ).not.toBeNull();
  expect(container.querySelector("form")).toBeNull();
});

// A read failure must not render a form with incomplete project choices.
it("shows resource loading failures", async () => {
  vi.mocked(api.listDatasets).mockRejectedValue(
    new Error("Datasets unavailable"),
  );
  await renderPage();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Datasets unavailable",
  );
  expect(container.querySelector("form")).toBeNull();
});

// Persisted configuration remains visible on direct navigation and page refresh.
it("loads a saved run and displays its actual configuration", async () => {
  await renderPage("/projects/p/evaluation-runs/r");
  expect(container.textContent).toContain("Baseline");
  expect(container.textContent).toContain("Ecommerce");
  expect(container.textContent).toContain("30 seconds");
  expect(container.textContent).toContain("80%");
  expect(api.createEvaluationRun).not.toHaveBeenCalled();
});
