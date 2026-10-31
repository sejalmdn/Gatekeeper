import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Candidate, Dataset, EvaluationRun, RunSettings } from "../types";
import { formatNumber, timestamp } from "../utils/format";
import { percent } from "../utils/results";
import { Icon } from "./Icon";
import { CopyButton } from "./CopyButton";
import "../styles/EvaluationRunHeader.css";

interface EvaluationRunHeaderProps {
  projectId: string;
  run: EvaluationRun;
  candidate: Candidate;
  dataset: Dataset;
  settings: RunSettings;
  actions: ReactNode;
}

// Puts run identity, execution progress, and frozen input references in a compact header.
export function EvaluationRunHeader({
  projectId,
  run,
  candidate,
  dataset,
  settings,
  actions,
}: EvaluationRunHeaderProps): ReactElement {
  const status =
    run.status === "pending" && run.queued_at ? "queued" : run.status;
  const active = run.status === "pending" || run.status === "running";
  return (
    <header className="evaluation-run-header">
      <Link
        className="evaluation-run-header__back"
        to={`/projects/${projectId}/evaluation-runs`}
      >
        <span aria-hidden="true">←</span> Back to executions
      </Link>
      <div className="evaluation-run-header__title-row">
        <div>
          <div className="evaluation-run-header__title">
            <h1>Evaluation run</h1>
            <span
              className={`evaluation-run-header__status evaluation-run-header__status--${status}`}
            >
              <span aria-hidden="true">
                {run.status === "completed" ? "✓" : "○"}
              </span>
              Execution: {status}
            </span>
          </div>
          <p className="evaluation-run-header__identity">
            <span className="evaluation-run-header__run-id">
              <span>Run ID:</span>
              <code>{run.id}</code>
              <CopyButton value={run.id} label="Copy run ID" />
            </span>
          </p>
        </div>
        <div className="evaluation-run-header__meta-actions">
          <span className="evaluation-run-header__created">
            Created <time dateTime={run.created_at}>{timestamp(run.created_at)}</time>
          </span>
          <div className="evaluation-run-header__actions">{actions}</div>
        </div>
      </div>
      <div className="evaluation-run-header__context">
        <dl>
          <div>
            <dt>
              <Icon name="candidate" /> Candidate
            </dt>
            <dd>
              <Link to={`/projects/${projectId}/candidates/${candidate.id}`}>
                {candidate.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt>
              <Icon name="dataset" /> Dataset
            </dt>
            <dd>
              <Link to={`/projects/${projectId}/datasets/${dataset.id}`}>
                {dataset.name}
              </Link>
            </dd>
          </div>
          <div>
            <dt>Attempt Rules</dt>
            <dd>{settings.attempts_per_scenario} attempts <span>/ scenario</span> • {formatNumber(settings.timeout_ms / 1000)}s <span>timeout</span></dd>
          </div>
          <div>
            <dt>Pass threshold</dt>
            <dd>{percent(settings.pass_threshold)}</dd>
          </div>
        </dl>
        <div className="evaluation-run-header__progress">
          <span>
            {run.finished_attempts} / {run.total_attempts} attempts finished
          </span>
          <progress
            aria-label="Attempt progress"
            value={run.finished_attempts}
            max={Math.max(run.total_attempts, 1)}
          />
        </div>
      </div>
      {run.cancel_requested_at && active && (
        <p className="evaluation-run-header__stopping" role="status">
          Stopping after the current attempt…
        </p>
      )}
    </header>
  );
}
