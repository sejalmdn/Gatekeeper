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
  const selected = attempts.find((attempt) => attempt.id === opened);
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
              </div>
              <span>{group.length} {group.length === 1 ? "attempt" : "attempts"}</span>
            </header>
            {group.map((attempt) => (
              <div className="execution-attempts__attempt" key={attempt.id}>
                <button
                  type="button"
                  className="execution-attempts__attempt-heading"
                  aria-pressed={opened === attempt.id}
                  onClick={() => onOpen(attempt.id)}
                >
                  <span>Attempt {attempt.attempt_number}</span>
                  <span className="badge">
                    {attempt.status.replaceAll("_", " ")}
                  </span>
                </button>
              </div>
            ))}
            {selected?.scenario_id === scenarioId && (
              <section className="execution-attempts__selected" aria-label="Selected attempt evidence">
                <h3>Attempt {selected.attempt_number} evidence</h3>
                <AttemptEvidence
                  key={`${selected.id}-${selected.status}`}
                  projectId={projectId}
                  runId={runId}
                  executionId={selected.id}
                />
              </section>
            )}
          </section>
        );
      })}
    </div>
  );
}
