import type { ReactElement } from "react";
import { resultLabel } from "../utils/results";
import "../styles/ResultCounts.css";

// Presents supplied outcome counters as individually scannable labeled values.
export function ResultCounts({
  counts,
  compact = false,
}: {
  counts: Record<string, number>;
  compact?: boolean;
}): ReactElement {
  return (
    <dl className={`result-counts${compact ? " result-counts--compact" : ""}`}>
      {Object.entries(counts).map(([outcome, count]) => (
        <div
          key={outcome}
          className={`result-counts__item result-counts__item--${outcome}`}
          data-empty={count === 0}
        >
          <dt>{compact && outcome === "inconclusive" ? "Inconcl." : resultLabel(outcome)}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
}
