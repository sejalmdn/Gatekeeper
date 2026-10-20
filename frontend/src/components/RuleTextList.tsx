import type { ReactElement } from "react";

interface RuleTextListProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}

const ITEM_LABELS: Record<string, string> = {
  "Required text": "required text",
  "Forbidden text": "forbidden text",
  "Require all tools": "required tool",
  "Require any tool": "alternative tool",
  "Allowed tools": "allowed tool",
  "Forbidden tools": "forbidden tool",
};

// Edits repeatable text or tool names without delimiter-based ambiguity.
export function RuleTextList({
  id,
  label,
  values,
  onChange,
}: RuleTextListProps): ReactElement {
  const itemLabel = ITEM_LABELS[label] ?? label.toLowerCase();
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
            Remove {itemLabel}
          </button>
        </div>
      ))}
      <button
        className="quiet-button"
        type="button"
        onClick={() => onChange([...values, ""])}
      >
        Add {itemLabel}
      </button>
    </fieldset>
  );
}
