import type { ReactElement } from "react";
import type { JudgeRecord } from "../types";
import { formatNumber, formatUsd, timestamp } from "../utils/format";
import { judgeFailureMessage } from "../utils/rubrics";
import { ResultBadge } from "./ResultBadge";
import "../styles/JudgeDetails.css";

// Separates saved judge provenance and usage from candidate execution metrics.
export function JudgeDetails({ judge }: { judge: JudgeRecord }): ReactElement {
  const failure = judgeFailureMessage(judge.reason);
  const observations = [
    ["Requested model", judge.requested_model],
    ["Requested provider", judge.requested_provider],
    ["Reported model", judge.reported_model ?? "Unavailable"],
    ["Reported provider", judge.reported_provider ?? "Unavailable"],
    ["Prompt version", judge.configuration.prompt_version],
    ["Started", judge.started_at ? timestamp(judge.started_at) : "Unavailable"],
    [
      "Completed",
      judge.completed_at ? timestamp(judge.completed_at) : "Unavailable",
    ],
    ["Judge duration (ms)", formatNumber(judge.latency_ms)],
    ["Judge input tokens", formatNumber(judge.input_tokens)],
    ["Judge output tokens", formatNumber(judge.output_tokens)],
    ["Judge estimated cost (USD)", formatUsd(judge.estimated_usd)],
    [
      "Judge provider-reported charge (USD)",
      formatUsd(judge.provider_reported_usd),
    ],
  ];

  return (
    <section className="judge-details" aria-label="Semantic judge">
      <div className="judge-details__heading">
        <h3>Semantic judge</h3>
        <ResultBadge outcome={judge.outcome} />
      </div>
      {judge.reason && (
        <p>
          {failure ?? "Semantic grading could not complete."} Reason:{" "}
          <code>{judge.reason}</code>
        </p>
      )}
      <p>
        Judge observations are separate from candidate latency, tokens, and
        costs.
      </p>
      <details>
        <summary>Judge details</summary>
        <dl className="judge-details__observations">
          {observations.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
