import type { ReactElement } from "react";
import type {
  CheckResult,
  EffectiveRuleBinding,
  RuleEvaluationResult,
} from "../types";
import { AuthoredRuleResult } from "./AuthoredRuleResult";
import { ResultBadge } from "./ResultBadge";
import "../styles/GradingCheck.css";

// Keeps authored rule metadata and evidence pointers visible alongside a check's explanation.
export function GradingCheck({
  check,
  rule,
}: {
  check: CheckResult | RuleEvaluationResult;
  rule?: EffectiveRuleBinding;
}): ReactElement {
  if ("rule_key" in check) {
    return <AuthoredRuleResult check={check} rule={rule} />;
  }

  return (
    <article className={`grading-check grading-check--${check.outcome}`}>
      <header className="grading-check__heading">
        <h4>Tool-schema check</h4>
        <ResultBadge outcome={check.outcome} />
      </header>
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
