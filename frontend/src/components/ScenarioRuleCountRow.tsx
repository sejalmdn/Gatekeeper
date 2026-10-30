import { useState, type ReactElement } from "react";
import type { BindingSummary } from "../types";
import { ruleStatus } from "../utils/ruleStatus";
import { ResultCounts } from "./ResultCounts";
import { JsonViewer } from "./JsonViewer";

// Shows one compact outcome row and defers its report JSON until requested.
export function ScenarioRuleCountRow({
  rule,
}: {
  rule: BindingSummary;
}): ReactElement {
  // Mounts the read-only editor only for an inspected rule summary.
  const [opened, setOpened] = useState(false);

  const status = ruleStatus(rule);
  return (
    <article
      className={`scenario-rule-counts__row scenario-rule-counts__row--${status.toLowerCase()}`}
    >
      <div className="scenario-rule-counts__identity">
        <div className="scenario-rule-counts__name">
          <span aria-hidden="true">●</span>
          <h5>{rule.rule_key}</h5>
          <span className="scenario-rule-counts__badge">
            {rule.role === "informational" ? "Informational" : status}
          </span>
        </div>
        <p>
          <code>{rule.rule_type}</code>
          <span>
            {rule.role} · {rule.severity}
          </span>
          <span>{rule.planned_results} planned results</span>
        </p>
      </div>
      <ResultCounts counts={rule.outcome_counts} />
      <details onToggle={(event) => setOpened(event.currentTarget.open)}>
        <summary>Details</summary>
        {opened && (
          <JsonViewer
            value={rule}
            label={`Reported rule summary for ${rule.rule_key}`}
          />
        )}
      </details>
    </article>
  );
}
