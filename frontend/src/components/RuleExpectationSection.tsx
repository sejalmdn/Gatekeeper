import type { ReactElement } from "react";
import type { RuleDefinition, RuleDraft } from "../utils/rules";
import { RuleParameterFields } from "./RuleParameterFields";

interface RuleExpectationSectionProps {
  definition?: RuleDefinition;
  draft?: RuleDraft;
  saving: boolean;
  error?: string;
  sectionRef: (node: HTMLDetailsElement | null) => void;
  onChange: (draft: RuleDraft) => void;
}

// Shows only the parameter controls required by the selected check.
export function RuleExpectationSection({
  definition,
  draft,
  saving,
  error,
  sectionRef,
  onChange,
}: RuleExpectationSectionProps): ReactElement {
  return (
    <details className="rule-form__section" open ref={sectionRef}>
      <summary>
        <span>3. Configure the expectation</span>
      </summary>
      <fieldset disabled={saving}>
        <legend className="rule-form__visually-hidden">
          Expectation parameters
        </legend>
        {definition && draft ? (
          <div className="rule-form__expectation-workspace">
            <h3>{definition.label}</h3>
            <RuleParameterFields
              disabled={saving}
              definition={definition}
              draft={draft}
              onChange={onChange}
            />
          </div>
        ) : (
          <p className="rule-form__note">
            Choose a check to see its expectation controls.
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
