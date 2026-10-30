import type { ComparisonSide, ComparisonDifferences } from "../types";
import {
  comparisonDelta,
  comparisonDirection,
  comparisonMetricDirection,
  comparisonRate,
  comparisonValue,
} from "../utils/comparison";

// Provides a five-metric scan of the common-rule and operational comparison.
export function ComparisonSummary({
  a,
  b,
  delta,
}: {
  a: ComparisonSide;
  b: ComparisonSide;
  delta: ComparisonDifferences;
}) {
  const cards = [
    {
      label: "Common pass rate",
      lowerIsBetter: false,
      a: comparisonRate(a.pass_rate),
      b: comparisonRate(b.pass_rate),
      change: delta.pass_rate_pp,
      delta: comparisonDelta(delta.pass_rate_pp),
      note: `${a.attempts.passing_attempts}/${a.attempts.planned_attempts} → ${b.attempts.passing_attempts}/${b.attempts.planned_attempts} planned attempts`,
    },
    {
      label: "Weighted score",
      lowerIsBetter: false,
      a: comparisonRate(a.score.weighted_score),
      b: comparisonRate(b.score.weighted_score),
      change: delta.weighted_score_pp,
      delta: comparisonDelta(delta.weighted_score_pp),
      note: "Common scored rules",
    },
    {
      label: "Mean latency",
      lowerIsBetter: true,
      a: comparisonValue(a.metrics.latency_ms.mean),
      b: comparisonValue(b.metrics.latency_ms.mean),
      change: delta.metrics.latency_ms?.mean,
      delta: `${comparisonValue(delta.metrics.latency_ms?.mean)} ms`,
      note: "Milliseconds",
    },
    {
      label: "Mean tokens",
      lowerIsBetter: true,
      a: comparisonValue(a.metrics.total_tokens.mean),
      b: comparisonValue(b.metrics.total_tokens.mean),
      change: delta.metrics.total_tokens?.mean,
      delta: comparisonValue(delta.metrics.total_tokens?.mean),
      note: "Input + output per invocation",
    },
    {
      label: "Est. cost (USD)",
      lowerIsBetter: true,
      a: comparisonValue(a.metrics.estimated_cost_usd?.sum),
      b: comparisonValue(b.metrics.estimated_cost_usd?.sum),
      change: delta.metrics.estimated_cost_usd?.sum,
      delta: comparisonValue(delta.metrics.estimated_cost_usd?.sum),
      note: "Sum of known saved estimates",
    },
  ];

  return (
    <div className="comparison-summary">
      {cards.map((card) => (
        <article className="comparison-summary__card" key={card.label}>
          <header>
            <h3>{card.label}</h3>
          </header>
          <strong
            className={`comparison-summary__value--${card.lowerIsBetter ? comparisonMetricDirection(card.change) : comparisonDirection(card.change)}`}
          >
            {card.b}{" "}
            {(card.change == null ||
              comparisonDirection(card.change) !== "neutral") && (
              <span className="comparison-summary__change" title="B − A">
                (
                {comparisonDirection(card.change) === "positive" &&
                  !card.delta.startsWith("+") &&
                  "+"}
                {card.delta})
              </span>
            )}
          </strong>
          <p>
            A: {card.a} <span aria-hidden="true">→</span> B: {card.b}
          </p>
          <small>{card.note}</small>
        </article>
      ))}
    </div>
  );
}
