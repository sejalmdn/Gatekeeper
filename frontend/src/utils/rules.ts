import { rubricCriterion } from "./rubrics";
import type {
  JsonObject,
  RuleBindingCreate,
  RuleType,
  ScenarioType,
} from "../types";

export interface RuleField {
  key: string;
  label: string;
  kind: "text" | "number" | "list" | "select" | "checkbox" | "json";
  options?: string[];
  optional?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
}

export type AuthorableRuleType = RuleType;

export interface RuleDefinition {
  type: AuthorableRuleType;
  label: string;
  types: ScenarioType[];
  fields: RuleField[];
}

export interface RuleCategory {
  label: string;
  types: AuthorableRuleType[];
}

export interface RuleSeverityOption {
  value: RuleBindingCreate["severity"];
  label: string;
  weight: number;
}

const responseTypes: ScenarioType[] = ["single_turn", "multi_turn"];
const allTypes: ScenarioType[] = [...responseTypes, "tool_use"];

// Forms mirror the supported private evaluator parameter contracts.
export const RULE_DEFINITIONS: RuleDefinition[] = [
  {
    type: "judge.rubric",
    label: "Semantic rubric",
    types: responseTypes,
    fields: [
      {
        key: "criterion",
        label: "Criterion",
        kind: "text",
      },
      {
        key: "min_score",
        label: "Minimum passing score",
        kind: "number",
        min: 1,
        max: 5,
        integer: true,
      },
    ],
  },
  {
    type: "response.required_text",
    label: "Required text",
    types: responseTypes,
    fields: [
      {
        key: "values",
        label: "Required text",
        kind: "list",
      },
      {
        key: "match",
        label: "Match",
        kind: "select",
        options: ["all", "any"],
      },
    ],
  },
  {
    type: "response.forbidden_text",
    label: "Forbidden text",
    types: responseTypes,
    fields: [
      {
        key: "values",
        label: "Forbidden text",
        kind: "list",
      },
    ],
  },
  {
    type: "response.regex",
    label: "Regular expression",
    types: responseTypes,
    fields: [
      {
        key: "pattern",
        label: "Pattern",
        kind: "text",
      },
      {
        key: "mode",
        label: "Match mode",
        kind: "select",
        options: ["search", "fullmatch"],
      },
    ],
  },
  {
    type: "response.json_valid",
    label: "Valid JSON",
    types: responseTypes,
    fields: [],
  },
  {
    type: "response.json_schema",
    label: "JSON Schema",
    types: responseTypes,
    fields: [
      {
        key: "schema",
        label: "JSON Schema",
        kind: "json",
      },
    ],
  },
  {
    type: "response.json_field",
    label: "JSON field",
    types: responseTypes,
    fields: [],
  },
  {
    type: "response.length",
    label: "Response length",
    types: responseTypes,
    fields: [
      {
        key: "unit",
        label: "Unit",
        kind: "select",
        options: ["characters", "words"],
      },
      {
        key: "min",
        label: "Minimum",
        kind: "number",
        optional: true,
        min: 0,
        integer: true,
      },
      {
        key: "max",
        label: "Maximum",
        kind: "number",
        optional: true,
        min: 0,
        integer: true,
      },
    ],
  },
  {
    type: "metric.latency",
    label: "Latency limit",
    types: allTypes,
    fields: [
      {
        key: "max_ms",
        label: "Maximum latency (ms)",
        kind: "number",
        min: 1,
        integer: true,
      },
    ],
  },
  {
    type: "metric.tokens",
    label: "Token limits",
    types: allTypes,
    fields: [
      {
        key: "max_input",
        label: "Maximum input tokens",
        kind: "number",
        optional: true,
        min: 0,
        integer: true,
      },
      {
        key: "max_output",
        label: "Maximum output tokens",
        kind: "number",
        optional: true,
        min: 0,
        integer: true,
      },
      {
        key: "max_total",
        label: "Maximum total tokens",
        kind: "number",
        optional: true,
        min: 0,
        integer: true,
      },
    ],
  },
  {
    type: "metric.cost",
    label: "Cost limit",
    types: allTypes,
    fields: [
      {
        key: "max_usd",
        label: "Maximum cost (USD)",
        kind: "number",
        min: 0,
      },
    ],
  },
  {
    type: "tool.selection",
    label: "Tool selection",
    types: ["tool_use"],
    fields: [
      {
        key: "required_all",
        label: "Require all tools",
        kind: "list",
        optional: true,
      },
      {
        key: "required_any",
        label: "Require any tool",
        kind: "list",
        optional: true,
      },
      {
        key: "allowed",
        label: "Allowed tools",
        kind: "list",
        optional: true,
      },
      {
        key: "forbidden",
        label: "Forbidden tools",
        kind: "list",
        optional: true,
      },
    ],
  },
  {
    type: "tool.argument_field",
    label: "Tool argument field",
    types: ["tool_use"],
    fields: [
      {
        key: "tool",
        label: "Tool name",
        kind: "text",
      },
    ],
  },
  {
    type: "tool.expected_calls",
    label: "Expected tool calls",
    types: ["tool_use"],
    fields: [
      {
        key: "allow_additional_calls",
        label: "Allow additional calls",
        kind: "checkbox",
      },
    ],
  },
];

// Groups authorable checks by the evidence they inspect in every frontend view.
export const RULE_CATEGORIES: RuleCategory[] = [
  {
    label: "Semantic quality",
    types: ["judge.rubric"],
  },
  {
    label: "Response content",
    types: [
      "response.required_text",
      "response.forbidden_text",
      "response.regex",
      "response.length",
    ],
  },
  {
    label: "JSON structure",
    types: [
      "response.json_valid",
      "response.json_schema",
      "response.json_field",
    ],
  },
  {
    label: "Tool requests",
    types: ["tool.selection", "tool.argument_field", "tool.expected_calls"],
  },
  {
    label: "Speed, tokens, or cost",
    types: ["metric.latency", "metric.tokens", "metric.cost"],
  },
];

// Keeps scored-rule weight labels aligned across authoring and inspection.
export const RULE_SEVERITY_OPTIONS: RuleSeverityOption[] = [
  { value: "critical", label: "Critical", weight: 4 },
  { value: "high", label: "High", weight: 3 },
  { value: "medium", label: "Medium", weight: 2 },
  { value: "low", label: "Low", weight: 1 },
];

export interface AssertionDraft {
  path: string;
  operator: string;
  value: string;
  values: string;
  min: string;
  max: string;
}

export interface CallDraft {
  tool: string;
  fields: AssertionDraft[];
}

export interface RuleDraft {
  fields: Record<string, string>;
  lists: Record<string, string[]>;
  checks: Record<string, boolean>;
  assertion: AssertionDraft;
  calls: CallDraft[];
}

// Start assertions without an expected value so examples cannot become accidental expectations.
export function emptyAssertion(): AssertionDraft {
  return {
    path: "",
    operator: "exists",
    value: "",
    values: "",
    min: "",
    max: "",
  };
}

// Initialize only structural choices, leaving expected values and limits for the developer.
export function initialRuleDraft(definition: RuleDefinition): RuleDraft {
  return {
    fields: Object.fromEntries(
      definition.fields.map((field) => [
        field.key,
        field.key === "min_score" ? "4" : (field.options?.[0] ?? ""),
      ]),
    ),
    lists: {},
    checks: {},
    assertion: emptyAssertion(),
    calls: [
      {
        tool: "",
        fields: [],
      },
    ],
  };
}

// Parse finite JSON input with a field-specific message.
function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value, (_key, item: unknown) => {
      if (typeof item === "number" && !Number.isFinite(item)) {
        throw new Error("JSON numbers must be finite.");
      }
      return item;
    });
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

// Require coherent operands while preserving explicit JSON null and root pointers.
export function serializeAssertion(draft: AssertionDraft): JsonObject {
  if (draft.path && !draft.path.startsWith("/"))
    throw new Error("Field path must start with /.");
  if (/~(?![01])/.test(draft.path))
    throw new Error("Field path contains an invalid escape.");
  const result: JsonObject = {
    path: draft.path,
    operator: draft.operator,
  };
  if (
    ["equals", "not_equals", "gt", "gte", "lt", "lte"].includes(draft.operator)
  ) {
    const value = parseJson(draft.value, "Expected value");
    if (
      ["gt", "gte", "lt", "lte"].includes(draft.operator) &&
      typeof value !== "number"
    ) {
      throw new Error("Numeric comparisons require a JSON number.");
    }
    result.value = value;
  } else if (["in", "not_in"].includes(draft.operator)) {
    const values = parseJson(draft.values, "Expected values");
    if (!Array.isArray(values) || !values.length)
      throw new Error("Expected values must be a non-empty JSON array.");
    result.values = values;
  } else if (draft.operator === "between") {
    if (!draft.min.trim() || !draft.max.trim())
      throw new Error("Between requires both bounds.");
    const min = Number(draft.min);
    const max = Number(draft.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new Error("Between requires finite bounds with minimum ≤ maximum.");
    }
    result.min = min;
    result.max = max;
  }
  return result;
}

// Convert form fields to private evaluator parameters and enforce cross-field constraints.
export function serializeParameters(
  definition: RuleDefinition,
  draft: RuleDraft,
): JsonObject {
  const result: JsonObject = {};
  for (const field of definition.fields) {
    const value = draft.fields[field.key] ?? "";
    if (field.kind === "checkbox") {
      result[field.key] = draft.checks[field.key] ?? false;
    } else if (field.kind === "list") {
      const values = draft.lists[field.key] ?? [];
      if (values.some((item) => !item.trim()))
        throw new Error(`${field.label} cannot contain blank entries.`);
      if (!values.length && field.optional && field.key !== "allowed") continue;
      if (
        !values.length &&
        field.key === "allowed" &&
        !draft.checks.limit_allowed
      )
        continue;
      if (!values.length && !field.optional)
        throw new Error(`${field.label} requires at least one entry.`);
      if (
        definition.type === "tool.selection" &&
        new Set(values).size !== values.length
      ) {
        throw new Error(`${field.label} contains duplicate names.`);
      }
      result[field.key] = values;
    } else if (field.kind === "number") {
      if (!value.trim() && field.optional) continue;
      const number = Number(value);
      if (
        !value.trim() ||
        !Number.isFinite(number) ||
        (field.integer && !Number.isInteger(number)) ||
        (field.min !== undefined && number < field.min) ||
        (field.max !== undefined && number > field.max)
      ) {
        throw new Error(
          `${field.label} requires a valid ${field.integer ? "integer" : "number"}.`,
        );
      }
      result[field.key] = number;
    } else if (field.kind === "json") {
      const parsed = parseJson(value, field.label);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error(`${field.label} must be a JSON object.`);
      }
      result[field.key] = parsed;
    } else {
      if (!value.trim()) throw new Error(`${field.label} is required.`);
      result[field.key] = value;
    }
  }
  if (definition.type === "judge.rubric") {
    result.criterion = rubricCriterion(
      draft.fields.rubric_preset,
      String(result.criterion),
    );
  }
  if (definition.type === "response.regex") {
    result.flags = ["IGNORECASE", "MULTILINE", "DOTALL"].filter(
      (flag) => draft.checks[flag],
    );
  }
  if (
    definition.type === "response.required_text" ||
    definition.type === "response.forbidden_text"
  ) {
    result.case_sensitive = draft.checks.case_sensitive ?? false;
  }
  if (
    definition.type === "response.json_field" ||
    definition.type === "tool.argument_field"
  ) {
    Object.assign(result, serializeAssertion(draft.assertion));
  }
  if (definition.type === "tool.expected_calls") {
    if (!draft.calls.length)
      throw new Error("Add at least one expected tool call.");
    result.expected = draft.calls.map((call) => {
      if (!call.tool.trim())
        throw new Error("Each expected call requires a tool name.");
      return {
        tool: call.tool,
        fields: call.fields.map(serializeAssertion),
      };
    });
  }
  if (definition.type === "response.length") {
    if (result.min === undefined && result.max === undefined)
      throw new Error("Enter at least one length bound.");
    if (
      typeof result.min === "number" &&
      typeof result.max === "number" &&
      result.min > result.max
    ) {
      throw new Error("Minimum length must not exceed maximum length.");
    }
  }
  if (definition.type === "metric.tokens" && !Object.keys(result).length)
    throw new Error("Enter at least one token limit.");
  if (definition.type === "metric.cost" && Number(result.max_usd) <= 0)
    throw new Error("Maximum cost must be greater than zero.");
  if (definition.type === "tool.selection") {
    if (!Object.keys(result).length)
      throw new Error("Configure at least one tool-selection constraint.");
    const required = [
      ...((result.required_all as string[]) ?? []),
      ...((result.required_any as string[]) ?? []),
    ];
    const forbidden = (result.forbidden as string[]) ?? [];
    const allowed = result.allowed as string[] | undefined;
    if (required.some((name) => forbidden.includes(name)))
      throw new Error("Required tools cannot also be forbidden.");
    if (allowed && required.some((name) => !allowed.includes(name)))
      throw new Error("Required tools must be included in allowed tools.");
  }
  return result;
}

// Summarize saved or preview parameters without pretending that an evaluator has run.
export function summarizeRule(type: RuleType, parameters: JsonObject): string {
  const values = parameters.values as string[] | undefined;
  switch (type) {
    case "response.required_text":
      return `Response contains ${parameters.match ?? "all"} of ${(values ?? []).map((v) => JSON.stringify(v)).join(", ")}; ${parameters.case_sensitive ? "case sensitive" : "ignoring case"}.`;
    case "response.forbidden_text":
      return `Response excludes ${(values ?? []).map((v) => JSON.stringify(v)).join(", ")}; ${parameters.case_sensitive ? "case sensitive" : "ignoring case"}.`;
    case "response.json_valid":
      return "Response must be valid JSON.";
    case "response.json_schema":
      return "Response must match the configured JSON Schema.";
    case "response.regex":
      return `Response must ${parameters.mode ?? "search"} pattern ${JSON.stringify(parameters.pattern)}.`;
    case "response.json_field":
    case "tool.argument_field":
      return `${parameters.tool ? `Tool ${parameters.tool}: ` : "Response: "}${parameters.path || "(root)"} ${parameters.operator} ${JSON.stringify("value" in parameters ? parameters.value : (parameters.values ?? (parameters.min !== undefined ? [parameters.min, parameters.max] : "")))}.`;
    case "response.length":
      return `Response length: ${parameters.min ?? 0}–${parameters.max ?? "unbounded"} ${parameters.unit}.`;
    case "metric.latency":
      return `Latency ≤ ${parameters.max_ms} ms.`;
    case "metric.cost":
      return `Cost ≤ $${parameters.max_usd} USD.`;
    case "metric.tokens":
      return `Token limits: ${Object.entries(parameters)
        .map(([key, value]) => `${key.replace("max_", "")} ≤ ${value}`)
        .join(", ")}.`;
    case "tool.selection":
      return Object.entries(parameters)
        .map(
          ([key, value]) =>
            `${key.replaceAll("_", " ")}: ${(value as string[]).join(", ") || "none"}`,
        )
        .join("; ");
    case "tool.expected_calls":
      return `${(parameters.expected as unknown[]).length} unordered expected requests; additional calls ${parameters.allow_additional_calls ? "allowed" : "prohibited"}.`;
    case "judge.rubric":
      return `Semantic rubric: ${parameters.criterion}; minimum score ${parameters.min_score}.`;
  }
}

// Reject duplicate keys within the selected binding scope before sending the request.
export function validateBindingScope(
  payload: RuleBindingCreate,
  bindings: RuleBindingCreate[],
): void {
  if (!payload.rule_key.trim()) throw new Error("Rule name is required.");
  if (!payload.scenario_id && !payload.applies_to?.length)
    throw new Error("Select at least one scenario type.");
  if (
    bindings.some(
      (rule) =>
        rule.rule_key === payload.rule_key &&
        rule.scenario_id === payload.scenario_id,
    )
  ) {
    throw new Error(
      "This rule name already exists in the selected scope. Choose another name.",
    );
  }
}
