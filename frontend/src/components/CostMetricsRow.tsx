import type { CostStatistics } from "../types";
import { formatUsd } from "../utils/format";
import "../styles/CostMetricsRow.css";

// Shows cost coverage and decimal statistics alongside other operational metrics.
export function CostMetricsRow({
  cost,
  showDot = false,
}: {
  cost?: CostStatistics | null;
  showDot?: boolean;
}) {
  return (
    <tr>
      <th scope="row">
        {showDot && (
          <span className="cost-metrics-row__dot" aria-hidden="true">
            ●{" "}
          </span>
        )}
        Estimated cost (USD)
      </th>
      <td>{cost?.observed_count ?? "Unavailable"}</td>
      <td>{formatUsd(cost?.minimum)}</td>
      <td>{formatUsd(cost?.maximum)}</td>
      <td>{formatUsd(cost?.mean)}</td>
      <td title="Sum of known estimates; missing costs are excluded">
        {formatUsd(cost?.sum)}
      </td>
    </tr>
  );
}
