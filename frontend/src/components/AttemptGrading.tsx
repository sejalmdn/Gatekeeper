import type { ReactElement } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAttemptGrade } from "../hooks/useAttemptGrade";
import type { AttemptEvaluationSummary } from "../types";
import { GradingCheck } from "./GradingCheck";
import { ResultBadge } from "./ResultBadge";
import "../styles/AttemptGrading.css";

// Opens one attempt's full grading without fetching provider artifacts.
export function AttemptGrading({
  projectId,
  runId,
  attempt,
}: {
  projectId: string;
  runId: string;
  attempt: AttemptEvaluationSummary;
}): ReactElement {
  // Refreshes this grade when its evaluator timestamp or verdict changes.
  const { data, error, retry } = useAttemptGrade(projectId, runId, attempt);

  // Preserves scenario selection when linking to the same attempt's evidence.
  const [search] = useSearchParams();

  const evidence = new URLSearchParams(search);
  evidence.set("tab", "evidence");
  evidence.set("scenario", attempt.scenario_id);
  evidence.set("attempt", attempt.id);
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
        <Link className="button button-secondary" to={`?${evidence}`}>
          View evidence
        </Link>
      </header>
      {error && (
        <p role="alert">
          Grade unavailable: {error}{" "}
          <button onClick={retry}>Retry grade</button>
        </p>
      )}
      {!data && !error && <p role="status">Loading grading…</p>}
      {data && (
        <>
          {data.verdict === "not_evaluated" && (
            <p>No stored evaluation is available for this attempt.</p>
          )}
          <section
            className="attempt-grading__automatic"
            aria-label="Automatic tool validation"
          >
            <h3>Automatic tool validation</h3>
            {data.automatic_tool_validation.length === 0 && (
              <p>No automatic tool checks recorded.</p>
            )}
            {data.automatic_tool_validation.map((check, index) => (
              <GradingCheck key={index} check={check} />
            ))}
          </section>
          <section aria-label="Authored rule results">
            <h3>Authored rule results</h3>
            {data.rule_results.length === 0 && (
              <p>No authored rule results recorded.</p>
            )}
            {data.rule_results.map((check) => (
              <GradingCheck key={check.rule_binding_id} check={check} />
            ))}
          </section>
        </>
      )}
    </section>
  );
}
