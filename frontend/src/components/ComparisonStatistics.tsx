import { useState } from "react";
import type { ComparisonSide, ComparisonDifferences } from "../types";
import {
  comparisonMetricDirection,
  comparisonValue,
} from "../utils/comparison";

// Compares completed-invocation metrics with switchable means and full observation statistics.
export function ComparisonStatistics({
  a,
  b,
  delta,
  summaryOnly = false,
}: {
  a: ComparisonSide;
  b: ComparisonSide;
  delta: ComparisonDifferences;
  summaryOnly?: boolean;
}) {
  // Keeps the default metric view compact while allowing inspection of every saved statistic.
  const [full, setFull] = useState(false);

  const metrics = [
    { key: "latency_ms", label: "Latency", unit: "ms" },
    { key: "input_tokens", label: "Input tokens", unit: "" },
    { key: "output_tokens", label: "Output tokens", unit: "" },
    { key: "total_tokens", label: "Total tokens", unit: "" },
    { key: "estimated_cost_usd", label: "Estimated cost", unit: "USD" },
  ] as const;
  const statistics =
    full && !summaryOnly
      ? (["minimum", "maximum", "mean", "sum"] as const)
      : (["mean"] as const);

  return (
    <section className="comparison-statistics" aria-label="Operational metrics">
      <header className="comparison-statistics__header">
        <div>
          <h2>Operational benchmarks</h2>
          <p>Completed invocations · saved observations</p>
        </div>
        {!summaryOnly && (
          <div
            className="comparison-statistics__switch"
            aria-label="Metric statistics"
          >
            <button
              type="button"
              aria-pressed={!full}
              onClick={() => setFull(false)}
            >
              Summary means
            </button>
            <button
              type="button"
              aria-pressed={full}
              onClick={() => setFull(true)}
            >
              All observations
            </button>
          </div>
        )}
      </header>
      <div className="comparison-statistics__scroll">
        <table className="comparison-statistics__table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Run A</th>
              <th scope="col">Run B</th>
              <th scope="col">Delta (B − A)</th>
            </tr>
          </thead>
          <tbody>
            {metrics.flatMap(({ key, label, unit }) =>
              statistics.map((statistic) => (
                <tr key={`${key}-${statistic}`}>
                  <th scope="row">
                    {label}{" "}
                    <span>
                      ({statistic === "sum" ? "sum of known" : statistic})
                    </span>
                  </th>
                  <td>
                    {comparisonValue(a.metrics[key]?.[statistic])}{" "}
                    {unit && <small>{unit}</small>}
                  </td>
                  <td>
                    {comparisonValue(b.metrics[key]?.[statistic])}{" "}
                    {unit && <small>{unit}</small>}
                  </td>
                  <td>
                    <span
                      className={`comparison-statistics__delta comparison-statistics__delta--${summaryOnly ? comparisonMetricDirection(delta.metrics[key]?.[statistic]) : "neutral"}`}
                    >
                      {comparisonValue(delta.metrics[key]?.[statistic])}{" "}
                      {unit && <small>{unit}</small>}
                    </span>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
