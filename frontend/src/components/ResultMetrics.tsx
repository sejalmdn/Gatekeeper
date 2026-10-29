import type { ReactElement } from "react";
import type { OperationalMetrics } from "../types";
import { formatNumber } from "../utils/format";
import "../styles/ResultMetrics.css";

// Shows supplied metric statistics, missing observations, and explicit exclusions.
export function ResultMetrics({
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
    <section className="result-metrics" aria-label="Operational metrics">
      <h3>Operational metrics</h3>
      <dl className="result-metrics__means">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <dt>{label} · mean</dt>
            <dd>{formatNumber(metrics[key].mean)}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Metric observations and exclusions</summary>
        <p>
          Completed invocations: {metrics.completed_invocations}. Excluded
          attempts: {metrics.excluded_unsuccessful_attempts} unsuccessful,{" "}
          {metrics.excluded_unexecuted_attempts} unexecuted,{" "}
          {metrics.excluded_in_progress_attempts} in progress.
        </p>
        <div className="result-metrics__table">
          <table>
            <caption>Statistics from completed invocations only</caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Observed</th>
                <th scope="col">Missing</th>
                <th scope="col">Minimum</th>
                <th scope="col">Maximum</th>
                <th scope="col">Mean</th>
                <th scope="col">Sum</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(({ key, label }) => {
                const metric = metrics[key];
                return (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{metric.observed_count}</td>
                    <td>{metric.missing_count}</td>
                    <td>{formatNumber(metric.minimum)}</td>
                    <td>{formatNumber(metric.maximum)}</td>
                    <td>{formatNumber(metric.mean)}</td>
                    <td>{formatNumber(metric.sum)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
