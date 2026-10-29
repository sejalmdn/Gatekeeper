import type { ReactElement } from "react";
import type { CheckResult, RuleEvaluationResult } from "../types";
import { ResultBadge } from "./ResultBadge";
import "../styles/GradingCheck.css";

// Keeps authored rule metadata and evidence pointers visible alongside a check's explanation.
export function GradingCheck({
  check,
}: {
  check: CheckResult | RuleEvaluationResult;
}): ReactElement {
  return (
    <article className={`grading-check grading-check--${check.outcome}`}>
      <header className="grading-check__heading">
        <h4>{"rule_key" in check ? check.rule_key : "Tool-schema check"}</h4>
        <ResultBadge outcome={check.outcome} />
      </header>
      {"rule_key" in check && (
        <div className="grading-check__metadata">
          <code>{check.rule_type}</code>
          <span>{check.role}</span>
          <span>Severity: {check.severity}</span>
          <span>
            Binding <code>{check.rule_binding_id}</code>
          </span>
        </div>
      )}
      <p className="grading-check__explanation">Reason: {check.explanation}</p>
      <p className="grading-check__reason">
        Reason code: <code>{check.reason}</code>
      </p>
      <div className="grading-check__evidence">
        <span>Evidence references:</span>
        {check.evidence_references.length === 0 ? (
          <p>No evidence references supplied.</p>
        ) : (
          <ul>
            {check.evidence_references.map((reference, index) => (
              <li key={`${reference}-${index}`}>
                <code>{reference}</code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
