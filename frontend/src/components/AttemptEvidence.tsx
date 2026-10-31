import type { ReactElement } from "react";
import { getExecutionAttempt } from "../api";
import { useLoad } from "../hooks/useLoad";
import { formatNumber } from "../utils/format";
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
      {({ evidence, request, response, error }) => (
        <div className="attempt-evidence__evidence">
          {error && (
            <div className="attempt-evidence__error" role="alert">
              <p>{error.message}</p>
              <code>{error.source}/{error.code}</code>
            </div>
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
              <section className="attempt-evidence__response-section">
              <h3>Response</h3>
              <pre className="attempt-evidence__response">
                {evidence.response_text ?? "No response text was produced."}
              </pre>
              {evidence.refusal !== null && <p>Refusal: {evidence.refusal}</p>}
              </section>
              <section className="attempt-evidence__tools-section">
              <h3>Requested tools</h3>
              {evidence.tool_requests === null && (
                <p className="attempt-evidence__tools-empty">Tool request evidence is unavailable.</p>
              )}
              {evidence.tool_requests?.length === 0 && (
                <p className="attempt-evidence__tools-empty">No tools were requested.</p>
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
              </section>
            </>
          )}
          {request !== null && (
            <details className="scenario-results__technical">
              <summary>Provider request</summary>
              <JsonViewer value={request} label="Provider request JSON" />
            </details>
          )}
          {response !== null && (
            <details className="scenario-results__technical">
              <summary>Provider response</summary>
              <JsonViewer value={response} label="Provider response JSON" />
            </details>
          )}
        </div>
      )}
    </LoadBoundary>
  );
}
