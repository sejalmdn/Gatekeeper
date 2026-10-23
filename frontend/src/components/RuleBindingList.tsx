import type { ReactElement } from "react";
import type { EffectiveRuleBinding, RuleBinding, Scenario } from "../types";
import {
  RULE_DEFINITIONS,
  RULE_SEVERITY_OPTIONS,
  summarizeRule,
} from "../utils/rules";
import { JsonBlock } from "./RecordData";
import "../styles/RuleBindingList.css";

// Groups private checks by scenario with aligned expectations and expandable definitions.
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
  const scenarioIds = [
    ...new Set(scenarioBindings.map((rule) => rule.scenario_id)),
  ];

  return (
    <div className="rule-binding-list">
      {scenarioIds.map((scenarioId) => {
        const scenario = scenarios.find((item) => item.id === scenarioId);
        const rules = scenarioBindings.filter(
          (rule) => rule.scenario_id === scenarioId,
        );
        return (
          <section className="rule-binding-list__group" key={scenarioId}>
            <header className="rule-binding-list__scenario">
              <div className="rule-binding-list__scenario-identity">
                <span className="rule-binding-list__eyebrow">Scenario</span>
                <h3>{scenario?.name ?? scenarioId}</h3>
                {scenario && (
                  <p className="rule-binding-list__scenario-meta">
                    <span>{scenario.scenario_key}</span>
                    <span>{scenario.scenario_type.replaceAll("_", " ")}</span>
                  </p>
                )}
              </div>
              <span className="rule-binding-list__count">
                {rules.length} {rules.length === 1 ? "rule" : "rules"}
              </span>
            </header>
            <div className="rule-binding-list__columns" aria-hidden="true">
              <span>Rule / check</span>
              <span>Expectation</span>
              <span>Result role</span>
            </div>
            {rules.map((rule) => {
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
                <article className="rule-binding-list__rule" key={rule.id}>
                  <div className="rule-binding-list__identity">
                    <h4>{rule.rule_key}</h4>
                    <p>{definition?.label ?? rule.rule_type}</p>
                  </div>
                  <p className="rule-binding-list__expectation">
                    {summarizeRule(rule.rule_type, rule.parameters)}
                  </p>
                  <div className="rule-binding-list__role">
                    <span className="rule-binding-list__role-label">
                      Result role
                    </span>
                    <span
                      className={`rule-binding-list__badge rule-binding-list__badge--${rule.role}`}
                    >
                      {role}
                      {rule.role === "scored" && severity
                        ? ` · ${severity.label} weight (${severity.weight})`
                        : ""}
                    </span>
                  </div>
                  <details className="rule-binding-list__details">
                    <summary>Definition details</summary>
                    <div className="rule-binding-list__definition">
                      <p>
                        Check: <code>{rule.rule_type}</code>
                      </p>
                      <JsonBlock value={rule.parameters} />
                    </div>
                  </details>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
