import type { ReactElement } from "react";
import type { Scenario } from "../types";
import { RULE_CATEGORIES, type RuleDefinition } from "../utils/rules";

interface RuleCheckSectionProps {
  scenario?: Scenario;
  compatibleDefinitions: RuleDefinition[];
  definition?: RuleDefinition;
  saving: boolean;
  error?: string;
  sectionRef: (node: HTMLDetailsElement | null) => void;
  onChoose: (type: string) => void;
}

// Groups the compatible built-in checks by the evidence they inspect.
export function RuleCheckSection({
  scenario,
  compatibleDefinitions,
  definition,
  saving,
  error,
  sectionRef,
  onChoose,
}: RuleCheckSectionProps): ReactElement {
  return (
    <details className="rule-form__section" open ref={sectionRef}>
      <summary>
        <span>2. What should Gatekeeper check?</span>
      </summary>
      <fieldset disabled={saving}>
        <legend className="rule-form__visually-hidden">Check type</legend>
        <label
          className="form-field rule-form__check-picker"
          htmlFor="rule-type"
        >
          <span>Check</span>
          <select
            id="rule-type"
            name="rule-type"
            value={definition?.type ?? ""}
            disabled={compatibleDefinitions.length === 0}
            aria-describedby={
              compatibleDefinitions.length === 0 ? "rule-type-help" : undefined
            }
            onChange={(event) => onChoose(event.target.value)}
          >
            <option value="">Choose a check</option>
            {RULE_CATEGORIES.map((category) => {
              const choices = compatibleDefinitions.filter((item) =>
                category.types.includes(item.type),
              );
              if (!choices.length) return null;
              return (
                <optgroup label={category.label} key={category.label}>
                  {choices.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        {!scenario && (
          <p className="rule-form__note" id="rule-type-help">
            Choose a scenario first to see compatible checks.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </details>
  );
}
