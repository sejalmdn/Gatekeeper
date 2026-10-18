import type { ReactElement } from "react";
import { JsonInput } from "./JsonInput";
import type { AssertionDraft } from "../utils/rules";

const OPERATORS = [
  "exists",
  "not_exists",
  "equals",
  "not_equals",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
];

// Edits a JSON Pointer assertion with only the operands required by its operator.
export function RuleAssertionFields({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: AssertionDraft;
  onChange: (value: AssertionDraft) => void;
  disabled?: boolean;
}): ReactElement {
  const needsValue = [
    "equals",
    "not_equals",
    "gt",
    "gte",
    "lt",
    "lte",
  ].includes(value.operator);
  const needsValues = ["in", "not_in"].includes(value.operator);

  return (
    <div className="rule-form__assertion">
      <label className="form-field" htmlFor={`${id}-path`}>
        <span>JSON Pointer</span>
        <input
          id={`${id}-path`}
          value={value.path}
          placeholder="/order_id (leave empty for root)"
          onChange={(event) =>
            onChange({
              ...value,
              path: event.target.value,
            })
          }
        />
      </label>
      <label className="form-field" htmlFor={`${id}-operator`}>
        <span>Operator</span>
        <select
          id={`${id}-operator`}
          value={value.operator}
          onChange={(event) =>
            onChange({
              ...value,
              operator: event.target.value,
            })
          }
        >
          {OPERATORS.map((operator) => (
            <option key={operator}>{operator}</option>
          ))}
        </select>
      </label>
      {needsValue && (
        <JsonInput
          disabled={disabled}
          id={`${id}-value`}
          label="Expected value"
          help={'Enter JSON, for example "ORD-123", 42, true, or null.'}
          value={value.value}
          onChange={(next) =>
            onChange({
              ...value,
              value: next,
            })
          }
        />
      )}
      {needsValues && (
        <JsonInput
          disabled={disabled}
          id={`${id}-values`}
          label="Expected values"
          help="Enter a non-empty JSON array of accepted or excluded values."
          value={value.values}
          onChange={(next) =>
            onChange({
              ...value,
              values: next,
            })
          }
        />
      )}
      {value.operator === "between" &&
        ["min", "max"].map((key) => (
          <label className="form-field" htmlFor={`${id}-${key}`} key={key}>
            <span>{key === "min" ? "Minimum" : "Maximum"}</span>
            <input
              id={`${id}-${key}`}
              type="number"
              step="any"
              required
              value={value[key as "min" | "max"]}
              onChange={(event) =>
                onChange({
                  ...value,
                  [key]: event.target.value,
                })
              }
            />
          </label>
        ))}
    </div>
  );
}
