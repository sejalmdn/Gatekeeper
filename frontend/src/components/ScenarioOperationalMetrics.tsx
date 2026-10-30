import { CostMetricsRow } from "./CostMetricsRow";
import type { ReactElement } from "react";
import type { OperationalMetrics } from "../types";
import { formatNumber } from "../utils/format";
import "../styles/ScenarioOperationalMetrics.css";

// Keeps completed-invocation statistics and observed counts visible.
export function ScenarioOperationalMetrics({
  metrics,
}: {
  metrics: OperationalMetrics;
}): ReactElement {
  const fields = [
    { key: "latency_ms", label: "Latency (ms)" },
    { key: "input_tokens", label: "Input tokens" },
    { key: "output_tokens", label: "Output tokens" },
    { key: "total_tokens", label: "Total tokens" },
  ] as const;
  return (
    <section
      className="scenario-operational-metrics"
      aria-label="Scenario operational metrics"
    >
      <header>
        <div>
          <h4>Operational metrics breakdown</h4>
          <p>
            Statistics across {metrics.completed_invocations} completed
            invocations
          </p>
        </div>
        <span>
          Mean runtime:{" "}
          {metrics.latency_ms.mean === null
            ? "Unavailable"
            : `${formatNumber(metrics.latency_ms.mean)} ms`}
        </span>
      </header>
      <div
        className="scenario-operational-metrics__table"
        tabIndex={0}
        role="region"
        aria-label="Metric statistics"
      >
        <table>
          <caption>Statistics from completed invocations only</caption>
          <thead>
            <tr>
              {["Metric", "Observed", "Min", "Max", "Mean", "Sum"].map(
                (label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {fields.map(({ key, label }) => {
              const metric = metrics[key];
              return (
                <tr key={key}>
                  <th scope="row">
                    <span
                      className={`scenario-operational-metrics__dot scenario-operational-metrics__dot--${key}`}
                      aria-hidden="true"
                    >
                      ●{" "}
                    </span>
                    {label}
                  </th>
                  <td>{metric.observed_count}</td>
                  <td>{formatNumber(metric.minimum)}</td>
                  <td>{formatNumber(metric.maximum)}</td>
                  <td className="scenario-operational-metrics__mean">
                    {formatNumber(metric.mean)}
                  </td>
                  <td>{formatNumber(metric.sum)}</td>
                </tr>
              );
            })}
            <CostMetricsRow cost={metrics.estimated_cost_usd} showDot />
          </tbody>
        </table>
      </div>
    </section>
  );
}
