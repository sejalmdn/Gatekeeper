import { CostMetricsRow } from "./CostMetricsRow";
import type { ReactElement } from "react";
import type { OperationalMetrics } from "../types";
import { formatNumber, formatUsd } from "../utils/format";
import { Icon } from "./Icon";
import "../styles/ResultMetrics.css";

// Shows supplied metric statistics and explicit exclusions.
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
      <header className="result-metrics__header">
        <div>
          <h3>Operational &amp; inference metrics</h3>
          <p>Statistical distributions aggregated across completed invocations.</p>
        </div>
        <span className="result-metrics__cost-note">
          <Icon name="info" /> Excludes discounts, taxes, and fees
        </span>
      </header>
      <dl className="result-metrics__means">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <dt>{label}{key === "latency_ms" ? "" : " (mean)"}</dt>
            <dd>
              {formatNumber(metrics[key].mean)}
              {key === "latency_ms" && <span> ms</span>}
            </dd>
          </div>
        ))}
        <div>
          <dt>Total cost (USD)</dt>
          <dd>{formatUsd(metrics.estimated_cost_usd?.sum)}</dd>
        </div>
      </dl>
      <details className="result-metrics__details">
        <summary>
          <span className="result-metrics__details-title">
            <Icon name="chevron" /> Metric observations and exclusions
          </span>
          <span className="result-metrics__details-toggle">
            <span className="result-metrics__expand">Click to expand</span>
            <span className="result-metrics__collapse">Click to collapse</span>
          </span>
        </summary>
        <div className="result-metrics__details-body">
          <div className="result-metrics__status-pills">
            <div><span className="result-metrics__dot" />Completed invocations: <strong>{metrics.completed_invocations}</strong></div>
            <div><span className="result-metrics__dot result-metrics__dot--muted" />Excluded attempts: <span>{metrics.excluded_unsuccessful_attempts} unsuccessful, {metrics.excluded_unexecuted_attempts} unexecuted, {metrics.excluded_in_progress_attempts} in progress</span></div>
          </div>
          <div className="result-metrics__table-section">
            <p className="result-metrics__table-caption">Statistics from completed invocations only</p>
            <div className="result-metrics__table">
          <table>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Observed</th>
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
                    <td>{formatNumber(metric.minimum)}</td>
                    <td>{formatNumber(metric.maximum)}</td>
                    <td>{formatNumber(metric.mean)}</td>
                    <td>{formatNumber(metric.sum)}</td>
                  </tr>
                );
              })}
              <CostMetricsRow cost={metrics.estimated_cost_usd} />
            </tbody>
              </table>
            </div>
          </div>
          <div className="result-metrics__footer">
            <p>Cost estimation excludes cache and account discounts, taxes, and service fees. Total cost sums known standard-rate estimates; missing costs are excluded.</p>
          </div>
        </div>
      </details>
    </section>
  );
}
