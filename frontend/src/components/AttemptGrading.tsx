import { type ReactElement } from "react";
import { useAttemptGrade } from "../hooks/useAttemptGrade";
import type { AttemptEvaluationSummary } from "../types";
import { JudgeDetails } from "./JudgeDetails";
import { GradingCheck } from "./GradingCheck";
import { ResultBadge } from "./ResultBadge";
import "../styles/AttemptGrading.css";

// Opens one attempt's full grading without fetching provider artifacts.
export function AttemptGrading({
  projectId,
  runId,
  attempt,
  evaluationActive = false,
}: {
  projectId: string;
  runId: string;
  attempt: AttemptEvaluationSummary;
  evaluationActive?: boolean;
}): ReactElement {
  // Refreshes this grade when its evaluator timestamp or verdict changes.
  const { data, error, retry } = useAttemptGrade(projectId, runId, attempt);

  return (
    <section
      className="attempt-grading"
      aria-label={`Attempt ${attempt.attempt_number} grading`}
    >
      <header className="attempt-grading__header">
        <div>
          <h3>Attempt {attempt.attempt_number} grading</h3>
          {data && <ResultBadge outcome={data.verdict} prefix="Verdict" />}
        </div>
      </header>
      {error && (
        <p role="alert">
          Grade unavailable: {error}{" "}
          <button onClick={retry}>Reload results</button>
        </p>
      )}
      {!data && !error && <p role="status">Loading grading…</p>}
      {data && (
        <>
          {data.verdict === "not_evaluated" && (
            <p role="status">
              {evaluationActive &&
              attempt.status === "completed" &&
              !data.evaluated_at
                ? "Candidate execution completed. Evaluation is pending; results refresh automatically."
                : "No stored evaluation is available for this attempt."}
            </p>
          )}
          {data.judge && <JudgeDetails judge={data.judge} />}
          <section className="attempt-grading__technical">
            <h3>Technical details</h3>
            {data.automatic_tool_validation.length === 0 && data.rule_results.length === 0 && (
              <p>No technical details recorded.</p>
            )}
            {data.automatic_tool_validation.map((check, index) => (
              <GradingCheck key={index} check={check} />
            ))}
            {data.rule_results.map((check) => (
              <GradingCheck
                key={check.rule_binding_id}
                check={check}
                rule={data.rule_configurations?.find(
                  (rule) => rule.id === check.rule_binding_id,
                )}
              />
            ))}
          </section>
        </>
      )}
    </section>
  );
}
