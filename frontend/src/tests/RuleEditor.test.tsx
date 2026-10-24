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

// Opens an editor with an optional scenario shortcut.
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

// Require a scenario and prevent authoring a dataset-wide binding.
it("requires a scenario and exposes no dataset scope controls", async () => {
  const create = vi.spyOn(api, "createRuleBinding");
  await renderEditor();
  expect(container.querySelector('input[name="rule-scope"]')).toBeNull();
  expect(container.querySelector('input[name="rule-applies-to"]')).toBeNull();
  expect(
    container.querySelector<HTMLSelectElement>("#rule-type")?.disabled,
  ).toBe(true);
  const section = container.querySelector<HTMLDetailsElement>(
    ".rule-form > details",
  )!;
  section.open = false;
  await submit();
  expect(section.open).toBe(true);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Choose the specific scenario",
  );
  expect(create).not.toHaveBeenCalled();
});

// Keep a legacy empty dataset from producing an unbound rule.
it("disables scenario selection when the dataset has no scenarios", async () => {
  await renderEditor("", [], []);
  expect(container.textContent).toContain(
    "no scenarios available for rule binding",
  );
  expect(
    container.querySelector<HTMLSelectElement>("#rule-scenario")?.disabled,
  ).toBe(true);
  expect(
    container.querySelector<HTMLSelectElement>("#rule-type")?.disabled,
  ).toBe(true);
});

// Preserve compatible expectations when moving between response scenarios.
it("retains response checks when selecting a multi-turn scenario", async () => {
  await renderEditor("single", [], [scenarios[0], multiTurnScenario]);
  await enter("rule-type", "response.regex");
  await enter("rule-param-pattern", "ORD-[0-9]+");
  await enter("rule-scenario", "multi");
  expect(
    container.querySelector<HTMLInputElement>("#rule-param-pattern")?.value,
  ).toBe("ORD-[0-9]+");
  expect(availableChecks()).not.toContain("tool.selection");
});

// Preserve failed drafts and bind retries only to the selected scenario.
it("saves a scenario binding and retains a rejected draft", async () => {
  const create = vi
    .spyOn(api, "createRuleBinding")
    .mockRejectedValueOnce(new api.ApiError(422, "Rule was rejected"))
    .mockResolvedValueOnce({} as RuleBinding);
  await renderEditor("tool");
  await enter("rule-type", "metric.latency");
  await enter("rule-param-max_ms", "2500");
  await enter("rule-key", "latency");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Rule was rejected",
  );
  expect(
    container.querySelector<HTMLInputElement>("#rule-param-max_ms")?.value,
  ).toBe("2500");
  await submit();
  expect(create).toHaveBeenLastCalledWith("p", "d", {
    scenario_id: "tool",
    rule_key: "latency",
    rule_type: "metric.latency",
    role: "required",
    severity: "medium",
    parameters: { max_ms: 2500 },
    applies_to: null,
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
  await enter("rule-scenario", "single");
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
  expect(container.querySelector(".rule-form__check-type")?.textContent).toBe(
    "Check type: Regular expression",
  );
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

// Save a generated name with the next available version in the selected scenario.
it("generates a versioned rule name and saves it without manual naming", async () => {
  const create = vi
    .spyOn(api, "createRuleBinding")
    .mockResolvedValue({} as RuleBinding);
  const binding: RuleBinding = {
    id: "existing",
    dataset_id: "d",
    scenario_id: "single",
    rule_key: "hello_latency_limit",
    rule_type: "metric.latency",
    parameters: { max_ms: 1000 },
    role: "required",
    severity: "medium",
    applies_to: null,
    created_at: dataset.created_at,
  };
  await renderEditor("single", [
    binding,
    { ...binding, id: "version-two", rule_key: "hello_latency_limit_v2" },
    {
      ...binding,
      id: "other-scenario",
      scenario_id: "tool",
      rule_key: "hello_latency_limit_v3",
    },
  ]);
  await enter("rule-type", "metric.latency");
  expect(container.querySelector<HTMLInputElement>("#rule-key")?.value).toBe(
    "hello_latency_limit_v3",
  );
  await enter("rule-param-max_ms", "2500");
  await submit();
  expect(create).toHaveBeenCalledWith(
    "p",
    "d",
    expect.objectContaining({
      rule_key: "hello_latency_limit_v3",
      scenario_id: "single",
    }),
  );
});

// Follow scenario and check changes until the user supplies their own name.
it("updates default names and preserves a manually edited name", async () => {
  await renderEditor("single");
  await enter("rule-type", "response.required_text");
  expect(container.querySelector<HTMLInputElement>("#rule-key")?.value).toBe(
    "hello_required_text",
  );
  await enter("rule-type", "metric.latency");
  expect(container.querySelector<HTMLInputElement>("#rule-key")?.value).toBe(
    "hello_latency_limit",
  );
  await enter("rule-scenario", "tool");
  expect(container.querySelector<HTMLInputElement>("#rule-key")?.value).toBe(
    "lookup_latency_limit",
  );
  await enter("rule-key", "my_custom_name");
  await enter("rule-scenario", "single");
  await enter("rule-type", "response.forbidden_text");
  expect(container.querySelector<HTMLInputElement>("#rule-key")?.value).toBe(
    "my_custom_name",
  );
});

// Enforce rule-name uniqueness within a scenario without showing dataset inheritance.
it("blocks duplicate scenario names and omits dataset replacement wording", async () => {
  const create = vi.spyOn(api, "createRuleBinding");
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
  await renderEditor("single", [binding]);
  await enter("rule-type", "response.json_valid");
  await enter("rule-key", "contract");
  expect(container.textContent).not.toContain("dataset-wide");
  await submit();
  expect(create).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "already exists",
  );
  await enter("rule-scenario", "tool");
  await enter("rule-type", "metric.latency");
  await enter("rule-param-max_ms", "2500");
  expect(container.textContent).toContain("Rule summary");
});

// Preserves literal phrases through keyboard entry, editing, removal, and saving.
it.each(["response.required_text", "response.forbidden_text"])(
  "edits and saves phrase entries for %s",
  async (ruleType) => {
    const create = vi
      .spyOn(api, "createRuleBinding")
      .mockResolvedValue({} as RuleBinding);
    await renderEditor("single");
    await enter("rule-type", ruleType);
    await enter("rule-param-values-new", "Keep CASE, and spaces");
    await act(async () => {
      container.querySelector("#rule-param-values-new")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(create).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLInputElement>("#rule-param-values-new")
        ?.value,
    ).toBe("");
    await enter("rule-param-values-new", "remove me");
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".rule-form__list-entry button")!
        .click();
    });
    expect(container.querySelector(".rule-form__list-total")?.textContent).toBe(
      "2 defined",
    );
    await act(async () => {
      container
        .querySelectorAll<HTMLButtonElement>(".rule-form__list-remove")[1]
        .click();
    });
    await enter("rule-param-values-0", "Exact CASE, and spaces");
    expect(container.querySelector("#rule-param-case_sensitive")).toBeNull();
    await enter("rule-key", "phrase-check");
    await submit();
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0][2]).toMatchObject({
      rule_type: ruleType,
      parameters: { values: ["Exact CASE, and spaces"], case_sensitive: false },
    });
  },
);
