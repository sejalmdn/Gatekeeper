// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import type { EffectiveRuleBinding, RuleBinding, Scenario } from "../types";
import { DatasetRules } from "./DatasetRules";

let container: HTMLDivElement;
let root: Root;
const scenarios: Scenario[] = ["single", "other"].map((id) => ({
  id,
  dataset_id: "d",
  scenario_key: id,
  name: id,
  scenario_type: "single_turn",
  input: { user_message: "Hello" },
  created_at: "2026-01-01T00:00:00Z",
}));
const binding: RuleBinding = {
  id: "default",
  dataset_id: "d",
  scenario_id: null,
  rule_key: "contract",
  rule_type: "response.json_valid",
  parameters: {},
  role: "required",
  severity: "medium",
  applies_to: ["single_turn"],
  created_at: "2026-01-01T00:00:00Z",
};

// Provide real router links and isolate backend responses for each rule-list state.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

// Dispose pending readers so late responses cannot update a different scenario.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Render the dataset rules panel with two scenarios available for inspection.
async function renderPanel(): Promise<void> {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DatasetRules projectId="p" datasetId="d" scenarios={scenarios} />
      </MemoryRouter>,
    ),
  );
}

// Select effective rules through the actual scenario selector.
async function selectScenario(id: string): Promise<void> {
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Give an empty collection a concrete create action and show read failures explicitly.
it("provides an empty-state create action and surfaces effective-rule failures", async () => {
  vi.spyOn(api, "listRuleBindings").mockResolvedValue([]);
  vi.spyOn(api, "listEffectiveRules").mockRejectedValue(
    new Error("Could not read rules"),
  );
  await renderPanel();
  expect(container.textContent).toContain("No rules in this scope");
  expect(container.querySelector("a")?.getAttribute("href")).toBe(
    "/projects/p/datasets/d/rules/new",
  );
  await selectScenario("single");
  expect(container.textContent).toContain("Could not read rules");
  expect(container.querySelector("a")?.getAttribute("href")).toContain(
    "?scenario=single",
  );
});

// Render backend provenance and ignore a pending scenario response after changing scope.
it("shows inherited and replacement origins without mixing scenario responses", async () => {
  vi.spyOn(api, "listRuleBindings").mockResolvedValue([binding]);
  let finishSingle: (rules: EffectiveRuleBinding[]) => void = () => undefined;
  const effective = vi
    .spyOn(api, "listEffectiveRules")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSingle = resolve;
        }),
    )
    .mockResolvedValueOnce([
      { ...binding, source: "dataset", overridden_rule_id: null },
      {
        ...binding,
        id: "override",
        rule_key: "specific",
        scenario_id: "other",
        applies_to: null,
        source: "scenario",
        overridden_rule_id: "original",
      },
    ]);
  await renderPanel();
  expect(container.textContent).toContain("Dataset default: single_turn");
  await selectScenario("single");
  await selectScenario("other");
  expect(effective).toHaveBeenLastCalledWith("p", "d", "other");
  expect(container.textContent).toContain("Inherited from dataset");
  expect(container.textContent).toContain("Replaces the dataset default");
  await act(async () =>
    finishSingle([
      {
        ...binding,
        rule_key: "stale-response",
        source: "dataset",
        overridden_rule_id: null,
      },
    ]),
  );
  expect(container.textContent).not.toContain("stale-response");
  await selectScenario("");
  expect(container.textContent).not.toContain("Replaces the dataset default");
});
