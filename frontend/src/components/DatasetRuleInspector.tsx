import { useState, type ReactElement } from "react";
import type { RuleBinding, Scenario } from "../types";
import { EffectiveRules } from "./EffectiveRules";
import { RuleBindingList } from "./RuleBindingList";

interface DatasetRuleInspectorProps {
  projectId: string;
  datasetId: string;
  scenarios: Scenario[];
  bindings: RuleBinding[];
}

// Switches between all configured bindings and one scenario's resolved rules.
export function DatasetRuleInspector({
  projectId,
  datasetId,
  scenarios,
  bindings,
}: DatasetRuleInspectorProps): ReactElement {
  // Selects either all configured rules or one scenario's resolved rule set.
  const [scenarioId, setScenarioId] = useState("");

  return (
    <div className="dataset-rules__inspector">
      <label className="form-field" htmlFor="rules-scenario">
        <span>Rules to inspect</span>
        <select
          id="rules-scenario"
          value={scenarioId}
          onChange={(event) => setScenarioId(event.target.value)}
        >
          <option value="">All configured rules</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              Rules applied to {scenario.name}
            </option>
          ))}
        </select>
      </label>
      {scenarioId ? (
        <EffectiveRules
          key={scenarioId}
          projectId={projectId}
          datasetId={datasetId}
          scenarioId={scenarioId}
          scenarios={scenarios}
        />
      ) : (
        <RuleBindingList bindings={bindings} scenarios={scenarios} />
      )}
    </div>
  );
}
