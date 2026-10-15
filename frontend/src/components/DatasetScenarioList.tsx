import type { ReactElement } from "react";
import type { Scenario } from "../types";
import { JsonBlock } from "./RecordData";
import "../styles/DatasetScenarioList.css";

// Shows the immutable scenarios stored with a dataset.
export function DatasetScenarioList({
  scenarios,
}: {
  scenarios: Scenario[];
}): ReactElement {
  return (
    <section className="dataset-scenarios detail-section">
      <div className="section-title">
        <div>
          <h2>Scenarios</h2>
          <p>Inputs are fixed for credible, repeatable evaluation.</p>
        </div>
        <span>{scenarios.length} records</span>
      </div>
      {scenarios.length === 0 ? (
        <div className="empty-state">
          <h3>No scenarios</h3>
          <p>This legacy dataset was created without scenarios.</p>
        </div>
      ) : (
        <div className="dataset-scenarios__list">
          {scenarios.map((scenario) => (
            <article key={scenario.id}>
              <div className="section-title">
                <h3>{scenario.name}</h3>
                <span>{scenario.scenario_type.replace("_", " ")}</span>
              </div>
              <p>{scenario.scenario_key}</p>
              <JsonBlock value={scenario.input} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
