import type { JsonObject, ScenarioCreate, ScenarioType } from "../types";

// Editable values used to compose a new scenario.
export interface ScenarioFields {
  scenarioKey: string;
  name: string;
  scenarioType: ScenarioType;
  history: string;
  userMessage: string;
}

// Result of validating one addition, including the reset editor values.
export interface ScenarioAddition {
  scenario: ScenarioCreate;
  nextFields: ScenarioFields;
}

// Create fresh initial values for the scenario editor.
export function initialScenarioFields(): ScenarioFields {
  return {
    scenarioKey: "",
    name: "",
    scenarioType: "single_turn",
    history: "[]",
    userMessage: "",
  };
}

// Reject blank values while preserving intentional message whitespace.
function requireText(value: string, label: string): string {
  if (!value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

// Parse and fully validate the Phase 1 text-message history contract.
function parseHistory(value: string, required: boolean): JsonObject[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Conversation history must be valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Conversation history must be a JSON array.");
  }
  if (required && parsed.length === 0) {
    throw new Error("Multi-turn history must contain at least one message.");
  }
  return parsed.map((message, index) => {
    if (
      typeof message !== "object" ||
      message === null ||
      Array.isArray(message)
    ) {
      throw new Error(`History message ${index + 1} must be an object.`);
    }
    const values = message as Record<string, unknown>;
    const keys = Object.keys(values);
    if (
      keys.length !== 2 ||
      !keys.includes("role") ||
      !keys.includes("content")
    ) {
      throw new Error(
        `History message ${index + 1} must contain only role and content.`,
      );
    }
    if (values.role !== "user" && values.role !== "assistant") {
      throw new Error(`History message ${index + 1} has an invalid role.`);
    }
    if (typeof values.content !== "string" || !values.content.trim()) {
      throw new Error(`History message ${index + 1} needs text content.`);
    }
    return {
      role: values.role,
      content: values.content,
    };
  });
}

// Build a validated scenario while preventing duplicate keys.
export function buildScenario(
  fields: ScenarioFields,
  scenarios: ScenarioCreate[],
): ScenarioCreate {
  const scenarioKey = requireText(fields.scenarioKey, "Scenario key").trim();
  if (scenarios.some((scenario) => scenario.scenario_key === scenarioKey)) {
    throw new Error(
      `Scenario key "${scenarioKey}" is already in this dataset.`,
    );
  }

  const input: JsonObject = {
    user_message: requireText(fields.userMessage, "User message"),
  };
  if (fields.scenarioType !== "single_turn") {
    input.history = parseHistory(
      fields.history,
      fields.scenarioType === "multi_turn",
    );
  }
  return {
    scenario_key: scenarioKey,
    name: requireText(fields.name, "Scenario name").trim(),
    scenario_type: fields.scenarioType,
    input,
  };
}

// Validate one addition and provide fresh values after it succeeds.
export function prepareScenarioAddition(
  fields: ScenarioFields,
  scenarios: ScenarioCreate[],
): ScenarioAddition {
  return {
    scenario: buildScenario(fields, scenarios),
    nextFields: initialScenarioFields(),
  };
}

// Append one scenario without mutating the existing collection.
export function addScenario(
  scenarios: ScenarioCreate[],
  scenario: ScenarioCreate,
): ScenarioCreate[] {
  return [...scenarios, scenario];
}

// Remove one scenario without mutating the existing collection.
export function removeScenario(
  scenarios: ScenarioCreate[],
  index: number,
): ScenarioCreate[] {
  return scenarios.filter((_, scenarioIndex) => scenarioIndex !== index);
}

// Reject final dataset submission until at least one scenario is present.
export function requireScenarios(
  scenarios: ScenarioCreate[],
): ScenarioCreate[] {
  if (scenarios.length === 0) {
    throw new Error("Add at least one scenario before creating the dataset.");
  }
  return scenarios;
}
