import { useRef, useState, type ReactElement } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { cancelEvaluationRun, startEvaluationRun } from "../api";
import { ExecutionAttempts } from "../components/ExecutionAttempts";
import { Notice } from "../components/Feedback";
import { RecordDetails } from "../components/RecordDetails";
import { useExecutionRun } from "../hooks/useExecutionRun";
import { messageFor } from "../utils/format";
import "../styles/ExecutionView.css";

// Shows execution progress and attempt evidence without implying evaluation success.
export function EvaluationRunDetail(): ReactElement {
  // Reads the scoped run identity from its stable inspection URL.
  const { projectId = "", recordId = "" } = useParams();

  // Carries a failed initial start into the saved run's retry action.
  const { state: navigationState } = useLocation();

  // Retains prior evidence if an active run cannot be refreshed.
  const { data, error, refresh } = useExecutionRun(projectId, recordId);

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
  const statusLabel =
    run.status === "pending" && run.queued_at ? "queued" : run.status;
  return (
    <RecordDetails
      title="Execution and evidence"
      detail={`${candidate.name} / ${dataset.name}`}
      backTo={`/projects/${projectId}/evaluation-runs`}
      backLabel="Back to executions"
      createdAt={run.created_at}
    >
      <div className="evaluation-run-detail">
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
        <section className="evaluation-run-detail__progress">
          <div>
            <span className="badge badge-amber">{statusLabel}</span>
            <h2>
              {run.finished_attempts} / {run.total_attempts} attempts finished
            </h2>
            <progress
              aria-label="Attempt progress"
              value={run.finished_attempts}
              max={Math.max(run.total_attempts, 1)}
            />
            {run.cancel_requested_at && active && (
              <p>Stopping after the current attempt…</p>
            )}
          </div>
          <div className="evaluation-run-detail__actions">
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
          </div>
        </section>
        {run.error && (
          <p role="alert">
            {run.error.message} <code>{run.error.code}</code>
          </p>
        )}
        <dl className="evaluation-run-detail__metrics">
          <div>
            <dt>Candidate</dt>
            <dd>
              <Link to={`/projects/${projectId}/candidates/${candidate.id}`}>
                {candidate.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Dataset</dt>
            <dd>
              <Link to={`/projects/${projectId}/datasets/${dataset.id}`}>
                {dataset.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Attempts per scenario</dt>
            <dd>{settings.attempts_per_scenario}</dd>
          </div>
          <div>
            <dt>Timeout per attempt</dt>
            <dd>{settings.timeout_ms / 1000} seconds</dd>
          </div>
          <div>
            <dt>Pass threshold · inactive</dt>
            <dd>{Number((settings.pass_threshold * 100).toFixed(6))}%</dd>
          </div>
        </dl>
        <Notice>
          Execution collects evidence. Rules and pass threshold are inactive
          until grading is implemented. Completed means the run finished
          collecting attempts.
        </Notice>
        {run.status === "cancelled" && attempts.length === 0 ? (
          <p>This run was cancelled before attempts were allocated.</p>
        ) : (
          <ExecutionAttempts
            attempts={attempts}
            projectId={projectId}
            runId={recordId}
          />
        )}
        {run.snapshot_digest && (
          <details className="evaluation-run-detail__snapshot">
            <summary>Frozen configuration</summary>
            <p>
              Snapshot v1 · <code>{run.snapshot_digest}</code>
            </p>
            <p>
              Candidate settings, scenario inputs, and private rules were frozen
              when queued.
            </p>
          </details>
        )}
      </div>
    </RecordDetails>
  );
}
