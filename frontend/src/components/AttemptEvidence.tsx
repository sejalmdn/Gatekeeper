import type { ReactElement } from "react";
import { getExecutionAttempt } from "../api";
import { useLoad } from "../hooks/useLoad";
import { formatNumber, formatUsd } from "../utils/format";
import { LoadBoundary } from "./Feedback";
import { JsonViewer } from "./JsonViewer";

// Reveals one attempt's observations and readable transport artifacts on demand.
export function AttemptEvidence({
  projectId,
  runId,
  executionId,
}: {
  projectId: string;
  runId: string;
  executionId: string;
}): ReactElement {
  // Loads large artifacts only for the opened attempt.
  const state = useLoad(() =>
    getExecutionAttempt(projectId, runId, executionId),
  );

  return (
    <LoadBoundary state={state}>
      {({ evidence, request, response, error, cost }) => (
        <div className="attempt-evidence__evidence">
          {error && (
            <p role="alert">
              {error.message}{" "}
              <code>
                {error.source}/{error.code}
              </code>
            </p>
          )}
          {!evidence && (
            <p>No provider evidence has been collected for this attempt.</p>
          )}
          {evidence && (
            <>
              <dl className="attempt-evidence__metrics">
                <div>
                  <dt>Request duration</dt>
                  <dd>
                    {evidence.duration_ms === null
                      ? "Unavailable"
                      : `${formatNumber(evidence.duration_ms)} ms`}
                  </dd>
                </div>
                <div>
                  <dt>Input tokens</dt>
                  <dd>{evidence.input_tokens ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Output tokens</dt>
                  <dd>{evidence.output_tokens ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Finish reason</dt>
                  <dd>{evidence.finish_reason ?? "Unavailable"}</dd>
                </div>
              </dl>
              <h3>Estimated standard-rate cost (USD)</h3>
              <p>{formatUsd(cost?.estimated_usd)}</p>
              {cost?.reason && <p>{cost.reason.replaceAll("_", " ")}</p>}
              <p>
                Input: {formatUsd(cost?.input_usd)} · Output:{" "}
                {formatUsd(cost?.output_usd)}
              </p>
              <p>
                Provider-reported charge (USD):{" "}
                {formatUsd(evidence.provider_reported_usd)}
              </p>
              <p>
                Excludes cache discounts, account discounts, taxes, and fees.
              </p>
              {cost?.pricing_entry && (
                <JsonViewer
                  value={cost}
                  label="Saved cost calculation and pricing"
                />
              )}
              <h3>Response</h3>
              <pre className="attempt-evidence__response">
                {evidence.response_text ?? "No response text was produced."}
              </pre>
              {evidence.refusal !== null && <p>Refusal: {evidence.refusal}</p>}
              <h3>Requested tools</h3>
              {evidence.tool_requests === null && (
                <p>Tool request evidence is unavailable.</p>
              )}
              {evidence.tool_requests?.length === 0 && (
                <p>No tools were requested.</p>
              )}
              {evidence.tool_requests?.map((tool, index) => (
                <article
                  className="attempt-evidence__tool"
                  key={`${tool.call_id}-${index}`}
                >
                  <h4>{tool.name ?? "Unknown tool"}</h4>
                  <p>Requested only · tool was not executed</p>
                  {tool.arguments !== null ? (
                    <JsonViewer
                      value={tool.arguments}
                      label={`Tool arguments ${index + 1}`}
                    />
                  ) : (
                    <pre className="attempt-evidence__response">
                      {tool.arguments_text}
                    </pre>
                  )}
                  {tool.issues.length > 0 && <p>{tool.issues.join(" · ")}</p>}
                </article>
              ))}
            </>
          )}
          {request !== null && (
            <details>
              <summary>Provider request</summary>
              <JsonViewer value={request} label="Provider request JSON" />
            </details>
          )}
          {response !== null && (
            <details>
              <summary>Provider response</summary>
              <JsonViewer value={response} label="Provider response JSON" />
            </details>
          )}
        </div>
      )}
    </LoadBoundary>
  );
}
