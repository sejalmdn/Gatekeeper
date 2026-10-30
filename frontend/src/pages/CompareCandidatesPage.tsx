import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  listCandidates,
  listDatasets,
  listEvaluationRuns,
  listRunSettings,
} from "../api";
import { ComparisonCandidatePicker } from "../components/ComparisonCandidatePicker";
import { Icon } from "../components/Icon";
import type { Candidate, Dataset, EvaluationRun, RunSettings } from "../types";
import { messageFor } from "../utils/format";
import "../styles/RunComparison.css";
import "../styles/CompareCandidates.css";

// Guides dataset, candidate, and saved-run selection before opening comparison results.
export function CompareCandidatesPage() {
  const { projectId = "" } = useParams();
  // Stores every selection in the URL for refresh and return navigation.
  const [search, setSearch] = useSearchParams();

  // Keeps the compatible catalog together so selectors never use partial data.
  const [catalog, setCatalog] = useState<{
    datasets: Dataset[];
    candidates: Candidate[];
    runs: EvaluationRun[];
    settings: RunSettings[];
  }>();

  // Explains catalog failures and allows retry without losing linked choices.
  const [error, setError] = useState("");

  // Restarts catalog loading after a transient failure.
  const [retry, setRetry] = useState(0);

  // Reads saved metadata only; choosing inputs never starts an execution.
  useEffect(() => {
    let active = true;
    void Promise.all([
      listDatasets(projectId),
      listCandidates(projectId),
      listEvaluationRuns(projectId),
      listRunSettings(projectId),
    ])
      .then(([datasets, candidates, runs, settings]) => {
        if (active) setCatalog({ datasets, candidates, runs, settings });
      })
      .catch((failure: unknown) => {
        if (active) setError(messageFor(failure));
      });
    return () => {
      active = false;
    };
  }, [projectId, retry]);

  if (error)
    return (
      <section className="page-content run-comparison">
        <h1>Compare candidates</h1>
        <p role="alert">{error}</p>
        <button
          onClick={() => {
            setError("");
            setRetry(retry + 1);
          }}
        >
          Retry
        </button>
      </section>
    );
  if (!catalog)
    return (
      <section className="page-content run-comparison" role="status">
        Loading saved runs…
      </section>
    );

  const runA = search.get("runA") ?? "";
  const runB = search.get("runB") ?? "";
  const linkedA = catalog.runs.find((run) => run.id === runA);
  const linkedB = catalog.runs.find((run) => run.id === runB);
  const datasetId =
    search.get("dataset") ?? linkedA?.dataset_id ?? linkedB?.dataset_id ?? "";
  const candidateA = search.get("candidateA") ?? linkedA?.candidate_id ?? "";
  const candidateB = search.get("candidateB") ?? linkedB?.candidate_id ?? "";
  const terminal = catalog.runs.filter(
    (run) =>
      run.dataset_id === datasetId &&
      ["completed", "failed", "cancelled"].includes(run.status),
  );
  const validA = terminal.some(
    (run) => run.id === runA && run.candidate_id === candidateA,
  );
  const validB = terminal.some(
    (run) => run.id === runB && run.candidate_id === candidateB,
  );
  const ready = validA && validB && runA !== runB;
  const change = (key: string, value: string) => {
    const next = new URLSearchParams({
      dataset: datasetId,
      candidateA,
      candidateB,
      runA,
      runB,
    });
    next.set(key, value);
    if (key === "dataset") {
      ["candidateA", "candidateB", "runA", "runB"].forEach((field) =>
        next.delete(field),
      );
    }
    if (key === "candidateA") next.delete("runA");
    if (key === "candidateB") next.delete("runB");
    if (key === "runA" && value === runB) next.delete("runB");
    setSearch(next);
  };
  const selection = new URLSearchParams({ runA, runB });

  return (
    <section className="page-content run-comparison compare-candidates">
      <header className="run-comparison__hero">
        <span className="run-comparison__eyebrow">
          Saved evaluation evidence
        </span>
        <h1>Compare candidates</h1>
        <p>
          Start with a dataset, then choose a candidate and a saved run for each
          side.
        </p>
      </header>
      {((runA && !validA) || (runB && !validB) || (runA && runA === runB)) && (
        <p role="alert" className="compare-candidates__notice">
          Linked selections are unavailable or incompatible. Choose two distinct
          terminal runs on the selected dataset. Your linked run IDs are
          preserved: {runA || "—"} / {runB || "—"}.
        </p>
      )}
      <section className="compare-candidates__dataset">
        <label className="compare-candidates__label">
          Dataset
          <select
            value={datasetId}
            onChange={(event) => change("dataset", event.target.value)}
          >
            <option value="">Select a dataset</option>
            {datasetId &&
              !catalog.datasets.some((dataset) => dataset.id === datasetId) && (
                <option value={datasetId}>
                  Unavailable dataset: {datasetId}
                </option>
              )}
            {catalog.datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Only completed, failed, and cancelled runs on this dataset can be
          compared.
        </p>
      </section>
      {!datasetId && (
        <div className="compare-candidates__empty">
          <Icon name="dataset" />
          <h2>Choose the evidence to compare</h2>
          <p>Select a dataset above to see candidates with saved runs.</p>
          {catalog.datasets.length === 0 && (
            <Link to={`/projects/${projectId}/datasets`}>
              Add a dataset to get started
            </Link>
          )}
        </div>
      )}
      {datasetId && terminal.length < 2 && (
        <p className="compare-candidates__notice">
          No compatible pair of runs yet. Save at least two terminal runs on
          this dataset.{" "}
          <Link to={`/projects/${projectId}/evaluation-runs`}>
            View executions
          </Link>
        </p>
      )}
      {datasetId && (
        <>
          <div className="run-comparison__run-cards">
            {(["A", "B"] as const).map((side) => {
              const runs = terminal.filter(
                (run) => side === "A" || run.id !== runA,
              );
              return (
                <ComparisonCandidatePicker
                  key={side}
                  side={side}
                  candidates={catalog.candidates.filter((candidate) =>
                    runs.some((run) => run.candidate_id === candidate.id),
                  )}
                  runs={runs}
                  settings={catalog.settings}
                  candidateId={side === "A" ? candidateA : candidateB}
                  runId={side === "A" ? runA : runB}
                  onCandidate={(id) => change(`candidate${side}`, id)}
                  onRun={(id) => change(`run${side}`, id)}
                />
              );
            })}
          </div>
          <footer className="compare-candidates__footer">
            <p>Use distinct runs. Both sides may use the same candidate.</p>
            {ready ? (
              <Link
                className="compare-candidates__submit"
                to={`/projects/${projectId}/evaluation-runs/compare?${selection}`}
              >
                Compare runs →
              </Link>
            ) : (
              <button className="compare-candidates__submit" disabled>
                Compare runs →
              </button>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
