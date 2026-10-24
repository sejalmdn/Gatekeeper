import { useState, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createCandidate, listCandidates, listProviders } from "../api";
import { LoadBoundary } from "../components/Feedback";
import { JsonInput, SourceSelect } from "../components/FormFields";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { CandidateTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import type { ToolDefinition } from "../types";
import { messageFor, parseArray, parseObject } from "../utils/format";
import { CandidateDetailContent } from "./CandidateDetailContent";

// Shows the shared tool format without enabling a tool until the user adds it.
const sampleTool: ToolDefinition = {
  name: "get_weather",
  description: "Get weather for a city",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
      },
    },
    required: ["city"],
  },
};
const toolPlaceholder = JSON.stringify([sampleTool], null, 2);

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
  // Starts with editable limits while leaving model-specific sampling defaults unspecified.
  const [parameters, setParameters] = useState(
    JSON.stringify(
      {
        temperature: null,
        top_p: null,
        top_k: null,
        max_output_tokens: 1024,
      },
      null,
      2,
    ),
  );
  // Leaves tools optional and displays the example until the user starts editing.
  const [tools, setTools] = useState("");

  // Selects the output mode independently from the editable schema configuration.
  const [responseType, setResponseType] = useState("text");

  // Preserves schema edits when switching between output modes.
  const [responseSchema, setResponseSchema] = useState(
    JSON.stringify(
      {
        name: "answer",
        strict: true,
        schema: {
          type: "object",
          properties: {
            answer: {
              type: "string",
            },
          },
          required: ["answer"],
          additionalProperties: false,
        },
      },
      null,
      2,
    ),
  );

  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  let toolItems: unknown[] | undefined;
  try {
    toolItems = parseArray(tools.trim() || "[]", "Tool definitions");
  } catch {
    toolItems = undefined;
  }

  // Appends an editable example while preserving existing valid tool entries.
  function addSampleTool(): void {
    if (!toolItems) return;
    setTools(JSON.stringify([...toolItems, sampleTool], null, 2));
  }

  // Validate structured fields and persist the candidate.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      let responseFormat = null;
      if (responseType === "json_object") {
        responseFormat = {
          type: responseType,
        };
      }
      if (responseType === "json_schema") {
        responseFormat = {
          type: responseType,
          json_schema: parseObject(responseSchema, "JSON Schema configuration"),
        };
      }
      const candidate = await createCandidate(projectId, {
        provider_id: providerId,
        name,
        model_name: modelName,
        system_prompt: systemPrompt,
        generation_parameters: parseObject(parameters, "Generation parameters"),
        tool_definitions: parseArray(
          tools.trim() || "[]",
          "Tool definitions",
        ) as ToolDefinition[],
        response_format: responseFormat,
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
              <TextField
                id="model-name"
                label="Model name"
                value={modelName}
                onChange={setModelName}
                placeholder="model-or-agent-id"
              />
            </div>
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
              help="Only temperature (0–2), top_p (0–1, above 0), top_k (positive integer),
                and max_output_tokens (positive integer). Use null or omit a key to leave it
                unspecified. Support and limits also depend on the selected model."
              value={parameters}
              onChange={setParameters}
            />
            <JsonInput
              id="tool-definitions"
              label="Tool definitions"
              help="A JSON array of name, optional description, and parameters objects."
              value={tools}
              onChange={setTools}
              placeholder={toolPlaceholder}
              required={false}
              actions={
                <button
                  className="quiet-button json-input__format"
                  type="button"
                  onClick={addSampleTool}
                  disabled={toolItems === undefined}
                >
                  Add sample tool
                </button>
              }
            />
            <label className="form-field" htmlFor="response-format">
              <span>Response format</span>
              <select
                id="response-format"
                value={responseType}
                onChange={(event) => setResponseType(event.target.value)}
              >
                <option value="text">Text</option>
                <option value="json_object">JSON object</option>
                <option value="json_schema">JSON Schema</option>
              </select>
            </label>
            {responseType === "json_schema" && (
              <JsonInput
                id="response-schema"
                label="JSON Schema configuration"
                help="Edit name, strict, and schema. This configuration is saved under
                  json_schema alongside the selected type."
                value={responseSchema}
                onChange={setResponseSchema}
              />
            )}
          </RecordForm>
        )
      }
    </LoadBoundary>
  );
}

// Candidate detail page.
export function CandidateDetail(): ReactElement {
  const { projectId = "", recordId = "" } = useParams();
  return (
    <CandidateDetailContent
      key={`${projectId}-${recordId}`}
      projectId={projectId}
      candidateId={recordId}
    />
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
