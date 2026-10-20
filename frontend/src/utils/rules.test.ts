import { describe, expect, it } from "vitest";
import type { RuleBindingCreate, RuleType } from "../types";
import {
  emptyAssertion,
  initialRuleDraft,
  RULE_DEFINITIONS,
  serializeAssertion,
  serializeParameters,
  summarizeRule,
  validateBindingScope,
  type RuleDraft,
} from "./rules";

// Produce parameter drafts independently of the UI for wire-format checks.
function draftFor(type: RuleType, update: Partial<RuleDraft> = {}): RuleDraft {
  return {
    ...initialRuleDraft(RULE_DEFINITIONS.find((item) => item.type === type)!),
    ...update,
  };
}

// Cover every deterministic rule form against the existing backend parameter shape.
describe("rule parameter serialization", () => {
  const cases: [RuleType, Partial<RuleDraft>, object][] = [
    [
      "response.required_text",
      {
        fields: { match: "any" },
        lists: { values: ["ORD-123", "hello"] },
      },
      {
        values: ["ORD-123", "hello"],
        match: "any",
        case_sensitive: false,
      },
    ],
    [
      "response.forbidden_text",
      {
        lists: { values: ["secret"] },
        checks: { case_sensitive: true },
      },
      {
        values: ["secret"],
        case_sensitive: true,
      },
    ],
    [
      "response.regex",
      {
        fields: {
          pattern: "(?P<id>[0-9]+)",
          mode: "search",
        },
        checks: { IGNORECASE: true },
      },
      {
        pattern: "(?P<id>[0-9]+)",
        mode: "search",
        flags: ["IGNORECASE"],
      },
    ],
    ["response.json_valid", {}, {}],
    [
      "response.json_schema",
      { fields: { schema: '{"type":"object"}' } },
      { schema: { type: "object" } },
    ],
    [
      "response.json_field",
      {
        assertion: {
          ...emptyAssertion(),
          path: "/optional",
          operator: "equals",
          value: "null",
        },
      },
      {
        path: "/optional",
        operator: "equals",
        value: null,
      },
    ],
    [
      "response.length",
      {
        fields: {
          unit: "words",
          min: "0",
          max: "10",
        },
      },
      {
        unit: "words",
        min: 0,
        max: 10,
      },
    ],
    ["metric.latency", { fields: { max_ms: "30000" } }, { max_ms: 30000 }],
    ["metric.tokens", { fields: { max_total: "0" } }, { max_total: 0 }],
    ["metric.cost", { fields: { max_usd: "0.01" } }, { max_usd: 0.01 }],
    [
      "tool.selection",
      {
        lists: {
          required_all: ["lookup"],
          allowed: ["lookup"],
        },
        checks: { limit_allowed: true },
      },
      {
        required_all: ["lookup"],
        allowed: ["lookup"],
      },
    ],
    [
      "tool.argument_field",
      {
        fields: { tool: "lookup" },
        assertion: {
          ...emptyAssertion(),
          path: "/order_id",
          operator: "equals",
          value: '"ORD-123"',
        },
      },
      {
        tool: "lookup",
        path: "/order_id",
        operator: "equals",
        value: "ORD-123",
      },
    ],
    [
      "tool.expected_calls",
      {
        calls: [
          {
            tool: "lookup",
            fields: [
              {
                ...emptyAssertion(),
                path: "/id",
                operator: "equals",
                value: "null",
              },
            ],
          },
          {
            tool: "lookup",
            fields: [],
          },
        ],
      },
      {
        expected: [
          {
            tool: "lookup",
            fields: [
              {
                path: "/id",
                operator: "equals",
                value: null,
              },
            ],
          },
          {
            tool: "lookup",
            fields: [],
          },
        ],
        allow_additional_calls: false,
      },
    ],
  ];

  it.each(cases)("serializes %s", (type, update, expected) => {
    const definition = RULE_DEFINITIONS.find((item) => item.type === type)!;
    const parameters = serializeParameters(definition, draftFor(type, update));
    expect(parameters).toEqual(expected);
    expect(summarizeRule(type, parameters)).toBeTruthy();
  });

  it("supports explicitly prohibiting all tool requests", () => {
    const definition = RULE_DEFINITIONS.find(
      (item) => item.type === "tool.selection",
    )!;
    expect(
      serializeParameters(
        definition,
        draftFor("tool.selection", {
          checks: { limit_allowed: true },
        }),
      ),
    ).toEqual({ allowed: [] });
  });

  const invalidCases: [RuleType, Partial<RuleDraft>][] = [
    ["response.required_text", { lists: { values: [" "] } }],
    ["response.json_schema", { fields: { schema: "[]" } }],
    [
      "response.length",
      {
        fields: {
          unit: "words",
          min: "5",
          max: "2",
        },
      },
    ],
    [
      "response.length",
      {
        fields: {
          unit: "words",
          min: "1.5",
        },
      },
    ],
    ["metric.tokens", {}],
    ["metric.latency", { fields: { max_ms: "" } }],
    ["metric.cost", { fields: { max_usd: "0" } }],
    ["tool.selection", {}],
    ["tool.selection", { lists: { required_all: ["lookup", "lookup"] } }],
    [
      "tool.selection",
      {
        lists: {
          required_all: ["lookup"],
          forbidden: ["lookup"],
        },
      },
    ],
    [
      "tool.selection",
      {
        lists: {
          required_all: ["lookup"],
          allowed: ["other"],
        },
      },
    ],
    ["tool.expected_calls", { calls: [] }],
    [
      "tool.expected_calls",
      {
        calls: [
          {
            tool: " ",
            fields: [],
          },
        ],
      },
    ],
  ];

  it.each(invalidCases)("rejects invalid %s parameters", (type, update) => {
    expect(() =>
      serializeParameters(
        RULE_DEFINITIONS.find((item) => item.type === type)!,
        draftFor(type, update),
      ),
    ).toThrow();
  });
});

// Validate JSON Pointer and assertion operand boundaries, including null versus omission.
describe("field assertions", () => {
  it("keeps root pointers and drops obsolete operands when operators change", () => {
    expect(
      serializeAssertion({
        ...emptyAssertion(),
        value: "stale",
      }),
    ).toEqual({
      path: "",
      operator: "exists",
    });
    expect(
      serializeAssertion({
        ...emptyAssertion(),
        path: "/a~1b/~0",
        operator: "in",
        values: "[null, 0]",
      }),
    ).toEqual({
      path: "/a~1b/~0",
      operator: "in",
      values: [null, 0],
    });
  });

  it.each([
    { path: "missing-slash" },
    { path: "/bad~escape" },
    {
      operator: "equals",
      value: "",
    },
    {
      operator: "equals",
      value: "1e999",
    },
    {
      operator: "gt",
      value: '"2"',
    },
    {
      operator: "in",
      values: "[]",
    },
    {
      operator: "in",
      values: "{}",
    },
    {
      operator: "between",
      min: "",
      max: "10",
    },
    {
      operator: "between",
      min: "10",
      max: "5",
    },
  ])("rejects malformed assertion %j", (update) => {
    expect(() =>
      serializeAssertion({
        ...emptyAssertion(),
        ...update,
      }),
    ).toThrow();
  });

  it("summarizes explicit null correctly", () => {
    expect(
      summarizeRule("response.json_field", {
        path: "/optional",
        operator: "equals",
        value: null,
      }),
    ).toContain("equals null");
  });
});

// Ensure local duplicate feedback matches the database's separate uniqueness scopes.
it("validates binding keys and scopes", () => {
  const payload: RuleBindingCreate = {
    scenario_id: null,
    rule_key: "same",
    rule_type: "response.json_valid",
    role: "required",
    severity: "medium",
    parameters: {},
    applies_to: ["single_turn"],
  };
  expect(() => validateBindingScope(payload, [payload])).toThrow(
    "already exists",
  );
  expect(() =>
    validateBindingScope(
      {
        ...payload,
        scenario_id: "scenario",
        applies_to: null,
      },
      [payload],
    ),
  ).not.toThrow();
  expect(() =>
    validateBindingScope(
      {
        ...payload,
        applies_to: [],
      },
      [],
    ),
  ).toThrow("scenario type");
  expect(() =>
    validateBindingScope(
      {
        ...payload,
        rule_key: " ",
      },
      [],
    ),
  ).toThrow("Rule name");
});
