import { useState, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createCandidate,
  getCandidate,
  listCandidates,
  listProviders,
} from "../api";
import { LoadBoundary } from "../components/Feedback";
import { JsonInput, SourceSelect } from "../components/FormFields";
import { JsonBlock } from "../components/RecordData";
import { RecordDetails } from "../components/RecordDetails";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { CandidateTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import type { ToolDefinition } from "../types";
import { messageFor, parseArray, parseObject } from "../utils/format";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Candidate list page.
export function CandidatesPage(): ReactElement {
  const { projectId = "" } = useParams();
  const state = useLoad(() => listCandidates(projectId));
  return (
    <RecordList
      title="Candidates"
      detail="Models and agents configured for evaluation."
      action="Create candidate"
      actionPath="new"
      state={state}
      projectId={projectId}
      render={(items) => (
        <CandidateTable candidates={items} projectId={projectId} />
      )}
      kind="candidate"
    />
  );
}

// Create a candidate tied to a provider in this project.
export function CandidateForm(): ReactElement {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const providers = useLoad(() => listProviders(projectId));
  const [providerId, setProviderId] = useState("");
  const [name, setName] = useState("");
  const [modelName, setModelName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [parameters, setParameters] = useState("{}");
  const [tools, setTools] = useState("[]");
  const [responseFormat, setResponseFormat] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Validate structured fields and persist the candidate.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const candidate = await createCandidate(projectId, {
        provider_id: providerId,
        name,
        model_name: modelName,
        system_prompt: systemPrompt,
        generation_parameters: parseObject(parameters, "Generation parameters"),
        tool_definitions: parseArray(
          tools,
          "Tool definitions",
        ) as ToolDefinition[],
        response_format: responseFormat.trim()
          ? parseObject(responseFormat, "Response format")
          : null,
      });
      navigate(`/projects/${projectId}/candidates/${candidate.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <LoadBoundary state={providers}>
      {(items) =>
        items.length === 0 ? (
          <section className="page-content">
            <div className="empty-state">
              <h2>Add a provider first</h2>
              <p>A candidate needs a provider from this project.</p>
              <Link
                className="button"
                to={`/projects/${projectId}/providers/new`}
              >
                Create provider
              </Link>
            </div>
          </section>
        ) : (
          <RecordForm
            title="Create candidate"
            detail="Configure the model or agent Gatekeeper will evaluate."
            submitLabel="Create candidate"
            error={error}
            saving={saving}
            onSubmit={submit}
            onCancel={() => navigate(`/projects/${projectId}/candidates`)}
          >
            <SourceSelect
              id="candidate-provider"
              label="Provider"
              value={providerId}
              onChange={setProviderId}
              placeholder="Select a provider"
              options={items.map((provider) => ({
                id: provider.id,
                label: `${provider.name} · ${provider.provider_type}`,
              }))}
            />
            <div className="form-row">
              <TextField
                id="candidate-name"
                label="Name"
                value={name}
                onChange={setName}
                placeholder="Support baseline"
              />
            </div>
            <TextField
              id="model-name"
              label="Model name"
              value={modelName}
              onChange={setModelName}
              placeholder="model-or-agent-id"
            />
            <label className="form-field" htmlFor="system-prompt">
              <span>System prompt</span>
              <textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="You are a concise customer support assistant."
              />
            </label>
            <JsonInput
              id="generation-parameters"
              label="Generation parameters"
              help="A JSON object of provider-neutral generation settings."
              value={parameters}
              onChange={setParameters}
            />
            <JsonInput
              id="tool-definitions"
              label="Tool definitions"
              help="A JSON array of name, optional description, and parameters objects."
              value={tools}
              onChange={setTools}
            />
            <JsonInput
              id="response-format"
              label="Response format (optional)"
              help="Leave blank when the candidate does not require a structured response."
              value={responseFormat}
              onChange={setResponseFormat}
              placeholder='{"type":"json_object"}'
              required={false}
            />
          </RecordForm>
        )
      }
    </LoadBoundary>
  );
}

// Candidate detail page.
export function CandidateDetail(): ReactElement {
  const { projectId = "", recordId = "" } = useParams();
  const state = useLoad(() => getCandidate(projectId, recordId));
  return (
    <LoadBoundary state={state}>
      {(candidate) => (
        <RecordDetails
          title={candidate.name}
          detail={candidate.model_name}
          backTo={`/projects/${projectId}/candidates`}
          backLabel="Back to candidates"
          createdAt={candidate.created_at}
        >
          <section className="detail-section detail-grid">
            <div>
              <h2>Provider</h2>
              <p>
                <Link
                  to={`/projects/${projectId}/providers/${candidate.provider_id}`}
                >
                  View provider
                </Link>
              </p>
            </div>
            <div>
              <h2>System prompt</h2>
              <p>{candidate.system_prompt || "None"}</p>
            </div>
          </section>
          <section className="detail-section">
            <h2>Generation parameters</h2>
            <JsonBlock value={candidate.generation_parameters} />
          </section>
          <section className="detail-section">
            <h2>Tool definitions</h2>
            <JsonBlock value={candidate.tool_definitions} />
          </section>
          {candidate.response_format && (
            <section className="detail-section">
              <h2>Response format</h2>
              <JsonBlock value={candidate.response_format} />
            </section>
          )}
        </RecordDetails>
      )}
    </LoadBoundary>
  );
}

// Small text input shared within candidate creation.
function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: TextFieldProps): ReactElement {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
      />
    </label>
  );
}
