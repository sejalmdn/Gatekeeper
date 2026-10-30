import type { ReactElement } from "react";
import type { AttemptEvaluationSummary, ScenarioSummary } from "../types";
import { percent, resultLabel } from "../utils/results";
import { formatNumber, formatUsd } from "../utils/format";
import { AttemptGrading } from "./AttemptGrading";
import { ResultBadge } from "./ResultBadge";
import { ScenarioAssessment } from "./ScenarioAssessment";
import { ScenarioOperationalMetrics } from "./ScenarioOperationalMetrics";
import { ScenarioRuleCounts } from "./ScenarioRuleCounts";
import "../styles/ScenarioResults.css";

interface ScenarioResultsProps {
  scenario: { scenario_id: string; scenario_name: string; scenario_key: string };
  summary?: ScenarioSummary;
  attempts: AttemptEvaluationSummary[];
  projectId: string;
  runId: string;
  opened: boolean;
  gradesAvailable: boolean;
  evaluationActive?: boolean;
  openedAttempt?: string;
  onToggle: () => void;
  onAttempt: (id: string) => void;
}

// Shows one readable scenario row and the selected scenario's attempts and findings.
export function ScenarioResults({
  scenario,
  summary,
  attempts,
  projectId,
  runId,
  opened,
  gradesAvailable,
  evaluationActive,
  openedAttempt,
  onToggle,
  onAttempt,
}: ScenarioResultsProps): ReactElement {
  const selected = attempts.find((attempt) => attempt.id === openedAttempt);
  const observed = summary?.tool_requests_observed;
  const unknown = summary?.tool_requests_unknown;
  let toolLabel = "Tool evidence unknown";

  if (observed != null && unknown != null) {
    if (observed > 0) {
      toolLabel = `Requested in ${observed} of ${summary?.attempts.planned_attempts} attempts; execution unverified`;
    } else if (unknown > 0) {
      toolLabel = "Tool request evidence incomplete";
    } else {
      toolLabel = "No tool request observed";
    }
  }

  return (
    <section className={`scenario-results scenario-results--${summary?.assessment ?? "unavailable"}`} data-open={opened}>
      <button
        className="scenario-results__heading"
        aria-expanded={opened}
        aria-controls={`scenario-results-${scenario.scenario_id}`}
        onClick={onToggle}
      >
        <span className="scenario-results__name">{scenario.scenario_name}</span>
        <ResultBadge outcome={summary?.assessment ?? "Unavailable"} />
        <span className="scenario-results__field">
          <small>Stability</small>{summary ? resultLabel(summary.stability) : "Unavailable"}
        </span>
        <span className="scenario-results__field">
          <small>Score</small>{summary ? percent(summary.score.weighted_score) : "Unavailable"}
        </span>
        <span className="scenario-results__tool">{toolLabel}</span>
      </button>
      {opened && (
        <div id={`scenario-results-${scenario.scenario_id}`} className="scenario-results__body">
          <p className="scenario-results__summary">
            {summary?.attempts.passing_attempts ?? 0} / {summary?.attempts.planned_attempts ?? attempts.length} attempts passed
            {summary && ` · Pass threshold ${percent(summary.pass_threshold)}`}
          </p>
          {summary?.reasons.length ? (
            <p className="scenario-results__summary">Assessment unresolved: {summary.reasons.map(resultLabel).join(", ")}</p>
          ) : null}
          <div className="scenario-results__attempts" aria-label={`${scenario.scenario_name} attempts`}>
            {attempts.map((attempt) => (
              <button
                key={attempt.id}
                className="scenario-results__attempt"
                aria-pressed={selected?.id === attempt.id}
                onClick={() => onAttempt(attempt.id)}
              >
                Attempt {attempt.attempt_number} · {gradesAvailable ? resultLabel(attempt.verdict) : "Grade unavailable"}
              </button>
            ))}
          </div>
          {attempts.length === 0 && <p>No attempts allocated for this scenario.</p>}
          {selected && (
            <div id={`grade-${selected.id}`}>
              <AttemptGrading
                key={selected.id}
                projectId={projectId}
                runId={runId}
                attempt={selected}
                evaluationActive={evaluationActive}
              />
            </div>
          )}
          {summary && (
            <>
              <div className="scenario-results__metrics">
                <span>Mean latency: {formatNumber(summary.metrics.latency_ms.mean)} ms</span>
                <span>Mean tokens: {formatNumber(summary.metrics.total_tokens.mean)}</span>
                <span>Estimated cost: {formatUsd(summary.metrics.estimated_cost_usd?.sum)}</span>
                <span>Score coverage: {percent(summary.score.coverage)}</span>
              </div>
              <details className="scenario-results__technical">
                <summary>Detailed report</summary>
                <ScenarioAssessment summary={summary} />
                <ScenarioOperationalMetrics metrics={summary.metrics} />
                <ScenarioRuleCounts rules={summary.bindings} />
              </details>
            </>
          )}
        </div>
      )}
    </section>
  );
}
