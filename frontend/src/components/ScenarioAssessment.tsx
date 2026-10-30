import type { ReactElement } from "react";
import type { ScenarioSummary } from "../types";
import { percent, resultLabel } from "../utils/results";
import { ResultCounts } from "./ResultCounts";
import "../styles/ScenarioAssessment.css";

// Separates execution progress, grading outcomes, and reasons for an unresolved assessment.
export function ScenarioAssessment({
  summary,
}: {
  summary: ScenarioSummary;
}): ReactElement {
  const { attempts } = summary;
  const persistentStates = ["completed", "failed", "timed_out", "skipped"];
  const executionCounts = Object.fromEntries([
    ...persistentStates.map((status) => [
      status,
      attempts.execution_status_counts[status] ?? 0,
    ]),
    ...Object.entries(attempts.execution_status_counts).filter(
      ([status, count]) => !persistentStates.includes(status) && count > 0,
    ),
  ]);
  const completed = attempts.execution_status_counts.completed ?? 0;
  const failed = attempts.evaluation_verdict_counts.fail ?? 0;
  const planned = attempts.planned_attempts;
  return (
    <section
      className="scenario-assessment"
      aria-label="Assessment and grading matrix"
    >
      <header>
        <h4>Assessment &amp; grading matrix</h4>
        <span>{planned} planned attempts</span>
      </header>
      <div className="scenario-assessment__group">
        <div className="scenario-assessment__label">
          <h5>Execution status</h5>
          <span>
            {completed} / {planned} completed
          </span>
        </div>
        <meter
          min={0}
          max={planned || 1}
          value={completed}
          aria-label="Completed attempts"
        />
        <ResultCounts counts={executionCounts} />
      </div>
      <div className="scenario-assessment__group scenario-assessment__group--grading">
        <div className="scenario-assessment__label">
          <h5>Evaluation outcomes</h5>
          <span>
            {planned ? percent(failed / planned) : "Unavailable"} fail rate
          </span>
        </div>
        <meter
          min={0}
          max={planned || 1}
          value={failed}
          aria-label="Failed evaluations"
        />
        <ResultCounts counts={attempts.evaluation_verdict_counts} />
      </div>
      {summary.reasons.length > 0 && (
        <aside className="scenario-assessment__reasons">
          <h5>Assessment reasons</h5>
          <ul>
            {summary.reasons.map((reason) => (
              <li key={reason}>
                {resultLabel(reason)} <code>{reason}</code>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}
