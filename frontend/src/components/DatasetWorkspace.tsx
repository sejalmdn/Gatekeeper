import { useEffect, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { useDatasetBindings } from "../hooks/useDatasetBindings";
import type { Dataset, Scenario } from "../types";
import { DatasetHeader } from "./DatasetHeader";
import { DatasetScenarioList } from "./DatasetScenarioList";
import { JsonBlock } from "./RecordData";
import { RuleBindingList } from "./RuleBindingList";
import { RuleEditor } from "./RuleEditor";
import "../styles/DatasetWorkspace.css";

// Combines immutable scenario inputs and their private rules in one addressable workspace.
export function DatasetWorkspace({
  projectId,
  dataset,
  scenarios,
}: {
  projectId: string;
  dataset: Dataset;
  scenarios: Scenario[];
}): ReactElement {
  // Keeps selection and full-width authoring synchronized with browser history.
  const [searchParams, setSearchParams] = useSearchParams();

  // Shares one authoritative binding collection across scenario selection and rule creation.
  const { state, reload } = useDatasetBindings(projectId, dataset.id);

  const requestedScenario = scenarios.find(
    (scenario) => scenario.id === searchParams.get("scenario"),
  );
  const selected = requestedScenario ?? scenarios[0];
  const adding = Boolean(
    requestedScenario && searchParams.get("view") === "add",
  );
  const canonical = new URLSearchParams();
  if (selected) canonical.set("scenario", selected.id);
  if (adding) canonical.set("view", "add");
  const canonicalQuery = canonical.toString();
  const currentQuery = searchParams.toString();

  // Normalizes legacy tabs and invalid shortcuts without adding browser-history entries.
  useEffect(() => {
    if (currentQuery !== canonicalQuery) {
      setSearchParams(canonicalQuery, { replace: true });
    }
  }, [canonicalQuery, currentQuery, setSearchParams]);

  // Returns from authoring to the scenario that supplied the rule's immutable scope.
  function showScenario(): void {
    if (selected) setSearchParams({ scenario: selected.id });
  }

  // Refreshes rules and counts while preserving the selected scenario after creation.
  function finishSave(): void {
    reload();
    showScenario();
  }

  const boundScenarioIds = state.data
    ? new Set(state.data.map((binding) => binding.scenario_id))
    : undefined;
  const coveredScenarioCount = boundScenarioIds
    ? scenarios.filter((scenario) => boundScenarioIds.has(scenario.id)).length
    : undefined;
  const header = (
    <DatasetHeader
      dataset={dataset}
      projectId={projectId}
      scenarioCount={scenarios.length}
      ruleCount={state.data?.length}
      coveredScenarioCount={coveredScenarioCount}
    />
  );

  const feedback = (
    <div className="dataset-workspace__feedback">
      {state.loading && <p role="status">Loading rules…</p>}
      {state.error && (
        <>
          <p role="alert">Could not load rules. {state.error}</p>
          <button type="button" className="quiet-button" onClick={reload}>
            Retry rules
          </button>
        </>
      )}
    </div>
  );

  if (!selected) {
    return (
      <section className="page-content">
        {header}
        <div className="empty-state">
          <h3>No scenarios</h3>
          <p>This legacy dataset was created without scenarios.</p>
        </div>
      </section>
    );
  }

  if (adding) {
    return (
      <section className="page-content">
        {header}
        <section className="dataset-workspace dataset-workspace--authoring">
          <h2>Add rule</h2>
          <p className="dataset-workspace__description">
            Define a private evaluation check for {selected.name}.
          </p>
          {state.data ? (
            <RuleEditor
              key={selected.id}
              projectId={projectId}
              dataset={dataset}
              scenarios={[selected]}
              bindings={state.data}
              initialScenarioId={selected.id}
              scenarioLocked
              onCancel={showScenario}
              onSaved={finishSave}
            />
          ) : (
            <>
              {feedback}
              <button
                type="button"
                className="quiet-button"
                onClick={showScenario}
              >
                Back to scenario
              </button>
            </>
          )}
        </section>
      </section>
    );
  }

  const bindings = state.data?.filter(
    (binding) => binding.scenario_id === selected.id,
  );
  return (
    <section className="page-content">
      {header}
      <div className="dataset-workspace">
        <div className="dataset-workspace__layout">
          <DatasetScenarioList
            scenarios={scenarios}
            selectedId={selected.id}
            bindings={state.data}
          />
          <section
            className="dataset-workspace__detail"
            aria-labelledby="selected-scenario-heading"
            key={selected.id}
          >
            <header className="dataset-workspace__heading">
              <span className="dataset-workspace__eyebrow">Scenario</span>
              <h2 id="selected-scenario-heading">{selected.name}</h2>
              <dl className="dataset-workspace__metadata">
                <div>
                  <dt>Key</dt>
                  <dd>{selected.scenario_key}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{selected.scenario_type.replaceAll("_", " ")}</dd>
                </div>
              </dl>
            </header>
            <details className="dataset-workspace__input">
              <summary>Input</summary>
              <JsonBlock value={selected.input} />
            </details>
            <section
              className="dataset-workspace__rules"
              aria-labelledby="scenario-rules-heading"
            >
              <div className="dataset-workspace__rules-heading">
                <div>
                  <h3 id="scenario-rules-heading">Evaluation rules</h3>
                  <p>Private checks for this scenario.</p>
                </div>
                <button
                  type="button"
                  disabled={!state.data}
                  onClick={() =>
                    setSearchParams({ scenario: selected.id, view: "add" })
                  }
                >
                  Add rule
                </button>
              </div>
              {bindings ? (
                <RuleBindingList
                  bindings={bindings}
                  scenarios={[selected]}
                  hideScenarioHeader
                />
              ) : (
                feedback
              )}
            </section>
          </section>
        </div>
      </div>
    </section>
  );
}
