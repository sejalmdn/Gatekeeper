import type { ReactElement } from "react";
import type { WeightedScore } from "../types";
import { formatNumber } from "../utils/format";
import { percent, resultLabel } from "../utils/results";
import "../styles/ResultScore.css";

// Displays backend score and coverage without treating either as a required-check verdict.
export function ResultScore({
  score,
  compact = false,
}: {
  score: WeightedScore;
  compact?: boolean;
}): ReactElement {
  return (
    <div className={`result-score${compact ? " result-score--compact" : ""}`}>
      <p className="result-score__value">
        <span>Weighted score</span>
        <strong>{percent(score.weighted_score)}</strong>
      </p>
      <p className={`result-score__coverage${compact ? "" : " result-score__coverage--summary"}`}>
        <span>Coverage{compact ? "" : ":"}</span>{" "}
        <span>
          {percent(score.coverage)}
        </span>
      </p>
      {score.reason && score.reason !== "no_scored_rules" && (
        <p className="result-score__reason">
          {compact && score.reason === "incomplete_scored_results" && (
            <span aria-hidden="true">⚠ </span>
          )}
          {resultLabel(score.reason)} {!compact && <code>{score.reason}</code>}
        </p>
      )}
    </div>
  );
}
