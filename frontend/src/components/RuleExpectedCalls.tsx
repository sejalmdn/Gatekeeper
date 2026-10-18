import type { ReactElement } from "react";
import { emptyAssertion, type CallDraft } from "../utils/rules";
import { RuleAssertionFields } from "./RuleAssertionFields";

// Composes unordered tool requests, including repeated requests to the same tool.
export function RuleExpectedCalls({
  calls,
  onChange,
  disabled = false,
}: {
  calls: CallDraft[];
  onChange: (calls: CallDraft[]) => void;
  disabled?: boolean;
}): ReactElement {
  // Replace one draft call while retaining the other requests.
  function update(index: number, next: CallDraft): void {
    onChange(calls.map((call, i) => (i === index ? next : call)));
  }

  return (
    <section className="rule-form__calls">
      <h3>Expected tool requests</h3>
      <p>
        Requests are matched without order. The same tool may appear more than
        once.
      </p>
      {calls.map((call, index) => (
        <fieldset className="rule-form__call" key={index}>
          <legend>Expected request {index + 1}</legend>
          <label className="form-field" htmlFor={`call-${index}-tool`}>
            <span>Tool name</span>
            <input
              id={`call-${index}-tool`}
              value={call.tool}
              required
              onChange={(event) =>
                update(index, {
                  ...call,
                  tool: event.target.value,
                })
              }
            />
          </label>
          {call.fields.map((assertion, fieldIndex) => (
            <fieldset key={fieldIndex}>
              <legend>Argument assertion {fieldIndex + 1}</legend>
              <RuleAssertionFields
                disabled={disabled}
                id={`call-${index}-field-${fieldIndex}`}
                value={assertion}
                onChange={(next) =>
                  update(index, {
                    ...call,
                    fields: call.fields.map((field, i) =>
                      i === fieldIndex ? next : field,
                    ),
                  })
                }
              />
              <button
                className="quiet-button"
                type="button"
                onClick={() =>
                  update(index, {
                    ...call,
                    fields: call.fields.filter((_, i) => i !== fieldIndex),
                  })
                }
              >
                Remove assertion {fieldIndex + 1}
              </button>
            </fieldset>
          ))}
          <div className="rule-form__actions">
            <button
              className="quiet-button"
              type="button"
              onClick={() =>
                update(index, {
                  ...call,
                  fields: [...call.fields, emptyAssertion()],
                })
              }
            >
              Add argument assertion
            </button>
            <button
              className="quiet-button"
              type="button"
              onClick={() => onChange(calls.filter((_, i) => i !== index))}
            >
              Remove request {index + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        className="quiet-button"
        type="button"
        onClick={() =>
          onChange([
            ...calls,
            {
              tool: "",
              fields: [],
            },
          ])
        }
      >
        Add expected request
      </button>
    </section>
  );
}
