import type { ReactElement } from "react";
import type { RuleBindingCreate } from "../types";
import { RULE_SEVERITY_OPTIONS } from "../utils/rules";

interface RuleEffectSectionProps {
  role: RuleBindingCreate["role"];
  severity: RuleBindingCreate["severity"];
  saving: boolean;
  error?: string;
  sectionRef: (node: HTMLDetailsElement | null) => void;
  onRoleChange: (role: RuleBindingCreate["role"]) => void;
  onSeverityChange: (severity: RuleBindingCreate["severity"]) => void;
}

const RESULT_ROLES: {
  value: RuleBindingCreate["role"];
  label: string;
  detail: string;
}[] = [
  { value: "required", label: "Required", detail: "Controls pass or fail." },
  {
    value: "scored",
    label: "Scored",
    detail: "Contributes to the aggregate score.",
  },
  {
    value: "informational",
    label: "Report only",
    detail: "Reports without affecting the result.",
  },
];

// Maps plain-language result choices to the existing roles and score weights.
export function RuleEffectSection({
  role,
  severity,
  saving,
  error,
  sectionRef,
  onRoleChange,
  onSeverityChange,
}: RuleEffectSectionProps): ReactElement {
  return (
    <details className="rule-form__section" open ref={sectionRef}>
      <summary>
        <span>4. How should failure affect the result?</span>
      </summary>
      <fieldset disabled={saving}>
        <legend className="rule-form__visually-hidden">Result effect</legend>
        <div className="rule-form__choices rule-form__choices--three">
          {RESULT_ROLES.map((item) => (
            <label key={item.value}>
              <input
                type="radio"
                name="rule-role"
                value={item.value}
                checked={role === item.value}
                onChange={() => onRoleChange(item.value)}
              />
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
            </label>
          ))}
        </div>
        {role === "scored" && (
          <label
            className="form-field rule-form__weight"
            htmlFor="rule-severity"
          >
            <span>Weight</span>
            <select
              id="rule-severity"
              value={severity}
              onChange={(event) =>
                onSeverityChange(
                  event.target.value as RuleBindingCreate["severity"],
                )
              }
            >
              {RULE_SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.weight} — {option.label}
                </option>
              ))}
            </select>
            <small>
              Higher weights give this result more influence on the aggregate
              score.
            </small>
          </label>
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
