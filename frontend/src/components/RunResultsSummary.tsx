import type { ReactElement } from "react";
import type { RunSummary } from "../types";
import { percent, resultLabel } from "../utils/results";
import { ResultCounts } from "./ResultCounts";
import { ResultMetrics } from "./ResultMetrics";
import { ResultScore } from "./ResultScore";
import "../styles/RunResultsSummary.css";

// Presents backend assessment counts and totals without inventing a run-wide verdict.
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
            ? "This run has not started. Start it to freeze configuration and collect results."
            : resultLabel(summary.reason ?? "unknown_reporting_state")}
        </p>
        {summary.reason && <code>{summary.reason}</code>}
        <p>
          Available attempt grades and Evidence remain inspectable. Retry
          repeats reads only.
        </p>
      </section>
    );
  }
  const { aggregates } = summary;
  return (
    <section className="run-results-summary" aria-label="Run results summary">
      <div className="run-results-summary__cards">
        <article className="run-results-summary__card">
          <h2>Scenario assessments</h2>
          <p className="run-results-summary__value">
            {summary.scenarios.length}
            <span>scenarios</span>
          </p>
          <ResultCounts counts={aggregates.scenario_assessment_counts} />
        </article>
        <article className="run-results-summary__card">
          <h2>Passing / planned attempts</h2>
          <p className="run-results-summary__value">
            {aggregates.attempts.passing_attempts}
            <span>/ {aggregates.attempts.planned_attempts}</span>
          </p>
          <p className="run-results-summary__caption">
            {aggregates.attempts.decisive_attempts} decisive grading outcomes
          </p>
        </article>
        <article className="run-results-summary__card">
          <h2>Attempt pass rate</h2>
          <p className="run-results-summary__value">
            {percent(aggregates.attempts.pass_rate)}
          </p>
          {aggregates.attempts.pass_rate !== null && (
            <meter
              min={0}
              max={1}
              value={aggregates.attempts.pass_rate}
              aria-label="Attempt pass rate"
            />
          )}
          <p className="run-results-summary__caption">
            Across all planned attempts
          </p>
        </article>
        <article className="run-results-summary__card">
          <ResultScore score={aggregates.score} />
        </article>
      </div>
      <ResultMetrics metrics={aggregates.metrics} />
    </section>
  );
}
