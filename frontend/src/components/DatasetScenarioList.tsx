import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import type { RuleBinding, Scenario } from "../types";
import { Icon } from "./Icon";
import "../styles/DatasetScenarioList.css";

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "single_turn", label: "Single turn" },
  { value: "multi_turn", label: "Multi" },
  { value: "tool_use", label: "Tool" },
] as const;

// Selects a scenario while keeping its identity and saved-rule count visible.
export function DatasetScenarioList({
  scenarios,
  selectedId,
  bindings,
}: {
  scenarios: Scenario[];
  selectedId: string;
  bindings?: RuleBinding[];
}): ReactElement {
  // Narrows scenario navigation by key without changing the selected scenario.
  const [query, setQuery] = useState("");

  // Keeps the scenario type filter independent of the search query.
  const [typeFilter, setTypeFilter] =
    useState<(typeof TYPE_FILTERS)[number]["value"]>("all");

  const visibleScenarios = scenarios.filter(
    (scenario) =>
      (typeFilter === "all" || scenario.scenario_type === typeFilter) &&
      scenario.scenario_key.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <nav className="dataset-scenarios" aria-label="Scenarios">
      <div className="dataset-scenarios__heading">
        <h2>Scenarios</h2>
        <span>{scenarios.length}</span>
      </div>
      <div className="dataset-scenarios__filters">
        <label className="dataset-scenarios__search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="Search scenarios by key"
            placeholder="Search scenarios by key…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          className="dataset-scenarios__types"
          role="group"
          aria-label="Scenario type"
        >
          {TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={typeFilter === filter.value}
              onClick={() => setTypeFilter(filter.value)}
            >
              <span>{filter.label}</span>
              <span>
                (
                {
                  scenarios.filter(
                    (scenario) =>
                      filter.value === "all" ||
                      scenario.scenario_type === filter.value,
                  ).length
                }
                )
              </span>
            </button>
          ))}
        </div>
      </div>
      {visibleScenarios.length === 0 && (
        <p className="dataset-scenarios__empty">No matching scenarios.</p>
      )}
      <ul className="dataset-scenarios__list">
        {visibleScenarios.map((scenario) => {
          const count = bindings?.filter(
            (rule) => rule.scenario_id === scenario.id,
          ).length;
          return (
            <li key={scenario.id}>
              <Link
                className="dataset-scenarios__row"
                to={`?scenario=${encodeURIComponent(scenario.id)}`}
                aria-current={scenario.id === selectedId ? "true" : undefined}
              >
                <span className="dataset-scenarios__identity">
                  <span className="dataset-scenarios__name">
                    {scenario.name}
                  </span>
                  <span className="dataset-scenarios__type">
                    {scenario.scenario_type.replaceAll("_", " ")}
                  </span>
                </span>
                <span className="dataset-scenarios__field">
                  <span>Key</span>
                  <code>{scenario.scenario_key}</code>
                </span>
                <span className="dataset-scenarios__count">
                  Rules{" "}
                  <span>
                    {count === undefined ? "—" : `${count} configured`}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
