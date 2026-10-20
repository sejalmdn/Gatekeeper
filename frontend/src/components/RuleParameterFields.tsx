import type { ReactElement } from "react";
import type { RuleDefinition, RuleDraft } from "../utils/rules";
import { JsonInput } from "./JsonInput";
import { RuleAssertionFields } from "./RuleAssertionFields";
import { RuleExpectedCalls } from "./RuleExpectedCalls";
import { RuleTextList } from "./RuleTextList";

const OPTION_LABELS: Record<string, string> = {
  all: "All listed text",
  any: "Any listed text",
  search: "Find anywhere in the response",
  fullmatch: "Match the entire response",
  characters: "Characters",
  words: "Words",
};

const REGEX_FLAGS: { value: string; label: string }[] = [
  { value: "IGNORECASE", label: "Ignore uppercase and lowercase differences" },
  { value: "MULTILINE", label: "Treat each line as a separate line" },
  { value: "DOTALL", label: "Allow a dot to match line breaks" },
];

// Renders type-specific parameters using text, numeric, list, and structured-value controls.
export function RuleParameterFields({
  definition,
  draft,
  onChange,
  disabled = false,
}: {
  definition: RuleDefinition;
  draft: RuleDraft;
  onChange: (draft: RuleDraft) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <div className="rule-form__parameters">
      {definition.fields.map((field) => {
        const id = `rule-param-${field.key}`;
        if (field.kind === "list") {
          return (
            <div
              className="rule-form__parameter rule-form__parameter--wide"
              key={field.key}
            >
              {field.key === "allowed" && (
                <label className="rule-form__check">
                  <input
                    type="checkbox"
                    checked={draft.checks.limit_allowed ?? false}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        checks: {
                          ...draft.checks,
                          limit_allowed: event.target.checked,
                        },
                        lists: {
                          ...draft.lists,
                          allowed: [],
                        },
                      })
                    }
                  />
                  Restrict allowed tools (an empty list allows no tools)
                </label>
              )}
              {(field.key !== "allowed" || draft.checks.limit_allowed) && (
                <RuleTextList
                  id={id}
                  label={field.label}
                  values={draft.lists[field.key] ?? []}
                  onChange={(values) =>
                    onChange({
                      ...draft,
                      lists: {
                        ...draft.lists,
                        [field.key]: values,
                      },
                    })
                  }
                />
              )}
            </div>
          );
        }
        if (field.kind === "checkbox") {
          return (
            <label
              className="rule-form__check rule-form__parameter rule-form__parameter--wide"
              key={field.key}
            >
              <input
                id={id}
                type="checkbox"
                checked={draft.checks[field.key] ?? false}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    checks: {
                      ...draft.checks,
                      [field.key]: event.target.checked,
                    },
                  })
                }
              />
              {field.label}
            </label>
          );
        }
        if (field.kind === "json") {
          return (
            <div
              className="rule-form__parameter rule-form__parameter--wide"
              key={field.key}
            >
              <JsonInput
                disabled={disabled}
                id={id}
                label={field.label}
                help="Enter the schema as a JSON object."
                value={draft.fields[field.key] ?? ""}
                onChange={(value) =>
                  onChange({
                    ...draft,
                    fields: {
                      ...draft.fields,
                      [field.key]: value,
                    },
                  })
                }
              />
            </div>
          );
        }
        return (
          <label
            className="form-field rule-form__parameter"
            htmlFor={id}
            key={field.key}
          >
            <span>
              {field.label}
              {field.optional && " (optional)"}
            </span>
            {field.kind === "select" ? (
              <select
                id={id}
                value={draft.fields[field.key] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    fields: {
                      ...draft.fields,
                      [field.key]: event.target.value,
                    },
                  })
                }
              >
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {OPTION_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={field.kind === "number" ? "number" : "text"}
                step={field.integer ? "1" : "any"}
                min={field.min}
                required={!field.optional}
                value={draft.fields[field.key] ?? ""}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    fields: {
                      ...draft.fields,
                      [field.key]: event.target.value,
                    },
                  })
                }
              />
            )}
          </label>
        );
      })}
      {definition.type === "response.regex" && (
        <fieldset className="rule-form__parameter--wide">
          <legend>Pattern options</legend>
          {REGEX_FLAGS.map((flag) => (
            <label className="rule-form__check" key={flag.value}>
              <input
                type="checkbox"
                checked={draft.checks[flag.value] ?? false}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    checks: {
                      ...draft.checks,
                      [flag.value]: event.target.checked,
                    },
                  })
                }
              />
              {flag.label}
            </label>
          ))}
        </fieldset>
      )}
      {(definition.type === "response.json_field" ||
        definition.type === "tool.argument_field") && (
        <div className="rule-form__parameter--wide">
          <RuleAssertionFields
            disabled={disabled}
            id="rule-assertion"
            value={draft.assertion}
            onChange={(assertion) =>
              onChange({
                ...draft,
                assertion,
              })
            }
          />
        </div>
      )}
      {definition.type === "tool.expected_calls" && (
        <div className="rule-form__parameter--wide">
          <RuleExpectedCalls
            disabled={disabled}
            calls={draft.calls}
            onChange={(calls) =>
              onChange({
                ...draft,
                calls,
              })
            }
          />
        </div>
      )}
      {definition.type === "response.json_valid" && (
        <p className="rule-form__parameter--wide">
          This check requires no parameters.
        </p>
      )}
    </div>
  );
}
