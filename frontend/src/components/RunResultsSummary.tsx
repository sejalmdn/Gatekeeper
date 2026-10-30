import type { ReactElement } from "react";
import type { RunSummary } from "../types";
import { formatNumber, formatUsd } from "../utils/format";
import { percent, resultLabel } from "../utils/results";
import "../styles/RunResultsSummary.css";

// Presents the suite score, flakiness, and a short operational summary.
export function RunResultsSummary({
  summary,
  notStarted,
}: {
  summary: RunSummary;
  notStarted: boolean;
}): ReactElement {
  if (summary.availability === "unavailable" || !summary.aggregates) {
    return (
      <section className="run-results-summary" aria-label="Report unavailable">
        <h2>Summary unavailable</h2>
        <p>
          {notStarted
            ? "Start this run to collect results."
            : resultLabel(summary.reason ?? "unknown_reporting_state")}
        </p>
        <p>Attempt results and evidence may still be available below.</p>
      </section>
    );
  }

  const { aggregates } = summary;
  const flaky = summary.scenarios.filter((item) => item.stability === "flaky").length;
  const total = summary.scenarios.length;
  const active = summary.execution_status === "pending" || summary.execution_status === "running";

  return (
    <section className="run-results-summary" aria-label="Run results summary">
      <div className="run-results-summary__primary">
        <div>
          <span>Suite score</span>
          <strong>{percent(aggregates.score.weighted_score)}</strong>
          {aggregates.score.weighted_score === null && (
            <small>{aggregates.score.reason === "no_scored_rules" ? "No scored rules" : "Scored results incomplete"}</small>
          )}
        </div>
        <div>
          <span>Flaky scenarios{active ? " · partial" : ""}</span>
          <strong>{total ? percent(flaky / total) : "Unavailable"}</strong>
          <small>{flaky} of {total} scenarios</small>
        </div>
        <div>
          <span>Scenarios assessed</span>
          <strong>{total - (aggregates.scenario_assessment_counts.pending ?? 0)} / {total}</strong>
          <small>{aggregates.attempts.passing_attempts} / {aggregates.attempts.planned_attempts} attempts passed</small>
        </div>
      </div>
      <p className="run-results-summary__metrics">
        <span>Score coverage: {percent(aggregates.score.coverage)}</span>
        <span>Mean latency: {formatNumber(aggregates.metrics.latency_ms.mean)} ms</span>
        <span>Mean tokens: {formatNumber(aggregates.metrics.total_tokens.mean)}</span>
        <span>Estimated cost: {formatUsd(aggregates.metrics.estimated_cost_usd?.sum)}</span>
      </p>
    </section>
  );
}
