import type { ReactElement } from "react";
import { getExecutionAttempt } from "../api";
import { useLoad } from "../hooks/useLoad";
import { formatNumber } from "../utils/format";
import { LoadBoundary } from "./Feedback";
import { JsonViewer } from "./JsonViewer";

// Shows the selected response and tool requests with one technical detail area.
export function AttemptEvidence({
  projectId, runId, executionId,
}: {
  projectId: string;
  runId: string;
  executionId: string;
}): ReactElement {
  // Loads provider artifacts only for the selected attempt.
  const state = useLoad(() => getExecutionAttempt(projectId, runId, executionId));

  return (
    <LoadBoundary state={state}>
      {({ evidence, request, response, error }) => (
        <div className="attempt-evidence__evidence">
          {error && <p role="alert">{error.message}</p>}
          {!evidence && <p>No provider evidence has been collected for this attempt.</p>}
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
          <details className="attempt-evidence__technical">
            <summary>Technical details</summary>
            <p>Execution ID: <code>{executionId}</code></p>
            {error && <p>Error: {error.source} / <code>{error.code}</code></p>}
            {evidence && (
              <>
                <p>Source: {evidence.source.replaceAll("_", " ")}</p>
                <p>Model: {evidence.returned_model ?? evidence.requested_model}</p>
                <p>Finish reason: {evidence.finish_reason ?? "Unavailable"}</p>
                {evidence.refusal !== null && <p>Refusal: {evidence.refusal}</p>}
                <p>Provider charge: {formatUsd(evidence.provider_reported_usd)}</p>
                <p>Input cost: {formatUsd(cost?.input_usd)} · Output cost: {formatUsd(cost?.output_usd)}</p>
                {cost?.reason && <p>Cost reason: {cost.reason.replaceAll("_", " ")}</p>}
                {cost?.pricing_entry && <JsonViewer value={cost} label="Saved cost calculation and pricing" />}
                {evidence.completeness_issues.length > 0 && <p>Missing evidence: {evidence.completeness_issues.join(", ")}</p>}
              </>
            )}
            {request !== null && <JsonViewer value={request} label="Provider request JSON" />}
            {response !== null && <JsonViewer value={response} label="Provider response JSON" />}
          </details>
        </div>
      )}
    </LoadBoundary>
  );
}
