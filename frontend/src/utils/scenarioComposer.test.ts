import { describe, expect, it } from "vitest";
import type { ScenarioCreate } from "../types";
import {
  addScenario,
  buildScenario,
  initialScenarioFields,
  prepareScenarioAddition,
  removeScenario,
  requireScenarios,
  type ScenarioFields,
} from "./scenarioComposer";

// Build valid editor values while allowing focused field overrides.
function editorFields(overrides: Partial<ScenarioFields> = {}): ScenarioFields {
  return {
    ...initialScenarioFields(),
    scenarioKey: "case-1",
    name: "Case 1",
    userMessage: "Hello",
    ...overrides,
  };
}

// Local scenario composition behavior before the atomic API request.
describe("scenario composer", () => {
  // Add and remove scenarios without mutating the existing collection.
  it("adds and removes local scenarios", () => {
    const first = buildScenario(editorFields(), []);
    const second = buildScenario(
      editorFields({
        scenarioKey: "case-2",
        name: "Case 2",
      }),
      [first],
    );
    const added = addScenario(addScenario([], first), second);
    const remaining = removeScenario(added, 0);

    expect(added).toEqual([first, second]);
    expect(remaining).toEqual([second]);
    expect(added).toHaveLength(2);
  });

  // Reject a scenario key that is already present in the collection.
  it("prevents duplicate scenario keys", () => {
    const existing = buildScenario(editorFields(), []);
    expect(() => buildScenario(editorFields(), [existing])).toThrow(
      /already in this dataset/,
    );
  });

  // Validate history shape, roles, content, and multi-turn cardinality locally.
  it.each([
    "not JSON",
    "{}",
    "[]",
    '[{"role":"system","content":"Hidden"}]',
    '[{"role":"user","content":""}]',
    '[{"role":"user","content":"Hi","extra":true}]',
  ])("rejects invalid multi-turn history: %s", (history) => {
    expect(() =>
      buildScenario(
        editorFields({
          scenarioType: "multi_turn",
          history,
        }),
        [],
      ),
    ).toThrow();
  });

  // Return fresh editor values only after a valid scenario is prepared.
  it("resets every editor field after a successful addition", () => {
    const fields = editorFields({
      scenarioType: "tool_use",
      history: '[{"role":"user","content":"Order 42"}]',
    });
    const addition = prepareScenarioAddition(fields, []);

    expect(addition.scenario.scenario_key).toBe("case-1");
    expect(addition.nextFields).toEqual(initialScenarioFields());
  });

  // Leave entered values available when validation prevents an addition.
  it("preserves editor fields when an addition fails", () => {
    const fields = editorFields({
      scenarioType: "multi_turn",
      history: "not JSON",
    });
    const originalValues = {
      ...fields,
    };

    expect(() => prepareScenarioAddition(fields, [])).toThrow(
      /must be valid JSON/,
    );
    expect(fields).toEqual(originalValues);
  });

  // Prevent an empty scenario collection from reaching dataset submission.
  it("requires at least one scenario for final submission", () => {
    expect(() => requireScenarios([])).toThrow(/at least one scenario/);
    const scenario: ScenarioCreate = buildScenario(editorFields(), []);
    expect(requireScenarios([scenario])).toEqual([scenario]);
  });
});
