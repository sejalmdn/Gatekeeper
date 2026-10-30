import { useState, type ReactElement } from "react";
import type { BindingSummary } from "../types";
import { ruleStatus } from "../utils/ruleStatus";
import { ScenarioRuleCountRow } from "./ScenarioRuleCountRow";
import "../styles/ScenarioRuleCounts.css";

// Filters rule-level outcome tallies while keeping undecided rules accessible in All.
export function ScenarioRuleCounts({
  rules,
}: {
  rules: BindingSummary[];
}): ReactElement {
  // Retains the requested outcome filter while the scenario's live counts refresh.
  const [filter, setFilter] = useState("All");

  const filters = ["All", "Failing", "Passing"];
  const visible = rules.filter(
    (rule) => filter === "All" || ruleStatus(rule) === filter,
  );
  return (
    <section
      className="scenario-rule-counts"
      aria-label="Binding outcome counts"
    >
      <header>
        <div>
          <h4>
            Binding outcome counts <span>{rules.length} rules</span>
          </h4>
          <p>Rule outcomes across planned attempts.</p>
        </div>
        <div
          className="scenario-rule-counts__filters"
          role="group"
          aria-label="Filter rule outcomes"
        >
          {filters.map((name) => (
            <button
              key={name}
              aria-pressed={filter === name}
              onClick={() => setFilter(name)}
            >
              {name} (
              {
                rules.filter(
                  (rule) => name === "All" || ruleStatus(rule) === name,
                ).length
              }
              )
            </button>
          ))}
        </div>
      </header>
      {rules.length === 0 && (
        <p>No authored rules are configured for this scenario.</p>
      )}
      {rules.length > 0 && visible.length === 0 && (
        <p>No rules match this filter.</p>
      )}
      <div className="scenario-rule-counts__list">
        {visible.map((rule) => (
          <ScenarioRuleCountRow key={rule.rule_binding_id} rule={rule} />
        ))}
      </div>
    </section>
  );
}
