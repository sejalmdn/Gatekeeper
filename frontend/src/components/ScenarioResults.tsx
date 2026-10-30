import type { ReactElement } from "react";
import type { AttemptEvaluationSummary, ScenarioSummary } from "../types";
import { percent, resultLabel, resultSymbol } from "../utils/results";
import { AttemptGrading } from "./AttemptGrading";
import { ScenarioOperationalMetrics } from "./ScenarioOperationalMetrics";
import { ScenarioAssessment } from "./ScenarioAssessment";
import { ScenarioRuleCounts } from "./ScenarioRuleCounts";
import { ResultScore } from "./ResultScore";
import { ResultBadge } from "./ResultBadge";
import "../styles/ScenarioResults.css";

interface ScenarioResultsProps {
  scenario: {
    scenario_id: string;
    scenario_name: string;
    scenario_key: string;
  };
  summary?: ScenarioSummary;
  attempts: AttemptEvaluationSummary[];
  projectId: string;
  runId: string;
  opened: boolean;
  gradesAvailable: boolean;
  openedAttempt?: string;
  onToggle: () => void;
  onAttempt: (id: string) => void;
}

// Shows frozen scenario assessments with a compact strip of independently labeled attempt verdicts.
export function ScenarioResults({
  scenario,
  summary,
  attempts,
  projectId,
  runId,
  opened,
  gradesAvailable,
  openedAttempt,
  onToggle,
  onAttempt,
}: ScenarioResultsProps): ReactElement {
  const selected = attempts.find((attempt) => attempt.id === openedAttempt);
  return (
    <section
      className={`scenario-results scenario-results--${summary?.assessment ?? "unavailable"}`}
      data-open={opened}
    >
      <h3>
        <button
          className="scenario-results__heading"
          aria-expanded={opened}
          aria-controls={`scenario-results-${scenario.scenario_id}`}
          onClick={onToggle}
        >
          <span className="scenario-results__disclosure" aria-hidden="true">
            {opened ? "−" : "+"}
          </span>
          <span className="scenario-results__identity">
            <span>{scenario.scenario_name}</span>
            <code>{scenario.scenario_key}</code>
          </span>
          <ResultBadge
            outcome={summary?.assessment ?? "Unavailable"}
            prefix="Assessment"
          />
        </button>
      </h3>
      {summary && (
        <div className="scenario-results__overview">
          <dl className="scenario-results__stats">
            <div>
              <dt>Passing / planned</dt>
              <dd>
                {summary.attempts.passing_attempts} /{" "}
                {summary.attempts.planned_attempts}
              </dd>
            </div>
            <div>
              <dt>Pass rate</dt>
              <dd className="scenario-results__rate">
                {percent(summary.attempts.pass_rate)}
                {summary.attempts.pass_rate !== null && (
                  <svg
                    className="scenario-results__rate-bar"
                    viewBox="0 0 100 12"
                    role="img"
                    aria-label={`Pass rate ${percent(summary.attempts.pass_rate)}; threshold ${percent(summary.pass_threshold)}`}
                  >
                    <rect
                      className="scenario-results__track"
                      y="3"
                      width="100"
                      height="6"
                      rx="3"
                    />
                    <rect
                      y="3"
                      width={summary.attempts.pass_rate * 100}
                      height="6"
                      rx="3"
                    />
                    <line
                      x1={summary.pass_threshold * 100}
                      x2={summary.pass_threshold * 100}
                      y1="1"
                      y2="11"
                    />
                  </svg>
                )}
                <span className="scenario-results__sr-only">
                  Threshold: {percent(summary.pass_threshold)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Stability</dt>
              <dd
                className={`scenario-results__stability scenario-results__stability--${summary.stability}`}
              >
                <span aria-hidden="true">● </span>
                {resultLabel(summary.stability)}
              </dd>
            </div>
          </dl>
          <ResultScore score={summary.score} compact />
        </div>
      )}
      {opened && (
        <div
          id={`scenario-results-${scenario.scenario_id}`}
          className="scenario-results__body"
        >
          <div className="scenario-results__attempt-heading">
            <h4>Repeated attempts</h4>
            <span>Select an attempt to inspect its grading</span>
          </div>
          {attempts.length === 0 && (
            <p>No attempts allocated for this scenario.</p>
          )}
          <div
            className="scenario-results__attempts"
            aria-label={`${scenario.scenario_name} attempts`}
          >
            {attempts.map((attempt) => (
              <button
                key={attempt.id}
                className={`scenario-results__attempt scenario-results__attempt--${gradesAvailable ? attempt.verdict : "unknown"}`}
                aria-expanded={selected?.id === attempt.id}
                aria-controls={`grade-${attempt.id}`}
                onClick={() => onAttempt(attempt.id)}
              >
                <span>Attempt {attempt.attempt_number}</span>
                <strong>
                  <span aria-hidden="true">
                    {resultSymbol(
                      gradesAvailable ? attempt.verdict : "unknown",
                    )}
                  </span>
                  {gradesAvailable
                    ? resultLabel(attempt.verdict)
                    : "Unknown grade"}
                </strong>
                <span>Execution: {resultLabel(attempt.status)}</span>
              </button>
            ))}
          </div>
          {selected && (
            <div id={`grade-${selected.id}`}>
              <AttemptGrading
                key={selected.id}
                projectId={projectId}
                runId={runId}
                attempt={selected}
              />
            </div>
          )}
          {summary && (
            <>
              <div className="scenario-results__diagnostics">
                <ScenarioAssessment summary={summary} />
                <ScenarioOperationalMetrics metrics={summary.metrics} />
              </div>
              <ScenarioRuleCounts rules={summary.bindings} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
