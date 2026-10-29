import type { ReactElement } from "react";
import { resultLabel } from "../utils/results";
import "../styles/ResultCounts.css";

// Presents supplied outcome counters as individually scannable labeled values.
export function ResultCounts({
  counts,
}: {
  counts: Record<string, number>;
}): ReactElement {
  return (
    <dl className="result-counts">
      {Object.entries(counts).map(([outcome, count]) => (
        <div
          key={outcome}
          className={`result-counts__item result-counts__item--${outcome}`}
          data-empty={count === 0}
        >
          <dt>{resultLabel(outcome)}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
}
