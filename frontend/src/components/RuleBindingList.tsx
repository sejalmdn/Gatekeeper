import type { ReactElement } from "react";
import type { EffectiveRuleBinding, RuleBinding, Scenario } from "../types";
import { RULE_DEFINITIONS, summarizeRule } from "../utils/rules";
import { JsonBlock } from "./RecordData";

// Shows saved conditions, scope, and effective-rule provenance without presenting scores.
export function RuleBindingList({
  bindings,
  scenarios,
}: {
  bindings: (RuleBinding | EffectiveRuleBinding)[];
  scenarios: Scenario[];
}): ReactElement {
  if (!bindings.length) {
    return (
      <p className="empty-state">
        No rules in this scope. Add a rule to define an evaluation check.
      </p>
    );
  }
  return (
    <div className="dataset-rules__list">
      {bindings.map((rule) => {
        const scenario = scenarios.find((item) => item.id === rule.scenario_id);
        const definition = RULE_DEFINITIONS.find(
          (item) => item.type === rule.rule_type,
        );
        return (
          <article className="dataset-rules__rule" key={rule.id}>
            <div className="section-title">
              <h3>{rule.rule_key}</h3>
              <span className="badge">
                {rule.role} · {rule.severity}
              </span>
            </div>
            <p>{definition?.label ?? rule.rule_type}</p>
            <p>{summarizeRule(rule.rule_type, rule.parameters)}</p>
            <p>
              {scenario
                ? `Scenario: ${scenario.name}`
                : `Dataset default: ${rule.applies_to?.join(", ")}`}
            </p>
            {"source" in rule && (
              <p className="dataset-rules__origin">
                {rule.source === "dataset"
                  ? "Inherited from dataset"
                  : "Scenario-specific"}
                {rule.overridden_rule_id &&
                  " · Replaces the dataset default with the same key"}
              </p>
            )}
            <details>
              <summary>Definition details</summary>
              <p>Check: {rule.rule_type}</p>
              <JsonBlock value={rule.parameters} />
            </details>
          </article>
        );
      })}
    </div>
  );
}
