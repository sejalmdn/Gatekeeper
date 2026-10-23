import { useState, type ReactElement } from "react";
import type { RuleBinding, Scenario } from "../types";
import { RuleBindingList } from "./RuleBindingList";

interface DatasetRuleInspectorProps {
  scenarios: Scenario[];
  bindings: RuleBinding[];
}

// Filters saved scenario bindings for inspection.
export function DatasetRuleInspector({
  scenarios,
  bindings,
}: DatasetRuleInspectorProps): ReactElement {
  // Selects all scenario rules or the bindings for one scenario.
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
          <option value="">All scenario rules</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              Rules for {scenario.name}
            </option>
          ))}
        </select>
      </label>
      <RuleBindingList
        bindings={bindings.filter(
          (binding) =>
            binding.scenario_id !== null &&
            (!scenarioId || binding.scenario_id === scenarioId),
        )}
        scenarios={scenarios}
      />
    </div>
  );
}
