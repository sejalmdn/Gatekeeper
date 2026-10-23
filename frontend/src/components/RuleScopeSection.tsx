import type { ReactElement } from "react";
import type { Scenario } from "../types";

interface RuleScopeSectionProps {
  scenarioId: string;
  scenarios: Scenario[];
  saving: boolean;
  error?: string;
  sectionRef: (node: HTMLDetailsElement | null) => void;
  onScenarioChange: (scenarioId: string) => void;
}

// Selects the scenario whose response or tool requests the rule checks.
export function RuleScopeSection({
  scenarioId,
  scenarios,
  saving,
  error,
  sectionRef,
  onScenarioChange,
}: RuleScopeSectionProps): ReactElement {
  return (
    <details className="rule-form__section" open ref={sectionRef}>
      <summary>
        <span>1. Where should this apply?</span>
      </summary>
      <fieldset disabled={saving}>
        <legend className="rule-form__visually-hidden">Rule scenario</legend>
        <label className="form-field" htmlFor="rule-scenario">
          <span>Scenario</span>
          <select
            id="rule-scenario"
            value={scenarioId}
            disabled={scenarios.length === 0}
            onChange={(event) => onScenarioChange(event.target.value)}
          >
            <option value="">Choose a scenario</option>
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.scenario_key})
              </option>
            ))}
          </select>
        </label>
        {scenarios.length === 0 && (
          <p className="rule-form__note">
            This dataset has no scenarios available for rule binding.
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
