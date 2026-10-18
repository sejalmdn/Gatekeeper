// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import type { Dataset, RuleBinding, Scenario } from "../types";
import { RuleEditor } from "./RuleEditor";

let container: HTMLDivElement;
let root: Root;
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

// Mount the form in a router with real browser inputs and a destination after save.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

// Restore mocked transport and dispose every mounted form.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Open either a dataset-default editor or a scenario shortcut.
async function renderEditor(
  initialScenarioId = "",
  bindings: RuleBinding[] = [],
): Promise<void> {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/new"]}>
        <Routes>
          <Route
            path="/new"
            element={
              <RuleEditor
                projectId="p"
                dataset={dataset}
                scenarios={scenarios}
                bindings={bindings}
                initialScenarioId={initialScenarioId}
              />
            }
          />
          <Route path="/projects/p/datasets/d" element={<p>Saved rules</p>} />
        </Routes>
      </MemoryRouter>,
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

// Keep only compatible checks available when following a scenario shortcut or changing scope.
it("filters check types by scope and defaults result behavior", async () => {
  await renderEditor("tool");
  expect(
    (container.querySelector("#rule-scope") as HTMLSelectElement).value,
  ).toBe("tool");
  const options = () =>
    [...container.querySelectorAll<HTMLSelectElement>("#rule-type option")].map(
      (item) => item.value,
    );
  expect(options()).toContain("tool.expected_calls");
  expect(options()).not.toContain("response.required_text");
  expect(options()).not.toContain("judge.rubric");
  expect(
    (container.querySelector("#rule-role") as HTMLSelectElement).value,
  ).toBe("required");
  expect(
    (container.querySelector("#rule-severity") as HTMLSelectElement).value,
  ).toBe("medium");
  await enter("rule-type", "tool.expected_calls");
  await enter("rule-scope", "single");
  expect(options()).toContain("response.json_field");
  expect(options()).not.toContain("tool.expected_calls");
});

// Preserve developer input after server validation fails and navigate only after success.
it("retains input after rejection and saves a complete typed binding", async () => {
  const create = vi
    .spyOn(api, "createRuleBinding")
    .mockRejectedValueOnce(new api.ApiError(422, "Invalid regular expression"))
    .mockResolvedValueOnce({} as RuleBinding);
  await renderEditor();
  await enter("rule-key", "order-pattern");
  await enter("rule-type", "response.regex");
  await enter("rule-param-pattern", "ORD-[0-9]+");
  await submit();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "Invalid regular expression",
  );
  expect(
    (container.querySelector("#rule-param-pattern") as HTMLInputElement).value,
  ).toBe("ORD-[0-9]+");
  await submit();
  expect(create).toHaveBeenLastCalledWith("p", "d", {
    scenario_id: null,
    rule_key: "order-pattern",
    rule_type: "response.regex",
    role: "required",
    severity: "medium",
    parameters: {
      pattern: "ORD-[0-9]+",
      mode: "search",
      flags: [],
    },
    applies_to: ["single_turn"],
  });
  expect(container.textContent).toContain("Saved rules");
});

// Block racing duplicate submissions and lock controls until the request completes.
it("submits once while saving and shows scope-specific conflict feedback", async () => {
  let rejectRequest: (reason: unknown) => void = () => undefined;
  const create = vi.spyOn(api, "createRuleBinding").mockImplementation(
    () =>
      new Promise((_, reject) => {
        rejectRequest = reject;
      }),
  );
  await renderEditor("single");
  await enter("rule-key", "valid-json");
  await enter("rule-type", "response.json_valid");
  await submit();
  await submit();
  expect(create).toHaveBeenCalledTimes(1);
  expect(container.querySelector("fieldset")?.disabled).toBe(true);
  await act(async () =>
    rejectRequest(new api.ApiError(409, "rule binding already exists")),
  );
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "selected scope",
  );
  expect((container.querySelector("#rule-key") as HTMLInputElement).value).toBe(
    "valid-json",
  );
});

// Make full replacement visible before saving a scenario-level rule with the same key.
it("shows override preview and blocks local duplicate keys", async () => {
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
  await enter("rule-key", "contract");
  expect(container.textContent).toContain(
    "completely replaces dataset default",
  );
  await enter("rule-scope", "");
  await enter("rule-type", "response.json_valid");
  await submit();
  expect(create).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "already exists",
  );
});
