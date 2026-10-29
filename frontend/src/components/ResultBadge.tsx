import type { ReactElement } from "react";
import { resultLabel } from "../utils/results";
import "../styles/ResultBadge.css";

// Identifies assessments and grading outcomes with both a symbol and an explicit label.
export function ResultBadge({
  outcome,
  prefix,
}: {
  outcome: string;
  prefix?: string;
}): ReactElement {
  const symbols: Record<string, string> = {
    met: "✓",
    pass: "✓",
    not_met: "×",
    fail: "×",
    pending: "○",
    not_evaluated: "○",
    error: "!",
  };
  return (
    <span className={`result-badge result-badge--${outcome}`}>
      <span aria-hidden="true">{symbols[outcome] ?? "?"}</span>
      {prefix && `${prefix}: `}
      {resultLabel(outcome)}
    </span>
  );
}
