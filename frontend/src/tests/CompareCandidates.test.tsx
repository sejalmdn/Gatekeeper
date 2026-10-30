// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { CompareCandidatesPage } from "../pages/CompareCandidatesPage";
import { candidate, dataset, run, settings } from "./executionFixtures";

let container: HTMLDivElement;
let root: Root;
const first = { ...run, id: "a", status: "completed" as const };
const second = { ...run, id: "b", status: "cancelled" as const };

// Supplies metadata without invoking comparisons or providers during selection.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "listDatasets").mockResolvedValue([
    dataset,
    { ...dataset, id: "other", name: "Other dataset" },
  ]);
  vi.spyOn(api, "listCandidates").mockResolvedValue([
    candidate,
    { ...candidate, id: "unrun", name: "Never run" },
    { ...candidate, id: "busy", name: "Active only" },
  ]);
  vi.spyOn(api, "listEvaluationRuns").mockResolvedValue([
    first,
    second,
    { ...first, id: "active", candidate_id: "busy", status: "running" },
    { ...first, id: "different", dataset_id: "other" },
  ]);
  vi.spyOn(api, "listRunSettings").mockResolvedValue([settings]);
  vi.spyOn(api, "getRunComparison");
});

// Removes mounted state and isolated metadata after each test.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Restores the selection page from its shareable route.
async function mount(query = "") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/projects/p/compare-candidates${query}`]}>
        <Routes>
          <Route
            path="/projects/:projectId/compare-candidates"
            element={<CompareCandidatesPage />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

// Changes the visible selector through the browser's change event.
async function choose(index: number, value: string) {
  await act(async () => {
    const select = container.querySelectorAll("select")[index];
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Selects a saved run using the same radio control as the user.
async function selectRun(side: string, id: string) {
  await act(async () =>
    container
      .querySelector<HTMLInputElement>(
        `input[name="run${side}"][value="${id}"]`,
      )!
      .click(),
  );
}

// Progressive selection starts empty and exposes only compatible candidate evidence.
it("starts with a dataset and progressively selects candidates and distinct runs", async () => {
  await mount();
  expect(container.querySelectorAll("select")).toHaveLength(1);
  expect(container.querySelectorAll("input")).toHaveLength(0);
  expect(container.textContent).toContain("Choose the evidence to compare");
  await choose(0, "d");
  expect(container.querySelectorAll("select")).toHaveLength(3);
  expect(container.textContent).not.toContain("Never run");
  expect(container.textContent).not.toContain("Active only");
  await choose(1, "c");
  await choose(2, "c");
  expect(container.textContent).toContain("3 attempts / scenario");
  await selectRun("A", "a");
  expect(container.querySelector('input[name="runB"][value="a"]')).toBeNull();
  expect(container.querySelector('input[value="active"]')).toBeNull();
  expect(container.querySelector('input[value="different"]')).toBeNull();
  await selectRun("B", "b");
  expect(
    container.querySelector(
      'a[href="/projects/p/evaluation-runs/compare?runA=a&runB=b"]',
    ),
  ).not.toBeNull();
  expect(api.getRunComparison).not.toHaveBeenCalled();
});

// Returning from results infers dataset and candidates while retaining both saved runs.
it("restores both sides from result run IDs and clears choices on dataset changes", async () => {
  await mount("?runA=a&runB=b");
  expect(
    [...container.querySelectorAll("select")].map((select) => select.value),
  ).toEqual(["d", "c", "c"]);
  expect(container.querySelectorAll("input:checked")).toHaveLength(2);
  await choose(0, "other");
  expect(
    [...container.querySelectorAll("select")].map((select) => select.value),
  ).toEqual(["other", "", ""]);
  expect(container.querySelectorAll("input:checked")).toHaveLength(0);
  expect(container.textContent).toContain("No compatible pair of runs yet");
  expect(container.querySelector("button:disabled")).not.toBeNull();
});

// Changing a candidate clears only its run, retaining the other side's evidence selection.
it("clears a run when its candidate changes", async () => {
  await mount("?runA=a&runB=b");
  await choose(1, "");
  expect(container.querySelector('input[name="runA"]')).toBeNull();
  expect(
    container
      .querySelector('input[name="runB"]:checked')
      ?.getAttribute("value"),
  ).toBe("b");
  expect(container.querySelector("button:disabled")).not.toBeNull();
});

// Invalid historical links remain visible and cannot produce a comparison link.
it("explains invalid linked choices without discarding their identities", async () => {
  await mount("?dataset=d&candidateA=c&runA=missing&runB=active");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "missing / active",
  );
  expect(container.querySelector("a.compare-candidates__submit")).toBeNull();
  expect(container.textContent).toContain("unavailable or incompatible");
});

// A failed catalog can be retried without changing the linked selections.
it("retries catalog errors and retains preselected evidence", async () => {
  vi.mocked(api.listDatasets).mockRejectedValueOnce(
    new Error("Temporary network error"),
  );
  await mount("?runA=a&runB=b");
  expect(container.textContent).toContain("Temporary network error");
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelectorAll("input:checked")).toHaveLength(2);
});

// A project without datasets gives a concrete next step before any candidate selectors.
it("directs empty projects to datasets", async () => {
  vi.mocked(api.listDatasets).mockResolvedValue([]);
  await mount();
  expect(
    container.querySelector('a[href="/projects/p/datasets"]'),
  ).not.toBeNull();
  expect(container.querySelectorAll("select")).toHaveLength(1);
});
