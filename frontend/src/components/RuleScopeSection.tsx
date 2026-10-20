import type { ReactElement } from "react";
import type { Scenario, ScenarioType } from "../types";

interface RuleScopeSectionProps {
  scope: "dataset" | "scenario";
  scenarioId: string;
  scenarios: Scenario[];
  datasetTypes: ScenarioType[];
  appliesTo: ScenarioType[];
  saving: boolean;
  error?: string;
  sectionRef: (node: HTMLDetailsElement | null) => void;
  onScopeChange: (scope: "dataset" | "scenario") => void;
  onScenarioChange: (scenarioId: string) => void;
  onDatasetTypeChange: (type: ScenarioType, checked: boolean) => void;
}

const SCENARIO_TYPE_LABELS: Record<ScenarioType, string> = {
  single_turn: "Single turn",
  multi_turn: "Multi-turn",
  tool_use: "Tool use",
};

// Collects dataset-wide or scenario-specific applicability for a rule.
export function RuleScopeSection({
  scope,
  scenarioId,
  scenarios,
  datasetTypes,
  appliesTo,
  saving,
  error,
  sectionRef,
  onScopeChange,
  onScenarioChange,
  onDatasetTypeChange,
}: RuleScopeSectionProps): ReactElement {
  return (
    <details className="rule-form__section" open ref={sectionRef}>
      <summary>
        <span>1. Where should this apply?</span>
      </summary>
      <fieldset disabled={saving}>
        <legend className="rule-form__visually-hidden">Rule scope</legend>
        <div className="rule-form__choices rule-form__choices--wide">
          <label>
            <input
              type="radio"
              name="rule-scope"
              value="dataset"
              checked={scope === "dataset"}
              onChange={() => onScopeChange("dataset")}
            />
            <span>
              <strong>Selected scenario types in this dataset</strong>
              <small>
                Apply the rule across one or more types in the immutable
                dataset.
              </small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="rule-scope"
              value="scenario"
              checked={scope === "scenario"}
              onChange={() => onScopeChange("scenario")}
            />
            <span>
              <strong>One specific scenario</strong>
              <small>Use or replace a rule for a single scenario.</small>
            </span>
          </label>
        </div>
        {scope === "scenario" && (
          <label className="form-field" htmlFor="rule-scenario">
            <span>Scenario</span>
            <select
              id="rule-scenario"
              value={scenarioId}
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
        )}
        {scope === "dataset" && (
          <fieldset className="rule-form__type-options">
            <legend>Scenario types</legend>
            {datasetTypes.length ? (
              <div>
                {datasetTypes.map((type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      name="rule-applies-to"
                      value={type}
                      checked={appliesTo.includes(type)}
                      onChange={(event) =>
                        onDatasetTypeChange(type, event.target.checked)
                      }
                    />
                    <span>{SCENARIO_TYPE_LABELS[type]}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rule-form__note">
                This dataset has no scenarios available for a dataset-wide rule.
              </p>
            )}
          </fieldset>
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
