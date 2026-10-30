import { useState, type ReactElement } from "react";
import { useAttemptGrade } from "../hooks/useAttemptGrade";
import type { AttemptEvaluationSummary } from "../types";
import { JudgeDetails } from "./JudgeDetails";
import { GradingCheck } from "./GradingCheck";
import { AttemptResponseModal } from "./AttemptResponseModal";
import { ResultBadge } from "./ResultBadge";
import { resultLabel } from "../utils/results";
import type { RuleEvaluationResult } from "../types";
import "../styles/AttemptGrading.css";

// Keeps configured regular expressions out of readable result explanations.
function readableExplanation(check: RuleEvaluationResult): string {
  if (check.rule_type !== "response.regex") return check.explanation;
  if (check.outcome === "pass") return "The response matches the configured regular expression.";
  return "The response does not match the configured regular expression.";
}

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

  // Opens evidence only for the selected attempt, without changing the Results URL.
  const [evidenceId, setEvidenceId] = useState<string>();

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
        <button
          className="button button-secondary"
          onClick={() => setEvidenceId(attempt.id)}
        >
          View evidence
        </button>
      </header>
      {evidenceId === attempt.id && (
        <AttemptResponseModal
          key={attempt.id}
          projectId={projectId}
          runId={runId}
          executionId={attempt.id}
          onClose={() => setEvidenceId(undefined)}
        />
      )}
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
          <section className="attempt-grading__findings" aria-label="Rule results">
            <h3>Checks</h3>
            {data.automatic_tool_validation.length === 0 && data.rule_results.length === 0 && (
              <p>No checks recorded.</p>
            )}
            {data.automatic_tool_validation.map((check, index) => (
              <p key={`automatic-${index}`}>
                <strong>Tool check</strong> · {resultLabel(check.outcome)} · {check.explanation}
              </p>
            ))}
            {data.rule_results.map((check) => (
              <p key={check.rule_binding_id}>
                <strong>{check.rule_key}</strong> · {resultLabel(check.outcome)} · {readableExplanation(check)}
              </p>
            ))}
          </section>
          <details className="attempt-grading__technical">
            <summary>Technical details</summary>
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
          </details>
        </>
      )}
    </section>
  );
}
