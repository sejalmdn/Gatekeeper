// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import * as api from "../api";
import type { Dataset, RuleBinding, Scenario } from "../types";
import { RuleEditor } from "../components/RuleEditor";

let container: HTMLDivElement;
let root: Root;
let onCancel: Mock<() => void>;
let onSaved: Mock<() => void>;
const dataset: Dataset = {
  id: "d",
  project_id: "p",
  name: "Support",
  description: null,
  created_at: "2026-01-01T00:00:00Z",
};
const scenarios: Scenario[] = [
  {
    id: "single",
    dataset_id: "d",
    scenario_key: "hello",
    name: "Hello",
    scenario_type: "single_turn",
    input: { user_message: "Hello" },
    created_at: dataset.created_at,
  },
  {
    id: "tool",
    dataset_id: "d",
    scenario_key: "lookup",
    name: "Lookup",
    scenario_type: "tool_use",
    input: {
      user_message: "Look up the order",
      history: [],
    },
    created_at: dataset.created_at,
  },
];
const multiTurnScenario: Scenario = {
  id: "multi",
  dataset_id: "d",
  scenario_key: "follow-up",
  name: "Follow-up",
  scenario_type: "multi_turn",
  input: {
    history: [{ role: "user", content: "My order is ORD-1" }],
    user_message: "Where is it?",
  },
  created_at: dataset.created_at,
};

// Mount the embedded form with real browser controls.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onCancel = vi.fn();
  onSaved = vi.fn();
});

// Restore mocked transport and dispose every mounted form.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Open either a dataset-wide editor or a scenario shortcut.
async function renderEditor(
  initialScenarioId = "",
  bindings: RuleBinding[] = [],
  availableScenarios: Scenario[] = scenarios,
): Promise<void> {
  await act(async () =>
    root.render(
      <RuleEditor
        projectId="p"
        dataset={dataset}
        scenarios={availableScenarios}
        bindings={bindings}
        initialScenarioId={initialScenarioId}
        onCancel={onCancel}
        onSaved={onSaved}
      />,
    ),
  );
}

// Enter native input changes through React's controlled-value tracker.
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

// Choose a radio-backed scope, check, or result role by its contract value.
async function choose(name: string, value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${name}"][value="${value}"]`,
  )!;
  await act(async () => input.click());
}

// Toggle one of the dataset-wide scenario-type checkboxes.
async function chooseDatasetType(value: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(
    `input[name="rule-applies-to"][value="${value}"]`,
  )!;
  await act(async () => input.click());
}

// Return the currently available check values without the placeholder.
function availableChecks(): string[] {
  return [...container.querySelectorAll<HTMLOptionElement>("#rule-type option")]
    .map((option) => option.value)
    .filter(Boolean);
}

// Submit without relying on native form validation in the DOM test environment.
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

// Keep scenario-specific compatibility while using the grouped native picker.
it("filters scenario checks by the selected scenario", async () => {
  await renderEditor("tool");
  expect(
    (container.querySelector("#rule-scenario") as HTMLSelectElement).value,
  ).toBe("tool");
  expect(availableChecks()).toContain("tool.expected_calls");
  expect(availableChecks()).not.toContain("response.required_text");
  await enter("rule-type", "tool.expected_calls");
  await enter("rule-scenario", "single");
  expect(availableChecks()).toContain("response.required_text");
  expect(availableChecks()).not.toContain("tool.expected_calls");
  expect(
    (container.querySelector("#rule-type") as HTMLSelectElement).value,
  ).toBe("");
});

// Require an explicit dataset subset and reopen its section on an empty submission.
it("starts with only present dataset types unselected and requires one", async () => {
  await renderEditor();
  const typeInputs = [
    ...container.querySelectorAll<HTMLInputElement>(
      'input[name="rule-applies-to"]',
    ),
  ];
  expect(typeInputs.map((input) => input.value)).toEqual([
    "single_turn",
    "tool_use",
  ]);
  expect(typeInputs.every((input) => !input.checked)).toBe(true);
  expect(
    (container.querySelector("#rule-type") as HTMLSelectElement).disabled,
  ).toBe(true);
  const scopeSection = container.querySelector<HTMLDetailsElement>(
    ".rule-form > details",
  )!;
  scopeSection.open = false;
  await submit();
  expect(scopeSection.open).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Select at least one dataset scenario type",
  );
});

// Keep an empty immutable dataset explicit and prevent check selection.
it("shows no dataset type choices when the dataset has no scenarios", async () => {
  await renderEditor("", [], []);
  expect(
    container.querySelectorAll('input[name="rule-applies-to"]'),
  ).toHaveLength(0);
  expect(container.textContent).toContain(
    "This dataset has no scenarios available for a dataset-wide rule.",
  );
  expect(
    (container.querySelector("#rule-type") as HTMLSelectElement).disabled,
  ).toBe(true);
});

// Intersect compatibility across dataset types and retain only valid parameter drafts.
it("filters dataset checks for every selected type", async () => {
  await renderEditor();
  await chooseDatasetType("single_turn");
  expect(availableChecks()).toContain("response.json_valid");
  expect(availableChecks()).toContain("metric.latency");
  expect(availableChecks()).not.toContain("tool.selection");

  await enter("rule-type", "response.regex");
  await enter("rule-param-pattern", "kept-until-incompatible");
  await chooseDatasetType("tool_use");
  expect(availableChecks()).toEqual([
    "metric.latency",
    "metric.tokens",
    "metric.cost",
  ]);
  expect(
    (container.querySelector("#rule-type") as HTMLSelectElement).value,
  ).toBe("");
  await chooseDatasetType("single_turn");
  expect(availableChecks()).toContain("tool.selection");
  expect(availableChecks()).toContain("metric.latency");
  expect(availableChecks()).not.toContain("response.json_valid");
  await chooseDatasetType("single_turn");
  await chooseDatasetType("tool_use");
  await enter("rule-type", "response.regex");
  expect(
    (container.querySelector("#rule-param-pattern") as HTMLInputElement).value,
  ).toBe("");

  await enter("rule-type", "metric.latency");
  await enter("rule-param-max_ms", "2500");
  await chooseDatasetType("tool_use");
  expect(
    (container.querySelector("#rule-type") as HTMLSelectElement).value,
  ).toBe("metric.latency");
  expect(
    (container.querySelector("#rule-param-max_ms") as HTMLInputElement).value,
  ).toBe("2500");
});

// Treat single-turn and multi-turn response evidence alike for dataset rules.
it("offers response, JSON, and metric checks for both response scenario types", async () => {
  await renderEditor("", [], [scenarios[0], multiTurnScenario]);
  await chooseDatasetType("single_turn");
  await chooseDatasetType("multi_turn");
  expect(
    [...container.querySelectorAll("#rule-type optgroup")].map((group) =>
      group.getAttribute("label"),
    ),
  ).toEqual(["Response content", "JSON structure", "Speed, tokens, or cost"]);
  expect(availableChecks()).not.toContain("tool.selection");
});

// Preserve explicit applicability across scope changes and serialize it canonically.
it("saves the selected dataset types in canonical order", async () => {
  const create = vi
    .spyOn(api, "createRuleBinding")
    .mockRejectedValueOnce(new api.ApiError(422, "Rule was rejected"))
    .mockResolvedValueOnce({} as RuleBinding);
  await renderEditor();
  await chooseDatasetType("tool_use");
  await chooseDatasetType("single_turn");
  await choose("rule-scope", "scenario");
  await choose("rule-scope", "dataset");
  expect(
    container.querySelector<HTMLInputElement>(
      'input[name="rule-applies-to"][value="single_turn"]',
    )?.checked,
  ).toBe(true);
  expect(
    container.querySelector<HTMLInputElement>(
      'input[name="rule-applies-to"][value="tool_use"]',
    )?.checked,
  ).toBe(true);
  await enter("rule-type", "metric.latency");
  await enter("rule-param-max_ms", "2500");
  await enter("rule-key", "latency");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Rule was rejected",
  );
  expect(
    (container.querySelector("#rule-param-max_ms") as HTMLInputElement).value,
  ).toBe("2500");
  await submit();
  expect(create).toHaveBeenLastCalledWith("p", "d", {
    scenario_id: null,
    rule_key: "latency",
    rule_type: "metric.latency",
    role: "required",
    severity: "medium",
    parameters: {
      max_ms: 2500,
    },
    applies_to: ["single_turn", "tool_use"],
  });
  expect(onSaved).toHaveBeenCalledOnce();
});

// Preserve values across independent collapsing and reopen the first invalid section.
it("starts expanded, retains collapsed values, and reopens invalid configuration", async () => {
  await renderEditor();
  const sections = [
    ...container.querySelectorAll<HTMLDetailsElement>(".rule-form > details"),
  ];
  expect(sections).toHaveLength(5);
  expect(sections.every((section) => section.open)).toBe(true);
  expect(
    sections.map((section) => section.querySelector("summary")?.textContent),
  ).toEqual([
    "1. Where should this apply?",
    "2. What should Gatekeeper check?",
    "3. Configure the expectation",
    "4. How should failure affect the result?",
    "5. Review",
  ]);
  expect(
    sections.every(
      (section) => section.querySelector("summary small") === null,
    ),
  ).toBe(true);
  await chooseDatasetType("single_turn");
  await enter("rule-type", "response.regex");
  await enter("rule-param-pattern", "kept-value");
  sections[2].open = false;
  await enter("rule-key", "needs-mode");
  expect(sections[0].open).toBe(true);
  expect(sections[2].open).toBe(false);
  await enter("rule-param-pattern", "");
  await submit();
  expect(sections[2].open).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Pattern is required",
  );
});

// Show weight only for scored rules while preserving and mapping its value.
it("maps result choices and prevents racing duplicate submissions", async () => {
  let finishRequest: (rule: RuleBinding) => void = () => undefined;
  const create = vi.spyOn(api, "createRuleBinding").mockImplementation(
    () =>
      new Promise((resolve) => {
        finishRequest = resolve;
      }),
  );
  await renderEditor("single");
  await enter("rule-type", "response.json_valid");
  expect(container.querySelector("#rule-severity")).toBeNull();
  await choose("rule-role", "scored");
  const weight = container.querySelector<HTMLSelectElement>("#rule-severity")!;
  expect(weight.value).toBe("medium");
  expect([...weight.options].map((option) => option.textContent)).toEqual([
    "4 — Critical",
    "3 — High",
    "2 — Medium",
    "1 — Low",
  ]);
  await enter("rule-severity", "low");
  await choose("rule-role", "informational");
  expect(container.querySelector("#rule-severity")).toBeNull();
  await choose("rule-role", "scored");
  expect(
    container.querySelector<HTMLSelectElement>("#rule-severity")?.value,
  ).toBe("low");
  await choose("rule-role", "informational");
  await enter("rule-key", "valid-json");
  expect(
    container.querySelector(".rule-form__review-summary")?.textContent,
  ).not.toContain("weight");
  await choose("rule-role", "scored");
  expect(
    container.querySelector(".rule-form__review-summary")?.textContent,
  ).toContain("Low weight (1)");
  await choose("rule-role", "informational");
  await submit();
  await submit();
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][2]).toMatchObject({
    role: "informational",
    severity: "medium",
  });
  expect(container.querySelector("fieldset")?.disabled).toBe(true);
  await act(async () => finishRequest({} as RuleBinding));
  expect(onSaved).toHaveBeenCalledOnce();
});

// Send the preserved scored weight through the unchanged severity field.
it("submits the selected scored weight", async () => {
  const create = vi
    .spyOn(api, "createRuleBinding")
    .mockResolvedValue({} as RuleBinding);
  await renderEditor("single");
  await enter("rule-type", "response.json_valid");
  await choose("rule-role", "scored");
  await enter("rule-severity", "high");
  await enter("rule-key", "json-score");
  await submit();
  expect(create.mock.calls[0][2]).toMatchObject({
    role: "scored",
    severity: "high",
  });
});

// Reveal the prose review only once all client-side payload fields are valid.
it("hides the rule summary until the complete draft is valid", async () => {
  await renderEditor("single");
  expect(container.textContent).not.toContain("Rule summary");
  await enter("rule-type", "response.regex");
  await enter("rule-key", "order-id");
  expect(container.textContent).not.toContain("Rule summary");
  await enter("rule-param-pattern", "ORD-[0-9]+");
  expect(container.textContent).toContain("Rule summary");
  await enter("rule-param-pattern", "");
  expect(container.textContent).not.toContain("Rule summary");
});

// Keep compact parameters in a two-column workspace and structured editors wide.
it("presents expectation controls without changing their draft behavior", async () => {
  await renderEditor("single");
  await enter("rule-type", "response.regex");
  expect(
    container.querySelector(".rule-form__expectation-workspace > h3")
      ?.textContent,
  ).toBe("Regular expression");
  expect(
    container.querySelectorAll(
      ".rule-form__parameters > .rule-form__parameter:not(.rule-form__parameter--wide)",
    ),
  ).toHaveLength(2);
  await enter("rule-type", "response.json_schema");
  expect(
    container.querySelector(
      ".rule-form__parameters > .rule-form__parameter--wide .json-input",
    ),
  ).not.toBeNull();
});

// Explain exact-name replacement and reject same-scope duplicate names locally.
it("shows replacement review and blocks duplicate names", async () => {
  const create = vi.spyOn(api, "createRuleBinding");
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
    created_at: dataset.created_at,
  };
  await renderEditor("single", [binding]);
  await enter("rule-type", "response.json_valid");
  await enter("rule-key", "contract");
  expect(container.textContent).toContain(
    "replaces the dataset-wide rule named “contract”",
  );
  await choose("rule-scope", "dataset");
  await chooseDatasetType("single_turn");
  await enter("rule-type", "response.json_valid");
  await submit();
  expect(create).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "already exists",
  );
});
