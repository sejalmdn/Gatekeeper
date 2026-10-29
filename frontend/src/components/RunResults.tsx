import type { ReactElement } from "react";
import type {
  AttemptEvaluationSummary,
  EvaluationRun,
  RunSummary,
} from "../types";
import { RunResultsSummary } from "./RunResultsSummary";
import { ScenarioResults } from "./ScenarioResults";
import { Icon } from "./Icon";
import "../styles/RunResults.css";

interface RunResultsProps {
  projectId: string;
  run: EvaluationRun;
  summary?: RunSummary;
  attempts: AttemptEvaluationSummary[];
  loading: boolean;
  gradesAvailable: boolean;
  summaryError?: string;
  evaluationsError?: string;
  retry: () => void;
  scenarioId?: string;
  attemptId?: string;
  select: (scenario?: string, attempt?: string) => void;
}

// Keeps successful reporting and inspectable grades visible through independent read failures.
export function RunResults({
  projectId,
  run,
  summary,
  attempts,
  loading,
  gradesAvailable,
  summaryError,
  evaluationsError,
  retry,
  scenarioId,
  attemptId,
  select,
}: RunResultsProps): ReactElement {
  const scenarios = summary?.scenarios.length
    ? summary.scenarios
    : [
        ...new Map(
          attempts.map((attempt) => [
            attempt.scenario_id,
            {
              scenario_id: attempt.scenario_id,
              scenario_name: attempt.scenario_name,
              scenario_key: attempt.scenario_key,
            },
          ]),
        ).values(),
      ];
  const selectedAttempt = attempts.find((attempt) => attempt.id === attemptId);
  const validScenario = scenarios.find(
    (scenario) => scenario.scenario_id === scenarioId,
  );
  const opened = validScenario?.scenario_id ?? selectedAttempt?.scenario_id;
  const active =
    run.status === "running" ||
    (run.status === "pending" && Boolean(run.queued_at));
  return (
    <div className="run-results">
      {active && (
        <p className="run-results__partial" role="status">
          Partial results · refreshes every two seconds
        </p>
      )}
      {(summaryError || evaluationsError) && (
        <div role="alert" className="evaluation-run-detail__error">
          <p>
            Reporting refresh failed. Previously loaded results may be stale.
          </p>
          {summaryError && <p>Summary: {summaryError}</p>}
          {evaluationsError && <p>Attempt evaluations: {evaluationsError}</p>}
          <button onClick={retry} disabled={loading}>
            Retry results
          </button>
        </div>
      )}
      {!summary && !summaryError && <p role="status">Loading results…</p>}
      {summary && (
        <RunResultsSummary
          summary={summary}
          notStarted={run.status === "pending" && !run.queued_at}
        />
      )}
      {summary?.availability === "unavailable" && (
        <button onClick={retry} disabled={loading}>
          Retry summary
        </button>
      )}
      <div className="run-results__section-heading">
        <h2>
          <Icon name="evaluation" /> Scenario results
        </h2>
        <span>
          {scenarios.length} {scenarios.length === 1 ? "scenario" : "scenarios"}
        </span>
      </div>
      {scenarios.map((scenario) => (
        <ScenarioResults
          key={scenario.scenario_id}
          scenario={scenario}
          summary={summary?.scenarios.find(
            (item) => item.scenario_id === scenario.scenario_id,
          )}
          attempts={attempts.filter(
            (attempt) => attempt.scenario_id === scenario.scenario_id,
          )}
          gradesAvailable={gradesAvailable}
          projectId={projectId}
          runId={run.id}
          opened={opened === scenario.scenario_id}
          openedAttempt={
            selectedAttempt && selectedAttempt.scenario_id === opened
              ? selectedAttempt.id
              : undefined
          }
          onToggle={() =>
            select(
              opened === scenario.scenario_id
                ? undefined
                : scenario.scenario_id,
            )
          }
          onAttempt={(id) =>
            select(scenario.scenario_id, attemptId === id ? undefined : id)
          }
        />
      ))}
      {scenarios.length === 0 && <p>No scenario results are available yet.</p>}
    </div>
  );
}
