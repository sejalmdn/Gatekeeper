import { useState } from "react";
import type { RunComparison } from "../types";
import { comparisonRate } from "../utils/comparison";
import { ComparisonScenario } from "./ComparisonScenario";
import { ComparisonStatistics } from "./ComparisonStatistics";
import { ComparisonSummary } from "./ComparisonSummary";

// Organizes aggregate benchmarks and an accordion of scenario comparisons.
export function ComparisonResults({ data }: { data: RunComparison }) {
  // Filters scenarios by numerical rate differences without assigning regression labels.
  const [filter, setFilter] = useState("all");

  const filters = [
    { key: "all", label: "All scenarios" },
    { key: "changed", label: "Changed rates" },
    { key: "same", label: "Same rates" },
    { key: "unavailable", label: "Unavailable" },
  ];
  const matches = (value: number | null, key: string) => {
    if (key === "changed") return value !== null && value !== 0;
    if (key === "same") return value === 0;
    if (key === "unavailable") return value === null;
    return true;
  };
  const scenarios = data.scenarios.filter((scenario) =>
    matches(scenario.differences.pass_rate_pp, filter),
  );

  if (data.availability === "unavailable") {
    return (
      <div className="run-comparison__notice" role="status">
        Historical comparison unavailable: {data.reason?.replaceAll("_", " ")}.
        Frozen inputs cannot be reconstructed.
      </div>
    );
  }

  return (
    <div className="comparison-results">
      {data.aggregate_a && data.aggregate_b && data.differences && (
        <>
          <ComparisonSummary
            a={data.aggregate_a}
            b={data.aggregate_b}
            delta={data.differences}
          />
          <ComparisonStatistics
            a={data.aggregate_a}
            b={data.aggregate_b}
            delta={data.differences}
          />
          <details className="comparison-results__coverage">
            <summary>Common-rule coverage &amp; calculation details</summary>
            <p>
              Pass rates use planned attempts and only common required rules
              plus saved automatic tool checks. Exclusive rules are excluded.
              Thresholds are context only.
            </p>
            {[data.aggregate_a, data.aggregate_b].map((side, index) => (
              <div key={index}>
                <h3>Run {index === 0 ? "A" : "B"}</h3>
                <p>
                  {side.included_scenarios} scenarios included;{" "}
                  {side.excluded_scenarios} excluded from common-required rates.{" "}
                  {side.reason?.replaceAll("_", " ")}
                </p>
                <p>
                  Scored coverage: {comparisonRate(side.score.coverage)} ·{" "}
                  {side.score.reason?.replaceAll("_", " ")}
                </p>
                <p>
                  {Object.entries(side.attempts.evaluation_verdict_counts)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ")}
                </p>
              </div>
            ))}
          </details>
        </>
      )}
      <header className="comparison-results__heading">
        <div>
          <h2>Scenario comparison</h2>
          <p>Common rules, pass-rate differences, and operational evidence.</p>
        </div>
        <div
          className="comparison-results__filters"
          aria-label="Filter scenarios"
        >
          {filters.map((item) => (
            <button
              type="button"
              key={item.key}
              aria-pressed={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}{" "}
              <span>
                {
                  data.scenarios.filter((scenario) =>
                    matches(scenario.differences.pass_rate_pp, item.key),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
      </header>
      <div className="comparison-results__scenarios">
        {scenarios.length === 0 && (
          <p className="run-comparison__notice">
            No scenarios match this filter. Choose All scenarios to see the full
            comparison.
          </p>
        )}
        {scenarios.map((scenario) => (
          <ComparisonScenario key={scenario.scenario_id} scenario={scenario} />
        ))}
      </div>
      <footer className="comparison-results__footer">
        B − A throughout · Independent repeats · Numerical differences only
      </footer>
    </div>
  );
}
