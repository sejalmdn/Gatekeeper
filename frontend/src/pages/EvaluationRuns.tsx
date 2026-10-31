import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { listEvaluationRuns } from "../api";
import { LoadBoundary } from "../components/Feedback";
import { PageHeading } from "../components/PageHeading";
import { useLoad } from "../hooks/useLoad";
import { Icon } from "../components/Icon";
import { timestamp } from "../utils/format";
import "../styles/ExecutionView.css";
import "../styles/RecordList.css";

// Lists saved executions so their evidence can be revisited after navigation or refresh.
export function EvaluationRuns(): ReactElement {
  // Scopes the execution ledger to the selected project.
  const { projectId = "" } = useParams();

  // Loads persisted runs rather than inferring progress from local navigation state.
  const state = useLoad(() => listEvaluationRuns(projectId));

  return (
    <section className="page-content">
      <PageHeading
        title="Executions"
        detail="Run history and recorded attempt evidence."
        action={
          <Link className="button" to="new">
            <Icon name="plus" />
            New run
          </Link>
        }
      />
      <div className="record-list evaluation-runs__list">
        <div className="record-list-header">
          <h2>
            All records
            <span>{state.data?.length ?? "—"}</span>
          </h2>
          <span className="record-list-note">Project scoped</span>
        </div>
        <div className="evaluation-runs__ledger-header" aria-hidden="true">
          <span>Run</span>
          <span>Attempts</span>
          <span>Status</span>
        </div>
        <LoadBoundary state={state}>
          {(runs) => {
            if (runs.length === 0)
              return (
                <p className="empty-state">
                  No executions yet. Start a run to collect scenario evidence.
                </p>
              );
            return (
              <div className="evaluation-runs__ledger">
                {[...runs].reverse().map((run) => (
                  <Link
                    key={run.id}
                    to={run.id}
                    className="evaluation-runs__ledger-row"
                  >
                    <div>
                      <strong>{run.id.slice(0, 8)}</strong>
                      <p>{timestamp(run.created_at)}</p>
                    </div>
                    <span>
                      {run.finished_attempts} / {run.total_attempts}
                    </span>
                    <span className="badge">
                      {run.status === "pending" && run.queued_at
                        ? "queued"
                        : run.status}
                    </span>
                  </Link>
                ))}
              </div>
            );
          }}
        </LoadBoundary>
      </div>
    </section>
  );
}
