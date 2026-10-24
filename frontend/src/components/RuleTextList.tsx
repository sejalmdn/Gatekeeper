import { useState, type ReactElement } from "react";
import { Icon } from "./Icon";

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
  const isPhrase = label === "Required text" || label === "Forbidden text";
  const entryLabel = isPhrase ? "phrase" : itemLabel;
  const heading = isPhrase
    ? `${label.replace(" text", "")} phrases & tokens`
    : label;

  // Holds a new entry until the developer adds it with Enter or the explicit action.
  const [pending, setPending] = useState("");

  // Commits a complete entry without changing its literal matching content.
  function addEntry(): void {
    if (!pending.trim()) return;
    onChange([...values, pending]);
    setPending("");
  }

  return (
    <fieldset className="rule-form__list">
      <legend className="rule-form__visually-hidden">{label}</legend>
      <div className="rule-form__list-heading">
        <span>{heading}</span>
        <span className="rule-form__list-total">{values.length} defined</span>
        {isPhrase && <small>Exact substring matching</small>}
      </div>
      <div className="rule-form__list-items">
        {values.map((value, index) => (
          <div className="rule-form__list-row" key={index}>
            <span className="rule-form__list-index">
              {String(index + 1).padStart(2, "0")}
            </span>
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
              className="quiet-button rule-form__list-remove"
              type="button"
              aria-label={`Remove ${label} ${index + 1}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              <Icon name="close" />
            </button>
          </div>
        ))}
      </div>
      <div className="rule-form__list-entry">
        <input
          id={`${id}-new`}
          aria-label={`New ${itemLabel}`}
          placeholder={`Type ${itemLabel} and press Enter…`}
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              addEntry();
            }
          }}
        />
        <button className="quiet-button" type="button" onClick={addEntry}>
          <Icon name="plus" />
          Add {entryLabel}
        </button>
      </div>
      {isPhrase && (
        <p className="rule-form__list-help">
          {label === "Forbidden text"
            ? "The response must not contain these substrings."
            : "The response must contain the configured substrings according to the match option."}
        </p>
      )}
    </fieldset>
  );
}
