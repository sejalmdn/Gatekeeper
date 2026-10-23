import type { ReactElement } from "react";
import type { Scenario } from "../types";
import { JsonBlock } from "./RecordData";
import "../styles/DatasetScenarioList.css";

// Lists scenario identities with expandable immutable inputs.
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
        <div className="dataset-scenarios__collection">
          <div className="dataset-scenarios__header">
            <span>Name</span>
            <span>Key</span>
            <span>Type</span>
          </div>
          <ul className="dataset-scenarios__list">
            {scenarios.map((scenario) => (
              <li key={scenario.id}>
                <details className="dataset-scenarios__item">
                  <summary className="dataset-scenarios__row">
                    <span className="dataset-scenarios__name">
                      {scenario.name}
                    </span>
                    <span className="dataset-scenarios__key">
                      {scenario.scenario_key}
                    </span>
                    <span className="dataset-scenarios__type">
                      {scenario.scenario_type.replaceAll("_", " ")}
                    </span>
                    <span
                      className="dataset-scenarios__indicator"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </summary>
                  <div className="dataset-scenarios__details">
                    <h3>Input</h3>
                    <JsonBlock value={scenario.input} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
