import { useState, type ReactElement } from "react";
import type { EffectiveRuleBinding, RuleEvaluationResult } from "../types";
import { ResultBadge } from "./ResultBadge";
import { JsonViewer } from "./JsonViewer";
import "../styles/AuthoredRuleResult.css";

// Presents a saved authored-rule verdict with diagnostics, without exposing regex expressions.
export function AuthoredRuleResult({
  check,
  rule,
}: {
  check: RuleEvaluationResult;
  rule?: EffectiveRuleBinding;
}): ReactElement {
  // Defers mounting the JSON editor until its rule reference is inspected.
  const [referenceOpen, setReferenceOpen] = useState(false);

  let explanation = check.explanation;
  if (check.rule_type === "response.regex" && check.outcome === "pass") {
    explanation = "The response matches the configured regular expression.";
  }
  if (check.rule_type === "response.regex" && check.outcome === "fail") {
    explanation =
      "The response does not match the configured regular expression.";
  }

  return (
    <article
      className={`authored-rule-result authored-rule-result--${check.outcome}`}
    >
      <header className="authored-rule-result__header">
        <div className="authored-rule-result__identity">
          <div className="authored-rule-result__title">
            <ResultBadge outcome={check.outcome} />
            <h4>{check.rule_key}</h4>
          </div>
          <dl className="authored-rule-result__metadata">
            <div>
              <dt>Type</dt>
              <dd>
                <code>{check.rule_type}</code>
              </dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{check.role}</dd>
            </div>
            <div>
              <dt>Severity</dt>
              <dd>{check.severity}</dd>
            </div>
          </dl>
        </div>
        <div className="authored-rule-result__evidence">
          <span>Evidence references:</span>
          {check.evidence_references.length === 0 ? (
            <span>No evidence references supplied.</span>
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
      </header>
      <div className="authored-rule-result__body">
        <div className="authored-rule-result__diagnostics">
          <h5>Evaluation reason</h5>
          <span className="authored-rule-result__reason-code">
            Reason code: <code>{check.reason}</code>
          </span>
        </div>
        <p className="authored-rule-result__explanation">{explanation}</p>
        <details
          className="authored-rule-result__details"
          onToggle={(event) => setReferenceOpen(event.currentTarget.open)}
        >
          <summary>Rule reference</summary>
          {referenceOpen &&
            (rule ? (
              <JsonViewer
                value={rule.parameters}
                label={`Frozen rule parameters for ${check.rule_key}`}
              />
            ) : (
              <p>Frozen rule configuration is unavailable for this result.</p>
            ))}
        </details>
      </div>
    </article>
  );
}
