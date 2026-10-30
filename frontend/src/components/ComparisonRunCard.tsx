import { Link } from "react-router-dom";
import type { ComparisonRun } from "../types";
import { timestamp } from "../utils/format";

// Presents one frozen run's identity and execution policy in a compact comparison card.
export function ComparisonRunCard({
  run,
  side,
  base,
}: {
  run: ComparisonRun;
  side: "A" | "B";
  base: string;
}) {
  return (
    <article
      className={`comparison-run-card comparison-run-card--${side.toLowerCase()}`}
    >
      <header className="comparison-run-card__heading">
        <span className="comparison-run-card__label">Run {side}</span>
        <Link to={`${base}/${run.id}`} title={run.id}>
          #{run.id.slice(0, 8)}
        </Link>
        <span className="comparison-run-card__status">{run.status}</span>
      </header>
      <h2>{run.candidate_name ?? "Historical candidate"}</h2>
      <p className="comparison-run-card__model">
        {run.model ?? "Model unavailable"}
      </p>
      {run.settings && (
        <dl className="comparison-run-card__settings">
          <div>
            <dt>Attempts</dt>
            <dd>{run.settings.attempts_per_scenario} / scenario</dd>
          </div>
          <div>
            <dt>Timeout</dt>
            <dd>{run.settings.timeout_ms.toLocaleString()} ms</dd>
          </div>
          <div>
            <dt>Threshold</dt>
            <dd>{run.settings.pass_threshold * 100}%</dd>
          </div>
        </dl>
      )}
      <footer className="comparison-run-card__dates">
        <span>Created: {timestamp(run.created_at)}</span>
        <span>
          Completed:{" "}
          {run.completed_at ? timestamp(run.completed_at) : "Unavailable"}
        </span>
      </footer>
    </article>
  );
}
