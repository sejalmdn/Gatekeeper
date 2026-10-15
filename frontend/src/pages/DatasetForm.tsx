import { useRef, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createDataset } from "../api";
import { AddedScenarioList } from "../components/AddedScenarioList";
import { Icon } from "../components/Icon";
import { RecordForm } from "../components/RecordForm";
import { ScenarioEditor } from "../components/ScenarioEditor";
import type { ScenarioCreate } from "../types";
import { messageFor } from "../utils/format";
import {
  addScenario,
  removeScenario,
  requireScenarios,
} from "../utils/scenarioComposer";
import "../styles/DatasetForm.css";

// Creates dataset metadata and its complete scenario collection in one request.
export function DatasetForm(): ReactElement {
  // Reads the project scope for the create request and return route.
  const { projectId = "" } = useParams();

  // Navigates only after the complete dataset has been persisted.
  const navigate = useNavigate();

  // Holds metadata that is submitted with the scenario collection.
  const [metadata, setMetadata] = useState({
    name: "",
    description: "",
  });

  // Stores added scenarios locally until final dataset creation.
  const [scenarios, setScenarios] = useState<ScenarioCreate[]>([]);

  // Surfaces failures from the atomic dataset request.
  const [error, setError] = useState<string>();

  // Disables every mutable action while the dataset request is pending.
  const [saving, setSaving] = useState(false);

  // Prevents a second request before React applies the pending render.
  const submitting = useRef(false);

  // Add one validated scenario to the local collection.
  function addValidatedScenario(scenario: ScenarioCreate): void {
    setScenarios((current) => addScenario(current, scenario));
    setError(undefined);
  }

  // Remove one added scenario by its current list position.
  function removeAddedScenario(index: number): void {
    setScenarios((current) => removeScenario(current, index));
    setError(undefined);
  }

  // Persist metadata and every local scenario through the atomic endpoint.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    try {
      requireScenarios(scenarios);
    } catch (validationError) {
      setError(messageFor(validationError));
      return;
    }

    submitting.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const dataset = await createDataset(projectId, {
        name: metadata.name,
        description: metadata.description || null,
        scenarios,
      });
      navigate(`/projects/${projectId}/datasets/${dataset.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <RecordForm
      title="Create dataset"
      detail="Assemble the complete evaluation set before saving it."
      submitLabel="Create dataset"
      pendingLabel="Creating dataset…"
      submitDisabled={scenarios.length === 0}
      error={error}
      saving={saving}
      onSubmit={submit}
      onCancel={() => navigate(`/projects/${projectId}/datasets`)}
      className="dataset-creation-form"
      caption={
        <>
          <Icon name="lock" />
          Immutable dataset
        </>
      }
      actionSummary={
        <div className="dataset-form__action-summary" aria-live="polite">
          <strong>
            {scenarios.length}{" "}
            {scenarios.length === 1 ? "scenario" : "scenarios"}
          </strong>
        </div>
      }
    >
      <div className="dataset-form__metadata-fields">
        <label className="form-field" htmlFor="dataset-name">
          <span>Name</span>
          <input
            id="dataset-name"
            value={metadata.name}
            onChange={(event) =>
              setMetadata((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            disabled={saving}
            required
          />
        </label>
        <label className="form-field" htmlFor="dataset-description">
          <span>Description</span>
          <input
            id="dataset-description"
            value={metadata.description}
            onChange={(event) =>
              setMetadata((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            disabled={saving}
          />
        </label>
      </div>
      <div className="dataset-form__workspace">
        <ScenarioEditor
          scenarios={scenarios}
          disabled={saving}
          onAdd={addValidatedScenario}
        />
        <AddedScenarioList
          scenarios={scenarios}
          disabled={saving}
          onRemove={removeAddedScenario}
        />
      </div>
    </RecordForm>
  );
}
