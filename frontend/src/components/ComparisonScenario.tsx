import { useState } from "react";
import type { ScenarioComparison } from "../types";
import {
  comparisonDelta,
  comparisonDirection,
  comparisonRate,
  comparisonValue,
} from "../utils/comparison";
import { ComparisonStatistics } from "./ComparisonStatistics";
import { Icon } from "./Icon";

// Expands a scenario into common-rule pass rates or summary operational metrics.
export function ComparisonScenario({
  scenario,
}: {
  scenario: ScenarioComparison;
}) {
  // Lets reviewers switch between rule outcomes and operational evidence for this scenario.
  const [view, setView] = useState<"rules" | "metrics">("rules");

  const delta = scenario.differences.pass_rate_pp;
  const direction = comparisonDirection(delta);

  return (
    <details className="comparison-scenario">
      <summary className="comparison-scenario__trigger">
        <span className="comparison-scenario__icon">
          <Icon name="dataset" />
        </span>
        <span className="comparison-scenario__identity">
          <span className="comparison-scenario__title">
            {scenario.scenario_name}
          </span>
          <span className="comparison-scenario__key">
            {scenario.scenario_key}
          </span>
          <span
            className={`comparison-scenario__delta comparison-scenario__delta--${direction}`}
          >
            {comparisonDelta(delta)}
          </span>
          <span className="comparison-scenario__description">
            {scenario.common_rules.length} common rules
          </span>
        </span>
        <span className="comparison-scenario__measurement">
          <small>Pass rate · A / B</small>
          <span>
            {comparisonRate(scenario.run_a.pass_rate)} <i>→</i>{" "}
            {comparisonRate(scenario.run_b.pass_rate)}
          </span>
        </span>
        <span className="comparison-scenario__measurement comparison-scenario__latency">
          <small>Mean latency · B</small>
          <span>
            {comparisonValue(scenario.run_b.metrics.latency_ms.mean)} ms
          </span>
        </span>
        <span className="comparison-scenario__chevron">
          <Icon name="chevron" />
        </span>
      </summary>
      <div className="comparison-scenario__content">
        <div className="comparison-scenario__toolbar">
          <div
            className="comparison-scenario__views"
            aria-label={`${scenario.scenario_name} view`}
          >
            <button
              type="button"
              aria-pressed={view === "rules"}
              onClick={() => setView("rules")}
            >
              Rule pass rates
            </button>
            <button
              type="button"
              aria-pressed={view === "metrics"}
              onClick={() => setView("metrics")}
            >
              Operational metrics
            </button>
          </div>
        </div>
        {view === "metrics" && (
          <ComparisonStatistics
            a={scenario.run_a}
            b={scenario.run_b}
            delta={scenario.differences}
            summaryOnly
          />
        )}
        {view === "rules" && (
          <section
            className="comparison-scenario__rules"
            aria-label="Rule pass rates"
          >
            <header className="comparison-scenario__rules-header">
              <h2>Rule pass rates</h2>
              <p>Common rules · passing results / planned results</p>
            </header>
            {scenario.common_rules.length === 0 ? (
              <p className="comparison-scenario__empty">
                No common rules. Choose Operational metrics to compare saved
                observations.
              </p>
            ) : (
              <div className="comparison-scenario__scroll">
                <table className="comparison-scenario__table">
                  <thead>
                    <tr>
                      <th scope="col">Rule</th>
                      <th scope="col">Role / severity</th>
                      <th scope="col">Run A</th>
                      <th scope="col">Run B</th>
                      <th scope="col">Delta (B − A)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenario.common_rules.map((rule) => (
                      <tr key={rule.run_a.rule_binding_id}>
                        <th scope="row" title={rule.run_a.rule_binding_id}>
                          {rule.run_a.rule_key}
                          <small className="comparison-scenario__rule-type">
                            {rule.run_a.rule_type}
                          </small>
                        </th>
                        <td>
                          {rule.run_a.role} <span>/ {rule.run_a.severity}</span>
                        </td>
                        <td>
                          {comparisonRate(rule.pass_rate_a)}{" "}
                          <small>
                            ({rule.run_a.outcome_counts.pass}/
                            {rule.run_a.planned_results})
                          </small>
                        </td>
                        <td>
                          {comparisonRate(rule.pass_rate_b)}{" "}
                          <small>
                            ({rule.run_b.outcome_counts.pass}/
                            {rule.run_b.planned_results})
                          </small>
                        </td>
                        <td>
                          <span
                            className={`comparison-scenario__rule-delta comparison-scenario__rule-delta--${comparisonDirection(rule.pass_rate_difference_pp)}`}
                          >
                            {comparisonDelta(rule.pass_rate_difference_pp)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="comparison-scenario__note">
              Passing results / planned results. Unknown, errored, and
              unevaluated results remain in the denominator.
            </p>
            {(scenario.only_in_run_a.length > 0 ||
              scenario.only_in_run_b.length > 0) && (
              <section
                className="comparison-scenario__exclusive"
                aria-label="Exclusive rules"
              >
                <h3>Exclusive rules</h3>
                {[scenario.only_in_run_a, scenario.only_in_run_b].map(
                  (rules, index) =>
                    rules.length > 0 && (
                      <div key={index}>
                        <h4>
                          Only in Run {index === 0 ? "A" : "B"} ({rules.length})
                        </h4>
                        <ul>
                          {rules.map((rule) => (
                            <li key={rule.rule_binding_id}>
                              {rule.rule_key} · {rule.role} / {rule.severity}
                              <small className="comparison-scenario__rule-type">
                                {rule.rule_type}
                              </small>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ),
                )}
              </section>
            )}
          </section>
        )}
      </div>
    </details>
  );
}
