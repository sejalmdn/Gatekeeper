import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import type { Candidate, Provider } from "../types";
import { timestamp } from "../utils/format";
import { JsonViewer } from "./JsonViewer";
import { CandidatePrompt } from "./CandidatePrompt";
import { CopyButton } from "./CopyButton";
import { Icon } from "./Icon";
import "../styles/CandidateDetails.css";

// Presents a candidate's frozen prompt, tools, and generation configuration.
export function CandidateDetails({
  candidate,
  provider,
  projectId,
}: {
  candidate: Candidate;
  provider?: Provider;
  projectId: string;
}): ReactElement {
  const parameters = Object.entries(candidate.generation_parameters);

  return (
    <section className="page-content candidate-details">
      <header className="candidate-details__header">
        <div>
          <h1>{candidate.name}</h1>
          <div className="candidate-details__metadata">
            <span className="candidate-details__model">
              <span className="status-dot" aria-hidden="true" />
              {candidate.model_name}
            </span>
            <span className="candidate-details__provider">
              Provider:
              <Link
                to={`/projects/${projectId}/providers/${candidate.provider_id}`}
              >
                {provider?.name ?? "View provider"}
                <Icon name="arrow" />
              </Link>
            </span>
            <span>
              Created{" "}
              <time dateTime={candidate.created_at}>
                {timestamp(candidate.created_at)}
              </time>
            </span>
          </div>
        </div>
        <div className="candidate-details__actions">
          <Link
            className="candidate-details__back"
            to={`/projects/${projectId}/candidates`}
          >
            <Icon name="arrow" />
            Back to candidates
          </Link>
          <Link
            className="button"
            to={`/projects/${projectId}/evaluation-runs/new?candidate=${candidate.id}`}
          >
            <Icon name="evaluation" />
            Run Evaluation
          </Link>
        </div>
      </header>

      <CandidatePrompt prompt={candidate.system_prompt} />

      <div className="candidate-details__columns">
        <section className="candidate-details__panel candidate-details__tools">
          <header className="candidate-details__panel-header">
            <div className="candidate-details__panel-title">
              <Icon name="config" />
              <h2>Tool definitions</h2>
              <span className="candidate-details__count candidate-details__count--tools">
                {candidate.tool_definitions.length} configured
              </span>
            </div>
            {candidate.tool_definitions.length > 0 && (
              <CopyButton
                value={JSON.stringify(candidate.tool_definitions, null, 2)}
                label="Copy tool definitions"
              >
                Copy schema
              </CopyButton>
            )}
          </header>
          {candidate.tool_definitions.length === 0 && (
            <p className="candidate-details__empty">No tools configured.</p>
          )}
          {candidate.tool_definitions.map((tool) => (
            <details className="candidate-details__tool" key={tool.name}>
              <summary>
                <Icon name="chevron" />
                <h3>
                  {tool.name}
                  <span>function</span>
                </h3>
              </summary>
              <JsonViewer value={tool} label={`${tool.name} definition`} />
            </details>
          ))}
        </section>

        <div className="candidate-details__settings">
          <section className="candidate-details__panel">
            <header className="candidate-details__panel-header">
              <div className="candidate-details__panel-title">
                <Icon name="config" />
                <h2>Generation parameters</h2>
              </div>
              <span className="candidate-details__caption">JSON config</span>
            </header>
            {parameters.length > 0 && (
              <dl className="candidate-details__parameters">
                {parameters.map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd
                      className={
                        value === null
                          ? "candidate-details__unspecified"
                          : undefined
                      }
                    >
                      {JSON.stringify(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {parameters.length === 0 && (
              <p className="candidate-details__empty">
                No generation overrides configured.
              </p>
            )}
            <JsonViewer
              value={candidate.generation_parameters}
              label="Generation parameters JSON"
            />
          </section>

          {candidate.response_format && (
            <section className="candidate-details__panel">
              <header className="candidate-details__panel-header">
                <div className="candidate-details__panel-title">
                  <Icon name="config" />
                  <h2>Response format</h2>
                </div>
              </header>
              <JsonViewer
                value={candidate.response_format}
                label="Response format JSON"
              />
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
