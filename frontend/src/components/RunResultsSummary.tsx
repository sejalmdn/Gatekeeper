import type { ReactElement } from "react";
import type { RunSummary } from "../types";
import { formatNumber } from "../utils/format";
import { percent, resultLabel } from "../utils/results";
import { ResultCounts } from "./ResultCounts";
import { ResultMetrics } from "./ResultMetrics";
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
          Available attempt grades and Evidence remain inspectable. Retry repeats reads only.
        </p>
      </section>
    );
  }
  const { aggregates } = summary;
  const flakyScenarios = summary.scenarios.filter(
    (scenario) => scenario.stability === "flaky",
  ).length;
  const flakinessRate = summary.scenarios.length
    ? flakyScenarios / summary.scenarios.length
    : null;

  return (
    <section className="run-results-summary" aria-label="Run results summary">
      <div className="run-results-summary__cards">
        <article className="run-results-summary__card">
          <h2>Scenario assessments</h2>
          <p className="run-results-summary__value">
            {summary.scenarios.length}
            <span>scenarios</span>
          </p>
          <ResultCounts counts={aggregates.scenario_assessment_counts} compact />
        </article>
        <article className="run-results-summary__card">
          <h2>Passing attempts</h2>
          <p className="run-results-summary__value">
            {aggregates.attempts.passing_attempts}
            <span>/ {aggregates.attempts.planned_attempts}</span>
          </p>
          <div className="run-results-summary__bar" role="img" aria-label={`${aggregates.attempts.passing_attempts} of ${aggregates.attempts.planned_attempts} attempts passing`}><span style={{ width: `${aggregates.attempts.planned_attempts ? (aggregates.attempts.passing_attempts / aggregates.attempts.planned_attempts) * 100 : 0}%` }} /></div>
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
            <div
              className="run-results-summary__bar"
              role="img"
              aria-label={`Attempt pass rate ${percent(aggregates.attempts.pass_rate)}`}
            >
              <span
                style={{ width: `${aggregates.attempts.pass_rate * 100}%` }}
              />
            </div>
          )}
          <p className="run-results-summary__caption">
            Across all planned attempts
          </p>
        </article>
        <article className="run-results-summary__card">
          <h2>Flakiness rate</h2>
          <p className={`run-results-summary__value${flakinessRate === 0 ? " run-results-summary__value--optimal" : ""}`}>
            {percent(flakinessRate)}
          </p>
          <p className="run-results-summary__caption run-results-summary__flakiness-caption">
            {flakinessRate === 0 && <span aria-hidden="true">✓</span>}
            {flakyScenarios} of {summary.scenarios.length} scenarios are flaky
          </p>
        </article>
        <article className="run-results-summary__card">
          <h2>Weighted score</h2>
          <p className="run-results-summary__value">
            {percent(aggregates.score.weighted_score)}
          </p>
          <p className="run-results-summary__caption">
            <p className="result-score__coverage">
              <span>coverage:</span>
              <span>
                {percent(aggregates.score.coverage)}
                {aggregates.score.coverage !== null && (
                  <> ({formatNumber(aggregates.score.known_weight)}/{formatNumber(aggregates.score.planned_weight)})</>
                )}
              </span>
            </p>
            {aggregates.score.reason && aggregates.score.reason !== "no_scored_rules" && (
              <p className="run-results-summary__caption result-score__reason">
                {resultLabel(aggregates.score.reason)} <code>{aggregates.score.reason}</code>
              </p>
            )}
          </p>
          
        </article>
      </div>
      <ResultMetrics metrics={aggregates.metrics} />
    </section>
  );
}
