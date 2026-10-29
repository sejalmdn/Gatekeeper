import { type ReactElement } from "react";
import type { ExecutionAttempt } from "../types";
import { AttemptEvidence } from "./AttemptEvidence";

interface ExecutionAttemptsProps {
  attempts: ExecutionAttempt[];
  projectId: string;
  runId: string;
  opened?: string;
  onOpen: (id?: string) => void;
}

// Groups immutable attempt identities by scenario and opens evidence on click.
export function ExecutionAttempts({
  attempts,
  projectId,
  runId,
  opened,
  onOpen,
}: ExecutionAttemptsProps): ReactElement {
  if (attempts.length === 0) {
    return (
      <p className="empty-state">
        Start this run to allocate its scenario attempts.
      </p>
    );
  }
  const scenarioIds = [
    ...new Set(attempts.map((attempt) => attempt.scenario_id)),
  ];
  return (
    <div className="execution-attempts__scenarios">
      {scenarioIds.map((scenarioId) => {
        const group = attempts.filter(
          (attempt) => attempt.scenario_id === scenarioId,
        );
        const scenario = group[0];
        return (
          <section className="execution-attempts__scenario" key={scenarioId}>
            <header>
              <div>
                <h2>{scenario.scenario_name}</h2>
                <p>
                  {scenario.scenario_key} ·{" "}
                  {scenario.scenario_type.replaceAll("_", " ")}
                </p>
              </div>
              <span>{group.length} attempts</span>
            </header>
            {group.map((attempt) => (
              <div className="execution-attempts__attempt" key={attempt.id}>
                <button
                  type="button"
                  className="execution-attempts__attempt-heading"
                  aria-expanded={opened === attempt.id}
                  aria-controls={`attempt-${attempt.id}`}
                  onClick={() =>
                    onOpen(opened === attempt.id ? undefined : attempt.id)
                  }
                >
                  <span>Attempt {attempt.attempt_number}</span>
                  <span className="execution-attempts__attempt-id">
                    {attempt.id}
                  </span>
                  <span className="badge">
                    {attempt.status.replaceAll("_", " ")}
                  </span>
                  <span aria-hidden="true">
                    {opened === attempt.id ? "−" : "+"}
                  </span>
                </button>
                {opened === attempt.id && (
                  <div id={`attempt-${attempt.id}`}>
                    <AttemptEvidence
                      key={`${attempt.id}-${attempt.status}`}
                      projectId={projectId}
                      runId={runId}
                      executionId={attempt.id}
                    />
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
