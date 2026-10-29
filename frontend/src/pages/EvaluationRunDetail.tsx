import { useRef, useState, type ReactElement } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { cancelEvaluationRun, startEvaluationRun } from "../api";
import { RunEvidence } from "../components/RunEvidence";
import { RunResults } from "../components/RunResults";
import { useRunResults } from "../hooks/useRunResults";
import { EvaluationRunHeader } from "../components/EvaluationRunHeader";
import { useExecutionRun } from "../hooks/useExecutionRun";
import { messageFor } from "../utils/format";
import "../styles/ExecutionView.css";

// Shows execution progress, backend results, and evidence as independent inspection surfaces.
export function EvaluationRunDetail(): ReactElement {
  // Reads the scoped run identity from its stable inspection URL.
  const { projectId = "", recordId = "" } = useParams();

  // Carries a failed initial start into the saved run's retry action.
  const { state: navigationState } = useLocation();

  // Retains prior evidence if an active run cannot be refreshed.
  const { data, error, refresh } = useExecutionRun(projectId, recordId);

  // Makes tab and disclosure selection shareable and browser-navigation aware.
  const [search, setSearch] = useSearchParams();

  const tab = search.get("tab") === "evidence" ? "evidence" : "results";

  // Keeps successful reporting data when switching between Results and Evidence.
  const results = useRunResults(
    projectId,
    recordId,
    data?.run,
    tab === "results",
  );

  function select(scenario?: string, attempt?: string, nextTab = tab): void {
    const next = new URLSearchParams(search);
    next.set("tab", nextTab);
    if (scenario) next.set("scenario", scenario);
    else next.delete("scenario");
    if (attempt) next.set("attempt", attempt);
    else next.delete("attempt");
    setSearch(next);
  }

  // Explains action failures without discarding the saved run.
  const [actionError, setActionError] = useState<string | undefined>(
    typeof navigationState?.startError === "string"
      ? navigationState.startError
      : undefined,
  );

  // Disables lifecycle actions while their request is in flight.
  const [busy, setBusy] = useState(false);

  // Guards against repeated clicks before the disabled state renders.
  const submitting = useRef(false);

  // Applies idempotent lifecycle operations to this run and reloads its persisted progress.
  async function actOnRun(action: "start" | "cancel"): Promise<void> {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setActionError(undefined);
    try {
      const operation =
        action === "start" ? startEvaluationRun : cancelEvaluationRun;
      await operation(projectId, recordId);
      refresh();
    } catch (failure) {
      setActionError(messageFor(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!data) {
    if (error)
      return (
        <section className="page-content">
          <p role="alert">{error}</p>
          <button onClick={refresh}>Refresh</button>
        </section>
      );
    return (
      <p className="page-state" role="status">
        Loading execution…
      </p>
    );
  }
  const { run, candidate, dataset, settings, attempts } = data;
  const active = run.status === "pending" || run.status === "running";
  return (
    <section className="evaluation-run-detail page-content">
      <EvaluationRunHeader
        projectId={projectId}
        run={run}
        candidate={candidate}
        dataset={dataset}
        settings={settings}
        actions={
          <>
            {run.status === "pending" && !run.queued_at && (
              <button
                className="button"
                disabled={busy}
                onClick={() => void actOnRun("start")}
              >
                Start run
              </button>
            )}
            {active && (
              <button
                className="button button-secondary"
                disabled={busy || Boolean(run.cancel_requested_at)}
                onClick={() => void actOnRun("cancel")}
              >
                Cancel run
              </button>
            )}
          </>
        }
      />
      {(error || actionError) && (
        <div role="alert" className="evaluation-run-detail__error">
          <p>{error || actionError}</p>
          {error && (
            <button type="button" onClick={refresh}>
              Refresh
            </button>
          )}
        </div>
      )}
      {run.error && (
        <p role="alert">
          {run.error.message} <code>{run.error.code}</code>
        </p>
      )}
      <div
        role="tablist"
        aria-label="Run inspection"
        className="run-results__tabs"
      >
        {(["results", "evidence"] as const).map((value) => (
          <button
            key={value}
            id={`run-tab-${value}`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`run-panel-${value}`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() =>
              select(
                search.get("scenario") ?? undefined,
                search.get("attempt") ?? undefined,
                value,
              )
            }
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              let nextTab: "results" | "evidence" =
                tab === "results" ? "evidence" : "results";
              if (event.key === "Home") nextTab = "results";
              if (event.key === "End") nextTab = "evidence";
              select(
                search.get("scenario") ?? undefined,
                search.get("attempt") ?? undefined,
                nextTab,
              );
              document.getElementById(`run-tab-${nextTab}`)?.focus();
            }}
          >
            {value === "results" ? "Results" : "Evidence"}
          </button>
        ))}
      </div>
      <div
        id={`run-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`run-tab-${tab}`}
        tabIndex={0}
      >
        {tab === "results" ? (
          <RunResults
            projectId={projectId}
            run={run}
            summary={results.summary}
            attempts={
              results.evaluations ??
              (results.evaluationsError ? attempts : []).map((attempt) => ({
                ...attempt,
                verdict: "not_evaluated" as const,
                evaluator_version: null,
                evaluated_at: null,
                outcome_counts: {},
              }))
            }
            gradesAvailable={results.evaluations !== undefined}
            loading={results.loading}
            summaryError={results.summaryError}
            evaluationsError={results.evaluationsError}
            retry={results.retry}
            scenarioId={search.get("scenario") ?? undefined}
            attemptId={search.get("attempt") ?? undefined}
            select={select}
          />
        ) : (
          <RunEvidence
            cancelled={run.status === "cancelled"}
            attempts={attempts}
            projectId={projectId}
            runId={recordId}
            opened={search.get("attempt") ?? undefined}
            onOpen={(id) =>
              select(
                attempts.find((attempt) => attempt.id === id)?.scenario_id,
                id,
              )
            }
          />
        )}
      </div>
      <div
        id={`run-panel-${tab === "results" ? "evidence" : "results"}`}
        role="tabpanel"
        aria-labelledby={`run-tab-${tab === "results" ? "evidence" : "results"}`}
        hidden
      />
    </section>
  );
}
