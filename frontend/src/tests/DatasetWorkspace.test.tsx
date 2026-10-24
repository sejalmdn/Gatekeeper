// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { DatasetWorkspace } from "../components/DatasetWorkspace";
import { DatasetDetail } from "../pages/Datasets";
import type { Dataset, RuleBinding, Scenario } from "../types";

let container: HTMLDivElement;
let root: Root;
let router: ReturnType<typeof createMemoryRouter>;
const dataset: Dataset = {
  id: "d",
  project_id: "p",
  name: "Support",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
};
const scenarios: Scenario[] = ["single", "other"].map((id) => ({
  id,
  dataset_id: "d",
  scenario_key: `${id}-key`,
  name: id,
  scenario_type: "single_turn",
  input: { user_message: `Input for ${id}` },
  created_at: dataset.created_at,
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
  created_at: dataset.created_at,
};

// Isolates transport and router state for each workspace interaction.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "listRuleBindings").mockResolvedValue([binding]);
});

// Disposes readers before restoring transport to prevent cross-test updates.
afterEach(async () => {
  await act(async () => root.unmount());
  router?.dispose();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Mounts real workspace navigation with optional bookmarks or legacy datasets.
async function renderWorkspace(
  entry = "/",
  availableScenarios = scenarios,
): Promise<void> {
  router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <DatasetWorkspace
            projectId="p"
            dataset={dataset}
            scenarios={availableScenarios}
          />
        ),
      },
    ],
    { initialEntries: [entry] },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
}

// Activates a visible action through its native control.
async function click(label: string): Promise<void> {
  const control = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((item) => item.textContent === label)!;
  await act(async () => control.click());
}

// Selects scenarios through the keyboard-accessible navigation links.
async function selectScenario(id: string): Promise<void> {
  const link = container.querySelector<HTMLAnchorElement>(
    `a[href$="?scenario=${id}"]`,
  )!;
  await act(async () => link.click());
}

// Enters controlled form values through React's native value tracker.
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

// Submits the real editor without relying on DOM-emulator form validation.
async function submit(): Promise<void> {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

// Shows exactly one scenario's private rules and counts, without refetching on selection.
it("combines scenario inputs and rules with local filtering and browser history", async () => {
  vi.mocked(api.listRuleBindings).mockResolvedValue([
    binding,
    {
      ...binding,
      id: "other-rule",
      scenario_id: "other",
      rule_key: "other-check",
    },
    {
      ...binding,
      id: "default",
      scenario_id: null,
      rule_key: "hidden-default",
    },
  ]);
  const effective = vi.spyOn(api, "listEffectiveRules");
  await renderWorkspace();
  expect(router.state.location.search).toBe("?scenario=single");
  expect(container.querySelector(".dataset-header h1")?.textContent).toBe(
    "Support",
  );
  expect(
    container.querySelector(".dataset-header__back")?.getAttribute("href"),
  ).toBe("/projects/p/datasets");
  expect(container.querySelector(".dataset-header__value")?.textContent).toBe(
    "2",
  );
  expect(
    container.querySelector(".dataset-header__value--rules")?.textContent,
  ).toBe("2");
  expect(
    container.querySelector(".dataset-header__value--coverage")?.textContent,
  ).toBe("2 of 2");
  expect(
    container.querySelector(".dataset-header time")?.getAttribute("datetime"),
  ).toBe(dataset.created_at);
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe("single");
  expect(container.querySelector("[aria-current=true]")?.textContent).toContain(
    "single-key",
  );
  expect(
    [...container.querySelectorAll(".dataset-scenarios__count > span")].map(
      (item) => item.textContent,
    ),
  ).toEqual(["1 configured", "1 configured"]);
  expect(container.textContent).toContain("contract");
  expect(container.textContent).not.toContain("other-check");
  expect(container.textContent).not.toContain("hidden-default");
  expect(container.querySelector(".rule-binding-list__scenario")).toBeNull();
  expect(
    container.querySelector<HTMLDetailsElement>(".dataset-workspace__input")
      ?.open,
  ).toBe(false);
  expect(
    container.querySelector<HTMLDetailsElement>(".rule-binding-list__details")
      ?.open,
  ).toBe(false);
  expect(
    container.querySelector(".dataset-workspace__input")?.textContent,
  ).toContain("Input for single");
  await selectScenario("other");
  expect(container.textContent).toContain("other-check");
  expect(container.textContent).not.toContain("contract");
  expect(
    container.querySelector(".dataset-workspace__input")?.textContent,
  ).toContain("Input for other");
  await act(async () => {
    await router.navigate(-1);
  });
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe("single");
  await act(async () => {
    await router.navigate(1);
  });
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe("other");
  expect(api.listRuleBindings).toHaveBeenCalledTimes(1);
  expect(effective).not.toHaveBeenCalled();
});

// Canonicalizes legacy tabs and invalid scopes without accidentally opening an unbound form.
it.each([
  ["/?tab=scenarios", "single"],
  ["/?tab=rules&view=inspect&scenario=other", "other"],
  ["/?tab=rules&view=add", "single"],
  ["/?scenario=missing&view=add", "single"],
])("normalizes %s into scenario inspection", async (entry, selected) => {
  await renderWorkspace(entry);
  expect(router.state.location.search).toBe(`?scenario=${selected}`);
  expect(container.querySelector("form")).toBeNull();
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe(selected);
});

// Opens valid saved authoring links in a form with a fixed scenario context.
it("accepts a legacy scoped add link and returns on Cancel", async () => {
  await renderWorkspace("/?tab=rules&view=add&scenario=other");
  expect(router.state.location.search).toBe("?scenario=other&view=add");
  expect(container.querySelector("form")).not.toBeNull();
  expect(container.querySelector("#rule-scenario")).toBeNull();
  expect(
    container.querySelector(".rule-form__scenario-context")?.textContent,
  ).toContain("other");
  expect(container.querySelector("nav[aria-label=Scenarios]")).toBeNull();
  await click("Cancel");
  expect(router.state.location.search).toBe("?scenario=other");
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe("other");
  expect(api.listRuleBindings).toHaveBeenCalledTimes(1);
});

// Keeps rejected drafts and refreshes the same scenario after a successful retry.
it("saves only for the selected scenario and refreshes bindings and counts", async () => {
  const saved = {
    ...binding,
    id: "new",
    scenario_id: "other",
    rule_key: "new-contract",
  };
  const create = vi
    .spyOn(api, "createRuleBinding")
    .mockRejectedValueOnce(new api.ApiError(422, "Rule was rejected"))
    .mockResolvedValueOnce(saved);
  await renderWorkspace("/?scenario=other");
  await click("Add rule");
  await enter("rule-type", "response.json_valid");
  await enter("rule-key", "new-contract");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Rule was rejected",
  );
  expect(container.querySelector<HTMLInputElement>("#rule-key")?.value).toBe(
    "new-contract",
  );
  vi.mocked(api.listRuleBindings).mockResolvedValue([binding, saved]);
  await submit();
  expect(create).toHaveBeenLastCalledWith(
    "p",
    "d",
    expect.objectContaining({
      scenario_id: "other",
      rule_key: "new-contract",
      applies_to: null,
    }),
  );
  expect(router.state.location.search).toBe("?scenario=other");
  expect(container.querySelector("form")).toBeNull();
  expect(container.textContent).toContain("new-contract");
  expect(
    container.querySelector(".dataset-header__value--rules")?.textContent,
  ).toBe("2");
  expect(
    container.querySelector("[aria-current=true] .dataset-scenarios__count")
      ?.textContent,
  ).toContain("1");
  expect(api.listRuleBindings).toHaveBeenCalledTimes(2);
});

// Keeps input inspection and scenario navigation available when bindings are unknown.
it("shows unknown counts and retries a rule-loading failure independently", async () => {
  let reject: (reason: Error) => void = () => undefined;
  vi.mocked(api.listRuleBindings).mockImplementationOnce(
    () =>
      new Promise((_resolve, rejectRequest) => {
        reject = rejectRequest;
      }),
  );
  await renderWorkspace();
  expect(
    container.querySelector(".dataset-header__value--rules")?.textContent,
  ).toBe("—");
  expect(
    container.querySelector(".dataset-header__value--coverage")?.textContent,
  ).toBe("—");
  expect(
    container.querySelector(".dataset-scenarios__count")?.textContent,
  ).toContain("—");
  expect(
    container.querySelector(".dataset-workspace__input")?.textContent,
  ).toContain("Input for single");
  await act(async () => reject(new Error("Network unavailable")));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Network unavailable",
  );
  expect(
    container.querySelector<HTMLButtonElement>(
      ".dataset-workspace__rules-heading button",
    )?.disabled,
  ).toBe(true);
  await selectScenario("other");
  expect(
    container.querySelector(".dataset-workspace__input")?.textContent,
  ).toContain("Input for other");
  vi.mocked(api.listRuleBindings).mockResolvedValue([]);
  await click("Retry rules");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(
    container.querySelector(".dataset-header__value--rules")?.textContent,
  ).toBe("0");
  expect(
    container.querySelector(".dataset-header__value--coverage")?.textContent,
  ).toBe("0 of 2");
  expect(container.textContent).toContain("No scenario rules yet");
  expect(
    container.querySelector(".dataset-scenarios__count")?.textContent,
  ).toContain("0");
  expect(api.listRuleBindings).toHaveBeenCalledTimes(2);
});

// Allows navigation away from a bookmarked form whose binding load failed.
it("provides a return action when authoring cannot load rules", async () => {
  vi.mocked(api.listRuleBindings).mockRejectedValue(new Error("Read failed"));
  await renderWorkspace("/?scenario=other&view=add");
  await click("Back to scenario");
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe("other");
});

// Preserves legacy empty datasets without exposing a rule creation flow.
it("handles an empty dataset", async () => {
  await renderWorkspace("/?tab=rules&view=add", []);
  expect(container.textContent).toContain("No scenarios");
  expect(container.querySelector("form")).toBeNull();
  expect(container.querySelector("button")).toBeNull();
  expect(router.state.location.search).toBe("");
});

// Retains scored weight while distinguishing required checks from informational rules.
it("shows weight only for scored rules", async () => {
  vi.mocked(api.listRuleBindings).mockResolvedValue([
    binding,
    {
      ...binding,
      id: "score",
      rule_key: "score",
      role: "scored",
      severity: "high",
    },
    { ...binding, id: "report", rule_key: "report", role: "informational" },
  ]);
  await renderWorkspace();
  expect(
    [...container.querySelectorAll(".rule-binding-list__badge")].map(
      (item) => item.textContent,
    ),
  ).toEqual([
    "Result: Required",
    "Result: Scored · High weight (3)",
    "Result: Report only",
  ]);
});

// Remounts dataset readers on route changes and discards a late previous-dataset result.
it("does not mix dataset data after navigation", async () => {
  vi.spyOn(api, "getDataset").mockImplementation(
    async (_projectId, datasetId) => ({
      ...dataset,
      id: datasetId,
      name: `Dataset ${datasetId}`,
    }),
  );
  vi.spyOn(api, "listScenarios").mockImplementation(
    async (_projectId, datasetId) => [
      {
        ...scenarios[0],
        id: `${datasetId}-scenario`,
        dataset_id: datasetId,
        name: `Scenario ${datasetId}`,
      },
    ],
  );
  let finishOld: (rules: RuleBinding[]) => void = () => undefined;
  vi.mocked(api.listRuleBindings)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    )
    .mockResolvedValueOnce([]);
  router = createMemoryRouter(
    [
      {
        path: "/projects/:projectId/datasets/:recordId",
        element: <DatasetDetail />,
      },
    ],
    { initialEntries: ["/projects/p/datasets/d"] },
  );
  await act(async () => root.render(<RouterProvider router={router} />));
  await act(async () => {
    await router.navigate("/projects/p/datasets/e");
  });
  await act(async () => finishOld([binding]));
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe("Scenario e");
  expect(container.textContent).not.toContain("contract");
  expect(api.listRuleBindings).toHaveBeenLastCalledWith("p", "e");
});

// Combines key search and type filters while preserving the selected scenario and loaded rules.
it("filters scenario navigation by key and type without refetching rules", async () => {
  await renderWorkspace("/", [
    scenarios[0],
    { ...scenarios[1], scenario_type: "multi_turn" },
    {
      ...scenarios[1],
      id: "tool",
      scenario_key: "tool-key",
      scenario_type: "tool_use",
    },
  ]);
  const search = container.querySelector<HTMLInputElement>(
    'input[type="search"]',
  )!;
  search.id = "scenario-search-test";
  await enter("scenario-search-test", "  OTHER-KEY  ");
  expect(container.querySelectorAll(".dataset-scenarios__row")).toHaveLength(1);
  expect(
    container.querySelector(".dataset-scenarios__row")?.textContent,
  ).toContain("other-key");
  await click("Tool(1)");
  expect(container.textContent).toContain("No matching scenarios.");
  expect(
    container.querySelector("#selected-scenario-heading")?.textContent,
  ).toBe("single");
  await enter("scenario-search-test", "");
  expect(container.querySelectorAll(".dataset-scenarios__row")).toHaveLength(1);
  await selectScenario("tool");
  await click("All(3)");
  expect(container.querySelectorAll(".dataset-scenarios__row")).toHaveLength(3);
  expect(container.querySelector("[aria-current=true]")?.textContent).toContain(
    "tool-key",
  );
  expect(api.listRuleBindings).toHaveBeenCalledTimes(1);
});
