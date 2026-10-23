import type { ReactElement } from "react";
import type { EffectiveRuleBinding, RuleBinding, Scenario } from "../types";
import {
  RULE_DEFINITIONS,
  RULE_SEVERITY_OPTIONS,
  summarizeRule,
} from "../utils/rules";
import { JsonBlock } from "./RecordData";

// Shows saved scenario checks and their private expectations without presenting scores.
export function RuleBindingList({
  bindings,
  scenarios,
}: {
  bindings: (RuleBinding | EffectiveRuleBinding)[];
  scenarios: Scenario[];
}): ReactElement {
  const scenarioBindings = bindings.filter((rule) => rule.scenario_id !== null);
  if (!scenarioBindings.length) {
    return (
      <p className="empty-state">
        No scenario rules yet. Add a rule to define an evaluation check.
      </p>
    );
  }
  return (
    <div className="dataset-rules__list">
      {scenarioBindings.map((rule) => {
        const scenario = scenarios.find((item) => item.id === rule.scenario_id);
        const definition = RULE_DEFINITIONS.find(
          (item) => item.type === rule.rule_type,
        );
        const role =
          rule.role === "informational"
            ? "Report only"
            : `${rule.role[0].toUpperCase()}${rule.role.slice(1)}`;
        const severity = RULE_SEVERITY_OPTIONS.find(
          (option) => option.value === rule.severity,
        );
        return (
          <article className="dataset-rules__rule" key={rule.id}>
            <div className="section-title">
              <h3>{rule.rule_key}</h3>
              <span className="badge">
                {role}
                {rule.role === "scored" && severity
                  ? ` · ${severity.label} weight (${severity.weight})`
                  : ""}
              </span>
            </div>
            <p>{definition?.label ?? rule.rule_type}</p>
            <p>{summarizeRule(rule.rule_type, rule.parameters)}</p>
            <p>Scenario: {scenario?.name ?? rule.scenario_id}</p>
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
