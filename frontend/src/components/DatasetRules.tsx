import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { listRuleBindings } from "../api";
import { useLoad } from "../hooks/useLoad";
import type { Scenario } from "../types";
import { EffectiveRules } from "./EffectiveRules";
import { LoadBoundary } from "./Feedback";
import { RuleBindingList } from "./RuleBindingList";
import "../styles/RuleForm.css";

// Lists private dataset rules and lets developers inspect each scenario's effective conditions.
export function DatasetRules({
  projectId,
  datasetId,
  scenarios,
}: {
  projectId: string;
  datasetId: string;
  scenarios: Scenario[];
}): ReactElement {
  // Selects either all saved bindings or one scenario's resolved rule set.
  const [scenarioId, setScenarioId] = useState("");

  // Reads saved rules independently from immutable dataset inputs.
  const state = useLoad(() => listRuleBindings(projectId, datasetId));
  const createPath = `/projects/${projectId}/datasets/${datasetId}/rules/new`;

  return (
    <section className="dataset-rules detail-section">
      <div className="section-title">
        <div>
          <h2>Rules</h2>
          <p>
            Private expectations used to evaluate candidate responses and tool
            requests.
          </p>
        </div>
        <Link
          className="button"
          to={scenarioId ? `${createPath}?scenario=${scenarioId}` : createPath}
        >
          Add rule
        </Link>
      </div>
      <label className="form-field" htmlFor="rules-scenario">
        <span>Inspect rules</span>
        <select
          id="rules-scenario"
          value={scenarioId}
          onChange={(event) => setScenarioId(event.target.value)}
        >
          <option value="">All saved bindings</option>
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              Effective rules: {scenario.name}
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
        <LoadBoundary state={state}>
          {(bindings) => (
            <RuleBindingList bindings={bindings} scenarios={scenarios} />
          )}
        </LoadBoundary>
      )}
    </section>
  );
}
