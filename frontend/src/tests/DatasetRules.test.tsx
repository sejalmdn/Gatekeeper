// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import type { Dataset, RuleBinding, Scenario } from "../types";
import { DatasetRules } from "../components/DatasetRules";

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
  id: "specific",
  dataset_id: "d",
  scenario_id: "single",
  rule_key: "contract",
  rule_type: "response.json_valid",
  parameters: {},
  role: "required",
  severity: "medium",
  applies_to: null,
  created_at: "2026-01-01T00:00:00Z",
};
const dataset: Dataset = {
  id: "d",
  project_id: "p",
  name: "Support",
  description: null,
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
async function renderPanel(initialEntry = "/?tab=rules"): Promise<void> {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <DatasetRules projectId="p" dataset={dataset} scenarios={scenarios} />
      </MemoryRouter>,
    ),
  );
}

// Follow an inner-tab link through the memory router.
async function follow(label: string): Promise<void> {
  const link = [...container.querySelectorAll("a")].find(
    (item) => item.textContent === label,
  )!;
  await act(async () => link.click());
}

// Enter controlled values using React's native value tracker.
async function enter(id: string, value: string): Promise<void> {
  const element = container.querySelector(`#${id}`)!;
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

// Select effective rules through the actual scenario selector.
async function selectScenario(id: string): Promise<void> {
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// Give an empty collection a canonical add tab and surface binding read failures.
it("provides rule views and surfaces binding failures", async () => {
  vi.spyOn(api, "listRuleBindings")
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error("Could not read rules"));
  await renderPanel();
  expect(container.textContent).toContain("No scenario rules yet");
  expect(
    [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    ),
  ).toContain("/?tab=rules&view=add");
  await follow("Add rule");
  expect(container.textContent).toContain("Could not read rules");
});

// Hide stored dataset defaults and inspect only directly bound scenario rules.
it("filters scenario bindings without exposing dataset rules or inheritance", async () => {
  vi.spyOn(api, "listRuleBindings").mockResolvedValue([
    binding,
    {
      ...binding,
      id: "default",
      rule_key: "hidden-default",
      scenario_id: null,
      applies_to: ["single_turn"],
    },
    { ...binding, id: "other", scenario_id: "other", rule_key: "other-check" },
  ]);
  const effective = vi.spyOn(api, "listEffectiveRules");
  await renderPanel();
  expect(container.textContent).not.toContain("hidden-default");
  expect(container.textContent).not.toContain("Dataset-wide");
  expect(container.textContent).toContain("contract");
  expect(container.textContent).toContain("other-check");
  await selectScenario("other");
  expect(container.textContent).not.toContain("contract");
  expect(container.textContent).toContain("other-check");
  await selectScenario("single");
  expect(container.textContent).toContain("contract");
  expect(container.textContent).not.toContain("other-check");
  await selectScenario("");
  expect(container.textContent).toContain("other-check");
  expect(effective).not.toHaveBeenCalled();
});

// Keep weight out of badges unless the saved rule contributes to scoring.
it("shows saved weight only for scored rules", async () => {
  vi.spyOn(api, "listRuleBindings").mockResolvedValue([
    binding,
    {
      ...binding,
      id: "score",
      rule_key: "compactness",
      role: "scored",
      severity: "high",
    },
    {
      ...binding,
      id: "report",
      rule_key: "visibility",
      role: "informational",
      severity: "low",
    },
  ]);
  await renderPanel();
  const badges = [
    ...container.querySelectorAll(".rule-binding-list__badge"),
  ].map((item) => item.textContent);
  expect(badges).toEqual([
    "Required",
    "Scored · High weight (3)",
    "Report only",
  ]);
});

// Cancel to inspection and reload the authoritative bindings after a successful save.
it("returns to inspection and refreshes saved rules", async () => {
  const list = vi
    .spyOn(api, "listRuleBindings")
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([binding]);
  vi.spyOn(api, "createRuleBinding").mockResolvedValue(binding);
  await renderPanel();
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(
    "Inspect rules",
  );
  await follow("Add rule");
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(
    "Add rule",
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button.quiet-button")!.click(),
  );
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(
    "Inspect rules",
  );

  await follow("Add rule");
  await enter("rule-scenario", "single");
  await enter("rule-type", "response.json_valid");
  await enter("rule-key", "contract");
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(list).toHaveBeenCalledTimes(5);
  expect(
    container.querySelector(".rule-binding-list__scenario h3")?.textContent,
  ).toBe("single");
  expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(
    "Inspect rules",
  );
});
