import type { ReactElement } from "react";

interface RuleTextListProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}

// Edits repeatable text or tool names without delimiter-based ambiguity.
export function RuleTextList({
  id,
  label,
  values,
  onChange,
}: RuleTextListProps): ReactElement {
  return (
    <fieldset className="rule-form__list">
      <legend>{label}</legend>
      {values.map((value, index) => (
        <div className="rule-form__list-row" key={index}>
          <input
            id={`${id}-${index}`}
            aria-label={`${label} ${index + 1}`}
            value={value}
            required
            onChange={(event) =>
              onChange(
                values.map((item, i) =>
                  i === index ? event.target.value : item,
                ),
              )
            }
          />
          <button
            className="quiet-button"
            type="button"
            aria-label={`Remove ${label} ${index + 1}`}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="quiet-button"
        type="button"
        onClick={() => onChange([...values, ""])}
      >
        Add entry
      </button>
    </fieldset>
  );
}
