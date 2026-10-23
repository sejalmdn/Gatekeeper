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

  const scenarioBindings = bindings.filter(
    (binding) => binding.scenario_id !== null,
  );
  const visibleBindings = scenarioBindings.filter(
    (binding) => !scenarioId || binding.scenario_id === scenarioId,
  );

  return (
    <div className="dataset-rules__inspector">
      <div className="rule-binding-list__toolbar">
        <label className="form-field" htmlFor="rules-scenario">
          <span>Filter by scenario</span>
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
        <p className="rule-binding-list__total" role="status">
          {visibleBindings.length}{" "}
          {visibleBindings.length === 1 ? "rule" : "rules"}
          {scenarioId ? " for this scenario" : " across all scenarios"}
        </p>
      </div>
      <RuleBindingList bindings={visibleBindings} scenarios={scenarios} />
    </div>
  );
}
