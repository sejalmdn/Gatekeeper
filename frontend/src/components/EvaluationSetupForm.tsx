import { useRef, useState, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createEvaluationRun,
  createRunSettings,
  startEvaluationRun,
} from "../api";
import type { Candidate, Dataset, RunSettings } from "../types";
import { messageFor } from "../utils/format";
import { Notice } from "./Feedback";
import { SourceSelect } from "./FormFields";
import { RecordForm } from "./RecordForm";
import "../styles/EvaluationSetupForm.css";

interface EvaluationSetupFormProps {
  projectId: string;
  candidates: Candidate[];
  datasets: Dataset[];
  settings: RunSettings[];
  initialCandidateId: string;
  initialDatasetId: string;
}

// Starts a saved evaluation with explicit repeated attempts and timeout settings.
export function EvaluationSetupForm({
  projectId,
  candidates,
  datasets,
  settings,
  initialCandidateId,
  initialDatasetId,
}: EvaluationSetupFormProps): ReactElement {
  // Returns to the originating record on cancellation and opens the saved run.
  const navigate = useNavigate();

  // Accepts only a preselection belonging to the current project's loaded choices.
  const [candidateId, setCandidateId] = useState(
    candidates.some((item) => item.id === initialCandidateId)
      ? initialCandidateId
      : "",
  );

  // Leaves dataset selection explicit when entering through a candidate.
  const [datasetId, setDatasetId] = useState(
    datasets.some((item) => item.id === initialDatasetId)
      ? initialDatasetId
      : "",
  );

  // Starts with repeated attempts rather than presenting one attempt as reliability.
  const [attempts, setAttempts] = useState("3");

  // Uses seconds in the form and milliseconds at the API boundary.
  const [timeout, setTimeout] = useState("30");

  // Expresses the stored zero-to-one threshold as an editable percentage.
  const [threshold, setThreshold] = useState("80");

  // Retains the draft and a useful explanation when either save request fails.
  const [error, setError] = useState<string>();

  // Disables controls while the settings and pending run are being saved.
  const [saving, setSaving] = useState(false);

  // Prevents duplicate submissions before React commits the disabled state.
  const submitting = useRef(false);

  // Reuses immutable settings, including settings saved before a failed run request.
  const savedSettings = useRef([...settings]);
  const originCandidate = candidates.find(
    (item) => item.id === initialCandidateId,
  );
  const originDataset = datasets.find((item) => item.id === initialDatasetId);
  let backPath = `/projects/${projectId}/candidates`;
  if (originCandidate) backPath += `/${originCandidate.id}`;
  else if (originDataset)
    backPath = `/projects/${projectId}/datasets/${originDataset.id}`;

  // Creates one saved run before starting it; the detail page can retry a failed start.
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    setError(undefined);
    const attemptsValue = Number(attempts);
    const timeoutSeconds = Number(timeout);
    const timeoutMs = Math.round(timeoutSeconds * 1000);
    const thresholdValue = Number(threshold) / 100;
    if (
      !candidates.some((item) => item.id === candidateId) ||
      !datasets.some((item) => item.id === datasetId)
    ) {
      setError("Choose a candidate and dataset from this project.");
      return;
    }
    if (
      !attempts.trim() ||
      !Number.isSafeInteger(attemptsValue) ||
      attemptsValue < 1 ||
      !timeout.trim() ||
      timeoutSeconds < 0.001 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      !threshold.trim() ||
      !Number.isFinite(thresholdValue) ||
      thresholdValue < 0 ||
      thresholdValue > 1
    ) {
      setError(
        "Enter positive whole attempts, a positive timeout, and a threshold from 0 to 100%.",
      );
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      let configuration = savedSettings.current.find(
        (item) =>
          item.attempts_per_scenario === attemptsValue &&
          item.timeout_ms === timeoutMs &&
          item.pass_threshold === thresholdValue,
      );
      if (!configuration) {
        configuration = await createRunSettings(projectId, {
          name: `Evaluation settings ${crypto.randomUUID()}`,
          attempts_per_scenario: attemptsValue,
          timeout_ms: timeoutMs,
          pass_threshold: thresholdValue,
        });
        savedSettings.current.push(configuration);
      }
      const run = await createEvaluationRun(projectId, {
        candidate_id: candidateId,
        dataset_id: datasetId,
        run_settings_id: configuration.id,
      });
      try {
        await startEvaluationRun(projectId, run.id);
        navigate(`/projects/${projectId}/evaluation-runs/${run.id}`);
      } catch (failure) {
        navigate(`/projects/${projectId}/evaluation-runs/${run.id}`, {
          state: { startError: messageFor(failure) },
        });
      }
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  if (candidates.length === 0 || datasets.length === 0) {
    const missing = candidates.length === 0 ? "candidate" : "dataset";
    return (
      <section className="page-content">
        <div className="empty-state">
          <h2>Add a {missing} first</h2>
          <p>
            An evaluation needs a candidate and a dataset from this project.
          </p>
          <Link
            className="button"
            to={`/projects/${projectId}/${missing}s/new`}
          >
            Create {missing}
          </Link>
          <Link to={backPath}>Back</Link>
        </div>
      </section>
    );
  }

  return (
    <RecordForm
      title="Set up evaluation"
      detail="Choose what to evaluate and configure the run."
      caption="Offline evaluation"
      submitLabel="Start run"
      pendingLabel="Starting…"
      saving={saving}
      error={error}
      onSubmit={submit}
      onCancel={() => navigate(backPath)}
      className="evaluation-setup-form"
    >
      <Notice>
        Execution supports OpenRouter and Groq. Start runs the selected
        candidate against every scenario. Each attempt makes one provider
        request. Rules are not graded yet.
      </Notice>
      <fieldset disabled={saving} className="evaluation-setup-form__fields">
        <legend>Evaluation sources</legend>
        <div className="form-row">
          <SourceSelect
            id="evaluation-candidate"
            label="Candidate"
            value={candidateId}
            onChange={setCandidateId}
            placeholder="Select a candidate"
            options={candidates.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
          />
          <SourceSelect
            id="evaluation-dataset"
            label="Dataset"
            value={datasetId}
            onChange={setDatasetId}
            placeholder="Select a dataset"
            options={datasets.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
          />
        </div>
      </fieldset>
      <fieldset disabled={saving} className="evaluation-setup-form__fields">
        <legend>Run settings</legend>
        <div className="evaluation-setup-form__settings">
          <label className="form-field" htmlFor="evaluation-attempts">
            <span>Attempts per scenario</span>
            <input
              id="evaluation-attempts"
              type="number"
              min="1"
              step="1"
              required
              value={attempts}
              onChange={(event) => setAttempts(event.target.value)}
            />
          </label>
          <label className="form-field" htmlFor="evaluation-timeout">
            <span>Timeout per attempt (seconds)</span>
            <input
              id="evaluation-timeout"
              type="number"
              min="0.001"
              step="0.001"
              required
              value={timeout}
              onChange={(event) => setTimeout(event.target.value)}
            />
          </label>
          <label className="form-field" htmlFor="evaluation-threshold">
            <span>Pass threshold (%)</span>
            <input
              id="evaluation-threshold"
              type="number"
              min="0"
              max="100"
              step="any"
              required
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </label>
        </div>
        <p className="evaluation-setup-form__help">
          A scenario meets this threshold when its passing share of planned
          attempts is high enough and the required evaluation evidence is
          complete.
        </p>
      </fieldset>
    </RecordForm>
  );
}
