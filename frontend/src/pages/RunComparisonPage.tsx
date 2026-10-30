import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getRunComparison } from "../api";
import { ComparisonResults } from "../components/ComparisonResults";
import { ComparisonRunCard } from "../components/ComparisonRunCard";
import type { RunComparison } from "../types";
import { messageFor } from "../utils/format";
import "../styles/RunComparison.css";

// Renders the saved comparison with a return path to dataset and candidate selection.
export function RunComparisonPage() {
  const { projectId = "" } = useParams();
  // Keeps linked selections intact while explaining invalid or incompatible pairs.
  const [search, setSearch] = useSearchParams();

  // Tracks loading, unavailable evidence, and retryable comparison errors.
  const [result, setResult] = useState<{
    key?: string;
    data?: RunComparison;
    error?: string;
    loading: boolean;
  }>({ loading: true });

  // Triggers a fresh read after a recoverable failure.
  const [retry, setRetry] = useState(0);

  const runA = search.get("runA") ?? "";
  const runB = search.get("runB") ?? "";
  const base = `/projects/${projectId}/evaluation-runs`;

  const requestKey = JSON.stringify([projectId, runA, runB, retry]);

  // Reads only the linked pair and ignores responses for previous selections.
  useEffect(() => {
    let active = true;
    if (!runA || !runB) return;
    void getRunComparison(projectId, runA, runB)
      .then((data) => {
        if (active) setResult({ key: requestKey, data, loading: false });
      })
      .catch((error: unknown) => {
        if (active)
          setResult({
            key: requestKey,
            error: messageFor(error),
            loading: false,
          });
      });
    return () => {
      active = false;
    };
  }, [projectId, runA, runB, requestKey]);

  const current = result.key === requestKey;
  const data = current ? result.data : undefined;
  const swap = () => {
    const next = new URLSearchParams(search);
    next.set("runA", runB);
    next.set("runB", runA);
    setResult({ loading: true });
    setSearch(next);
  };

  return (
    <section className="page-content run-comparison">
      <header className="run-comparison__hero">
        <div className="run-comparison__intro">
          <span className="run-comparison__eyebrow">
            Saved evaluation evidence
          </span>
          <div className="run-comparison__title-row">
            <div>
              <h1>Compare execution runs</h1>
              <p>
                Side-by-side rule outcomes, pass-rate differences{" "}
                <strong>(Run B − Run A)</strong>, and operational metrics.
              </p>
            </div>
            <div className="run-comparison__actions">
              <Link to={`/projects/${projectId}/compare-candidates?${search}`}>
                Change selections
              </Link>
              <button
                type="button"
                className="run-comparison__swap"
                onClick={swap}
                disabled={!runA || !runB}
              >
                ⇄ Swap runs
              </button>
            </div>
          </div>
        </div>
        {data && (
          <p className="run-comparison__dataset" title={data.run_a.dataset_id}>
            Dataset: <strong>{data.run_a.dataset_name}</strong>
          </p>
        )}
        {data && data.warnings.length > 0 && (
          <aside
            className="run-comparison__warnings"
            aria-label="Comparison warnings"
          >
            <span>△ Comparison notes</span>
            {data.warnings.map((warning) => (
              <span className="run-comparison__warning" key={warning}>
                {warning.replaceAll("_", " ")}
              </span>
            ))}
          </aside>
        )}
      </header>
      {(!current || result.loading) && runA && runB && (
        <p role="status">Loading comparison…</p>
      )}
      {current && result.error && (
        <div role="alert">
          <p>{result.error}</p>
          <button
            onClick={() => {
              setResult({ loading: true });
              setRetry(retry + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {(!runA || !runB) && (
        <p>
          Choose a dataset, candidates, and two saved runs using Change
          selections above.
        </p>
      )}
      {data && (
        <>
          <div className="run-comparison__run-cards">
            <ComparisonRunCard run={data.run_a} side="A" base={base} />
            <ComparisonRunCard run={data.run_b} side="B" base={base} />
          </div>
          <ComparisonResults key={`${runA}-${runB}`} data={data} />
        </>
      )}
    </section>
  );
}
