import { useState, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createDataset,
  createScenario,
  getDataset,
  listDatasets,
  listScenarios,
} from "../api";
import { LoadBoundary } from "../components/Feedback";
import { JsonInput } from "../components/FormFields";
import { JsonBlock } from "../components/RecordData";
import { RecordDetails } from "../components/RecordDetails";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { DatasetTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import type { JsonObject, ScenarioType } from "../types";
import { messageFor, parseArray } from "../utils/format";

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Dataset list page.
export function DatasetsPage(): ReactElement {
  const { projectId = "" } = useParams();
  const state = useLoad(() => listDatasets(projectId));
  return (
    <RecordList
      title="Datasets"
      detail="Collections of typed evaluation scenarios."
      action="Create dataset"
      actionPath="new"
      state={state}
      projectId={projectId}
      render={(items) => (
        <DatasetTable datasets={items} projectId={projectId} />
      )}
      kind="dataset"
    />
  );
}

// Create a dataset container.
export function DatasetForm(): ReactElement {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Persist the dataset and open it for scenario entry.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const dataset = await createDataset(projectId, name, description || null);
      navigate(`/projects/${projectId}/datasets/${dataset.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title="Create dataset"
      detail="Create a container, then add typed scenarios."
      submitLabel="Create dataset"
      error={error}
      saving={saving}
      onSubmit={submit}
      onCancel={() => navigate(`/projects/${projectId}/datasets`)}
    >
      <label className="form-field" htmlFor="dataset-name">
        <span>Name</span>
        <input
          id="dataset-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label className="form-field" htmlFor="dataset-description">
        <span>Description (optional)</span>
        <textarea
          id="dataset-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
    </RecordForm>
  );
}

// Dataset detail loads the container and its scenarios from separate resources.
export function DatasetDetail(): ReactElement {
  const { projectId = "", recordId = "" } = useParams();
  const state = useLoad(async () => ({
    dataset: await getDataset(projectId, recordId),
    scenarios: await listScenarios(projectId, recordId),
  }));
  return (
    <LoadBoundary state={state}>
      {({ dataset, scenarios }) => (
        <RecordDetails
          title={dataset.name}
          detail={dataset.description ?? "Scenario dataset"}
          backTo={`/projects/${projectId}/datasets`}
          backLabel="Back to datasets"
          createdAt={dataset.created_at}
        >
          <section className="detail-section">
            <div className="section-title">
              <h2>Scenarios</h2>
              <span>{scenarios.length} records</span>
              <Link className="button button-secondary" to="scenarios/new">
                Add scenario
              </Link>
            </div>
            {scenarios.length ? (
              <div className="scenario-list">
                {scenarios.map((scenario) => (
                  <article key={scenario.id}>
                    <div className="section-title">
                      <h3>{scenario.name}</h3>
                      <span>{scenario.scenario_type}</span>
                    </div>
                    <p>{scenario.scenario_key}</p>
                    <JsonBlock value={scenario.input} />
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No scenarios yet</h3>
                <p>Add the first input that Gatekeeper should evaluate.</p>
                <Link className="button button-secondary" to="scenarios/new">
                  Add scenario
                </Link>
              </div>
            )}
          </section>
        </RecordDetails>
      )}
    </LoadBoundary>
  );
}

// Create a type-aware scenario under the current dataset.
export function ScenarioForm(): ReactElement {
  const { projectId = "", recordId = "" } = useParams();
  const navigate = useNavigate();
  const [scenarioKey, setScenarioKey] = useState("");
  const [name, setName] = useState("");
  const [scenarioType, setScenarioType] = useState<ScenarioType>("single_turn");
  const [userMessage, setUserMessage] = useState("");
  const [history, setHistory] = useState("[]");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // Build the exact input shape required by the selected scenario type.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      let input: JsonObject = { user_message: userMessage };
      if (scenarioType !== "single_turn") {
        input = {
          history: parseArray(history, "Conversation history"),
          user_message: userMessage,
        };
      }
      await createScenario(projectId, recordId, {
        scenario_key: scenarioKey,
        name,
        scenario_type: scenarioType,
        input,
      });
      navigate(`/projects/${projectId}/datasets/${recordId}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title="Add scenario"
      detail="Define one controlled input without including private evaluation expectations."
      submitLabel="Add scenario"
      error={error}
      saving={saving}
      onSubmit={submit}
      onCancel={() => navigate(`/projects/${projectId}/datasets/${recordId}`)}
    >
      <div className="form-row">
        <TextField
          id="scenario-key"
          label="Scenario key"
          value={scenarioKey}
          onChange={setScenarioKey}
          placeholder="refund-policy"
        />
        <TextField
          id="scenario-name"
          label="Name"
          value={name}
          onChange={setName}
        />
      </div>
      <label className="form-field" htmlFor="scenario-type">
        <span>Scenario type</span>
        <select
          id="scenario-type"
          value={scenarioType}
          onChange={(event) =>
            setScenarioType(event.target.value as ScenarioType)
          }
        >
          <option value="single_turn">Single turn</option>
          <option value="multi_turn">Multi-turn</option>
          <option value="tool_use">Tool use</option>
        </select>
      </label>
      {scenarioType !== "single_turn" && (
        <JsonInput
          id="scenario-history"
          label="Conversation history"
          help={
            scenarioType === "multi_turn"
              ? "A non-empty JSON array of user and assistant messages."
              : "An optional JSON array of earlier user and assistant messages."
          }
          value={history}
          onChange={setHistory}
        />
      )}
      <label className="form-field" htmlFor="user-message">
        <span>User message</span>
        <textarea
          id="user-message"
          value={userMessage}
          onChange={(event) => setUserMessage(event.target.value)}
          required
        />
      </label>
    </RecordForm>
  );
}

// Small text input shared within scenario creation.
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
