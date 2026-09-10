import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link, NavLink, Outlet, Route, Routes, useNavigate, useParams } from "react-router-dom";

import {
  ApiError,
  createCandidate,
  createConfig,
  createDatasetRelease,
  createEvaluation,
  createProject,
  getCandidate,
  getConfig,
  getDatasetRelease,
  getEvaluation,
  getProject,
  listCandidates,
  listConfigs,
  listDatasetReleases,
  listEvaluations,
  listProjects,
} from "./api";
import type { Candidate, Config, DatasetRelease, Evaluation, JsonObject, Project, Scenario } from "./types";

// Asynchronous data state used across control-plane pages.
interface LoadState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

// Load a record or collection when its page is opened.
function useLoad<T>(load: () => Promise<T>): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ loading: true });

  useEffect(() => {
    let active = true;
    void load()
      .then((data) => active && setState({ data, loading: false }))
      .catch((error: unknown) => {
        if (active) {
          setState({ error: messageFor(error), loading: false });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

// Convert request failures into one direct user-facing sentence.
function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

// Show a short, identifiable digest without making it the primary label.
function shortDigest(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

// Render a local timestamp in the developer's browser locale.
function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

// Format structured values consistently for inspection and editing.
function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// Parse a JSON object and reject primitive or array form values.
function parseObject(value: string, field: string): JsonObject {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON object.`);
  }
  return parsed as JsonObject;
}

// Parse a JSON array while leaving item-specific validation to the API contract.
function parseArray(value: string, field: string): unknown[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON array.`);
  }
  return parsed;
}

// Shared loading and failure treatment for record pages.
function LoadBoundary<T>({ state, children }: { state: LoadState<T>; children: (data: T) => ReactNode }) {
  if (state.loading) {
    return <p className="page-state">Loading record…</p>;
  }
  if (state.error) {
    return <p className="page-state page-state-error">{state.error}</p>;
  }
  if (state.data === undefined) {
    return <p className="page-state">No record is available.</p>;
  }
  return <>{children(state.data)}</>;
}

// Consistent page titles and primary actions.
function PageHeading({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {action}
    </header>
  );
}

// Render hashes as an explicit integrity property.
function Digest({ label, value }: { label: string; value: string }) {
  return (
    <span className="digest" title={value}>
      <span>{label}</span> {shortDigest(value)}
    </span>
  );
}

// Present canonical JSON evidence without editing affordances.
function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-block">{json(value)}</pre>;
}

// Render a text area for JSON with a concise field description.
function JsonInput({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-field" htmlFor={id}>
      <span>{label}</span>
      <small>{help}</small>
      <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} spellCheck="false" />
    </label>
  );
}

// Project workspace shell and record navigation.
function ProjectLayout() {
  const { projectId = "" } = useParams();
  const state = useLoad(() => getProject(projectId));

  return (
    <LoadBoundary state={state}>
      {(project) => (
        <main className="workspace">
          <header className="workspace-header">
            <Link className="wordmark" to="/">Gatekeeper</Link>
            <p>{project.name}</p>
          </header>
          <nav className="project-nav" aria-label="Project records">
            <NavLink end to={`/projects/${projectId}`}>Overview</NavLink>
            <NavLink to={`/projects/${projectId}/evaluations`}>Evaluations</NavLink>
            <NavLink to={`/projects/${projectId}/candidates`}>Candidates</NavLink>
            <NavLink to={`/projects/${projectId}/datasets`}>Datasets</NavLink>
            <NavLink to={`/projects/${projectId}/configs`}>Configurations</NavLink>
          </nav>
          <Outlet />
        </main>
      )}
    </LoadBoundary>
  );
}

// Project selection and creation page.
function ProjectsPage() {
  const projects = useLoad(listProjects);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const project = await createProject(name);
      navigate(`/projects/${project.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="project-picker">
      <section>
        <p className="wordmark">Gatekeeper</p>
        <h1>Start with a project record.</h1>
        <p className="intro">Projects hold the immutable records used to make credible workflow evaluations.</p>
        <form className="inline-form" onSubmit={submit}>
          <label htmlFor="project-name">Project name</label>
          <div>
            <input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Payments"
              required
            />
            <button disabled={saving}>{saving ? "Creating…" : "Create project"}</button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      </section>
      <section className="project-list" aria-labelledby="existing-projects">
        <h2 id="existing-projects">Existing projects</h2>
        <LoadBoundary state={projects}>
          {(items) =>
            items.length ? (
              <ul>
                {items.map((project) => (
                  <li key={project.id}>
                    <Link to={`/projects/${project.id}`}>
                      <strong>{project.name}</strong>
                      <span>Created {timestamp(project.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">Create the first project to start assembling evaluation records.</p>
            )
          }
        </LoadBoundary>
      </section>
    </main>
  );
}

// Project overview with record counts and recent frozen evaluations.
function OverviewPage() {
  const { projectId = "" } = useParams();
  const candidates = useLoad(() => listCandidates(projectId));
  const datasets = useLoad(() => listDatasetReleases(projectId));
  const configs = useLoad(() => listConfigs(projectId));
  const evaluations = useLoad(() => listEvaluations(projectId));

  return (
    <section className="page-content">
      <PageHeading
        title="Measurement records"
        detail="Freeze the exact inputs before an evaluation begins. Results arrive in a later lifecycle stage."
        action={<Link className="button" to="evaluations/new">Create frozen evaluation</Link>}
      />
      <div className="record-shelf" aria-label="Project record counts">
        <RecordCount label="Candidates" state={candidates} />
        <RecordCount label="Dataset releases" state={datasets} />
        <RecordCount label="Configurations" state={configs} />
        <RecordCount label="Evaluations" state={evaluations} />
      </div>
      <section className="ledger-section">
        <div className="section-title">
          <h2>Recent frozen evaluations</h2>
          <Link to="evaluations">View all</Link>
        </div>
        <LoadBoundary state={evaluations}>
          {(items) =>
            items.length ? <EvaluationTable evaluations={items.slice(-5).reverse()} projectId={projectId} /> : (
              <EmptyRecord kind="evaluation" projectId={projectId} />
            )
          }
        </LoadBoundary>
      </section>
    </section>
  );
}

// Display a compact count that never invents a quality metric.
function RecordCount({ label, state }: { label: string; state: LoadState<unknown[]> }) {
  return <div><span>{label}</span><strong>{state.data?.length ?? "—"}</strong></div>;
}

// Contextual empty state for each current record type.
function EmptyRecord({ kind, projectId }: { kind: string; projectId: string }) {
  const routes: Record<string, string> = {
    candidate: "candidates/new",
    dataset: "datasets/new",
    configuration: "configs/new",
    evaluation: "evaluations/new",
  };
  const labels: Record<string, string> = {
    candidate: "Create candidate",
    dataset: "Create dataset release",
    configuration: "Create configuration",
    evaluation: "Create frozen evaluation",
  };
  return (
    <p className="empty-copy">
      No {kind}s yet. <Link to={`/projects/${projectId}/${routes[kind]}`}>{labels[kind]}</Link>
    </p>
  );
}

// Candidate ledger page.
function CandidatesPage() {
  const { projectId = "" } = useParams();
  const state = useLoad(() => listCandidates(projectId));
  return <RecordList title="Candidates" detail="Application versions and their frozen runtime configuration." action="Create candidate" actionPath="new" state={state} projectId={projectId} render={(items) => <CandidateTable candidates={items} projectId={projectId} />} kind="candidate" />;
}

// Dataset release ledger page.
function DatasetsPage() {
  const { projectId = "" } = useParams();
  const state = useLoad(() => listDatasetReleases(projectId));
  return <RecordList title="Dataset releases" detail="Immutable scenario collections used as evaluation input." action="Create dataset release" actionPath="new" state={state} projectId={projectId} render={(items) => <DatasetTable datasets={items} projectId={projectId} />} kind="dataset" />;
}

// Evaluator and scoring configuration ledger page.
function ConfigsPage() {
  const { projectId = "" } = useParams();
  const state = useLoad(() => listConfigs(projectId));
  return <RecordList title="Configurations" detail="Versioned thresholds, severity weights, and repeated-run policy." action="Create configuration" actionPath="new" state={state} projectId={projectId} render={(items) => <ConfigTable configs={items} projectId={projectId} />} kind="configuration" />;
}

// Frozen evaluation ledger page.
function EvaluationsPage() {
  const { projectId = "" } = useParams();
  const state = useLoad(() => listEvaluations(projectId));
  return <RecordList title="Evaluations" detail="Records that freeze a candidate, dataset release, and configuration together." action="Create frozen evaluation" actionPath="new" state={state} projectId={projectId} render={(items) => <EvaluationTable evaluations={items.slice().reverse()} projectId={projectId} />} kind="evaluation" />;
}

// Shared ledger list frame.
function RecordList<T>({ title, detail, action, actionPath, state, projectId, render, kind }: { title: string; detail: string; action: string; actionPath: string; state: LoadState<T[]>; projectId: string; render: (items: T[]) => ReactNode; kind: string }) {
  return (
    <section className="page-content">
      <PageHeading title={title} detail={detail} action={<Link className="button" to={actionPath}>{action}</Link>} />
      <LoadBoundary state={state}>{(items) => items.length ? render(items) : <EmptyRecord kind={kind} projectId={projectId} />}</LoadBoundary>
    </section>
  );
}

// Candidate record table.
function CandidateTable({ candidates, projectId }: { candidates: Candidate[]; projectId: string }) {
  return <table className="ledger"><thead><tr><th>Application version</th><th>Runtime configuration</th><th>Created</th></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.id}><td><Link to={`/projects/${projectId}/candidates/${candidate.id}`}>{candidate.application_version}</Link></td><td><Digest label="digest" value={candidate.runtime_configuration_digest} /></td><td>{timestamp(candidate.created_at)}</td></tr>)}</tbody></table>;
}

// Dataset release record table.
function DatasetTable({ datasets, projectId }: { datasets: DatasetRelease[]; projectId: string }) {
  return <table className="ledger"><thead><tr><th>Release</th><th>Scenarios</th><th>Content</th><th>Created</th></tr></thead><tbody>{datasets.map((dataset) => <tr key={dataset.id}><td><Link to={`/projects/${projectId}/datasets/${dataset.id}`}>{dataset.dataset_name} <span className="version">v{dataset.version}</span></Link></td><td>{dataset.scenarios.length}</td><td><Digest label="digest" value={dataset.content_digest} /></td><td>{timestamp(dataset.created_at)}</td></tr>)}</tbody></table>;
}

// Configuration release record table.
function ConfigTable({ configs, projectId }: { configs: Config[]; projectId: string }) {
  return <table className="ledger"><thead><tr><th>Release</th><th>Attempts</th><th>Configuration</th><th>Created</th></tr></thead><tbody>{configs.map((config) => <tr key={config.id}><td><Link to={`/projects/${projectId}/configs/${config.id}`}>{config.name} <span className="version">v{config.version}</span></Link></td><td>{config.default_attempts}</td><td><Digest label="digest" value={config.digest} /></td><td>{timestamp(config.created_at)}</td></tr>)}</tbody></table>;
}

// Frozen evaluation record table.
function EvaluationTable({ evaluations, projectId }: { evaluations: Evaluation[]; projectId: string }) {
  return <table className="ledger"><thead><tr><th>Candidate</th><th>Dataset release</th><th>Configuration</th><th>Created</th></tr></thead><tbody>{evaluations.map((evaluation) => <tr key={evaluation.id}><td><Link to={`/projects/${projectId}/evaluations/${evaluation.id}`}>{evaluation.candidate_snapshot.application_version}</Link></td><td>{evaluation.dataset_release_snapshot.dataset_name} <span className="version">v{evaluation.dataset_release_snapshot.version}</span></td><td>{evaluation.config_snapshot.name} <span className="version">v{evaluation.config_snapshot.version}</span></td><td>{timestamp(evaluation.created_at)}</td></tr>)}</tbody></table>;
}

// Create a candidate from an application version and runtime JSON.
function CandidateForm() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [version, setVersion] = useState("");
  const [runtime, setRuntime] = useState('{\n  "model": ""\n}');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const candidate = await createCandidate(projectId, version, parseObject(runtime, "Runtime configuration"));
      navigate(`/projects/${projectId}/candidates/${candidate.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return <RecordForm title="Create candidate" detail="This application version and runtime configuration become an immutable candidate record." error={error} saving={saving} onSubmit={submit} onCancel={() => navigate(`/projects/${projectId}/candidates`)}><label className="form-field" htmlFor="application-version"><span>Application version</span><input id="application-version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="2026.09.07" required /></label><JsonInput id="runtime-configuration" label="Runtime configuration" help="A non-empty JSON object describing the workflow runtime." value={runtime} onChange={setRuntime} /><button disabled={saving}>{saving ? "Creating…" : "Create candidate"}</button></RecordForm>;
}

// Create an immutable scenario dataset release.
function DatasetForm() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [scenarios, setScenarios] = useState('[\n  {\n    "scenario_id": "",\n    "input": {}\n  }\n]');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const release = await createDatasetRelease(projectId, name, version, parseArray(scenarios, "Scenarios") as Scenario[]);
      navigate(`/projects/${projectId}/datasets/${release.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return <RecordForm title="Create dataset release" detail="Dataset releases are immutable. Publish a new version when scenario content changes." error={error} saving={saving} onSubmit={submit} onCancel={() => navigate(`/projects/${projectId}/datasets`)}><div className="form-row"><label className="form-field" htmlFor="dataset-name"><span>Dataset name</span><input id="dataset-name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="form-field" htmlFor="dataset-version"><span>Version</span><input id="dataset-version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1" required /></label></div><JsonInput id="dataset-scenarios" label="Scenarios" help="A JSON array of scenario_id and safe input objects." value={scenarios} onChange={setScenarios} /><button disabled={saving}>{saving ? "Creating…" : "Create dataset release"}</button></RecordForm>;
}

// Create an immutable evaluator and scoring configuration release.
function ConfigForm() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [settings, setSettings] = useState("{}");
  const [thresholds, setThresholds] = useState('{\n  "suite_pass": 0.9\n}');
  const [weights, setWeights] = useState('{\n  "blocking": 10\n}');
  const [attempts, setAttempts] = useState("3");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const config = await createConfig(
        projectId,
        name,
        version,
        parseObject(settings, "Settings"),
        parseObject(thresholds, "Thresholds") as Record<string, number>,
        parseObject(weights, "Severity weights") as Record<string, number>,
        Number(attempts),
      );
      navigate(`/projects/${projectId}/configs/${config.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  return <RecordForm title="Create configuration" detail="Thresholds, severity weights, and repeated-run policy freeze into new evaluations." error={error} saving={saving} onSubmit={submit} onCancel={() => navigate(`/projects/${projectId}/configs`)}><div className="form-row"><label className="form-field" htmlFor="config-name"><span>Configuration name</span><input id="config-name" value={name} onChange={(event) => setName(event.target.value)} required /></label><label className="form-field" htmlFor="config-version"><span>Version</span><input id="config-version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="1" required /></label></div><label className="form-field" htmlFor="default-attempts"><span>Default attempts</span><small>Positive whole number used by the repeated-run policy.</small><input id="default-attempts" type="number" min="1" step="1" value={attempts} onChange={(event) => setAttempts(event.target.value)} required /></label><JsonInput id="config-settings" label="Evaluator settings" help="A JSON object retained as versioned evaluator configuration." value={settings} onChange={setSettings} /><div className="form-row"><JsonInput id="config-thresholds" label="Thresholds" help="A non-empty JSON object with numeric values." value={thresholds} onChange={setThresholds} /><JsonInput id="config-weights" label="Severity weights" help="A non-empty JSON object with positive numeric values." value={weights} onChange={setWeights} /></div><button disabled={saving}>{saving ? "Creating…" : "Create configuration"}</button></RecordForm>;
}

// Shared creation form shell.
function RecordForm({ title, detail, error, saving, onSubmit, onCancel, children }: { title: string; detail: string; error?: string; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; children: ReactNode }) {
  return <section className="page-content form-page"><PageHeading title={title} detail={detail} /><form className="record-form" onSubmit={onSubmit}>{children}{error && <p className="form-error" role="alert">{error}</p>}<button className="quiet-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button></form></section>;
}

// Assemble an evaluation from three existing immutable source records.
function EvaluationForm() {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const candidates = useLoad(() => listCandidates(projectId));
  const datasets = useLoad(() => listDatasetReleases(projectId));
  const configs = useLoad(() => listConfigs(projectId));
  const [candidateId, setCandidateId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [configId, setConfigId] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const candidate = candidates.data?.find((item) => item.id === candidateId);
  const dataset = datasets.data?.find((item) => item.id === datasetId);
  const config = configs.data?.find((item) => item.id === configId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const evaluation = await createEvaluation(projectId, candidateId, datasetId, configId);
      navigate(`/projects/${projectId}/evaluations/${evaluation.id}`);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (candidates.loading || datasets.loading || configs.loading) {
    return <p className="page-state">Loading source records…</p>;
  }
  if (candidates.error || datasets.error || configs.error) {
    return <p className="page-state page-state-error">{candidates.error ?? datasets.error ?? configs.error}</p>;
  }
  if (!candidates.data?.length || !datasets.data?.length || !configs.data?.length) {
    return <section className="page-content"><PageHeading title="Create frozen evaluation" detail="An evaluation requires one candidate, dataset release, and configuration." /><p className="empty-copy">Create all three source records before assembling an evaluation.</p></section>;
  }

  return <section className="page-content form-page"><PageHeading title="Create frozen evaluation" detail="Gatekeeper snapshots each selected record. The sources cannot be changed after creation." /><form className="record-form" onSubmit={submit}><div className="source-selects"><SourceSelect id="candidate" label="Candidate" value={candidateId} onChange={setCandidateId} placeholder="Choose an application version" options={candidates.data.map((item) => ({ id: item.id, label: item.application_version }))} /><SourceSelect id="dataset" label="Dataset release" value={datasetId} onChange={setDatasetId} placeholder="Choose a scenario collection" options={datasets.data.map((item) => ({ id: item.id, label: `${item.dataset_name} v${item.version}` }))} /><SourceSelect id="config" label="Configuration" value={configId} onChange={setConfigId} placeholder="Choose thresholds and attempts" options={configs.data.map((item) => ({ id: item.id, label: `${item.name} v${item.version}` }))} /></div><FreezeAssembly candidate={candidate} dataset={dataset} config={config} /><button disabled={saving || !candidate || !dataset || !config}>{saving ? "Freezing…" : "Create frozen evaluation"}</button>{error && <p className="form-error" role="alert">{error}</p>}<button className="quiet-button" type="button" onClick={() => navigate(`/projects/${projectId}/evaluations`)} disabled={saving}>Cancel</button></form></section>;
}

// Select one source record for frozen evaluation assembly.
function SourceSelect({ id, label, value, onChange, placeholder, options }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder: string; options: { id: string; label: string }[] }) {
  return <label className="form-field" htmlFor={id}><span>{label}</span><select id={id} value={value} onChange={(event) => onChange(event.target.value)} required><option value="">{placeholder}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

// Explain the exact immutable inputs that will compose an evaluation.
function FreezeAssembly({ candidate, dataset, config }: { candidate?: Candidate; dataset?: DatasetRelease; config?: Config }) {
  return <section className="freeze-assembly" aria-label="Frozen evaluation source assembly"><p>Frozen evaluation</p><div><SourceTile label="Candidate" name={candidate?.application_version} digest={candidate?.runtime_configuration_digest} /><SourceTile label="Dataset release" name={dataset && `${dataset.dataset_name} v${dataset.version}`} digest={dataset?.content_digest} /><SourceTile label="Configuration" name={config && `${config.name} v${config.version}`} digest={config?.digest} /></div><small>Each source is copied into the evaluation record when it is created.</small></section>;
}

// Render one position in the frozen-input assembly.
function SourceTile({ label, name, digest }: { label: string; name?: string; digest?: string }) {
  return <div><span>{label}</span><strong>{name ?? "Not selected"}</strong>{digest && <Digest label="digest" value={digest} />}</div>;
}

// Candidate detail page.
function CandidateDetail() {
  const { projectId = "", recordId = "" } = useParams();
  const state = useLoad(() => getCandidate(projectId, recordId));
  return <LoadBoundary state={state}>{(candidate) => <section className="page-content"><PageHeading title={`Candidate ${candidate.application_version}`} detail="Immutable application version and runtime configuration." action={<Link className="quiet-link" to={`/projects/${projectId}/candidates`}>Back to candidates</Link>} /><RecordMetadata createdAt={candidate.created_at} digestLabel="Runtime configuration digest" digest={candidate.runtime_configuration_digest} /><section className="detail-section"><h2>Runtime configuration</h2><JsonBlock value={candidate.runtime_configuration} /></section></section>}</LoadBoundary>;
}

// Dataset release detail page.
function DatasetDetail() {
  const { projectId = "", recordId = "" } = useParams();
  const state = useLoad(() => getDatasetRelease(projectId, recordId));
  return <LoadBoundary state={state}>{(dataset) => <section className="page-content"><PageHeading title={`${dataset.dataset_name} v${dataset.version}`} detail="Immutable scenario dataset release." action={<Link className="quiet-link" to={`/projects/${projectId}/datasets`}>Back to dataset releases</Link>} /><RecordMetadata createdAt={dataset.created_at} digestLabel="Content digest" digest={dataset.content_digest} /><section className="detail-section"><div className="section-title"><h2>Scenarios</h2><span>{dataset.scenarios.length} records</span></div><div className="scenario-list">{dataset.scenarios.map((scenario) => <article key={scenario.scenario_id}><h3>{scenario.scenario_id}</h3><JsonBlock value={scenario.input} /></article>)}</div></section></section>}</LoadBoundary>;
}

// Configuration release detail page.
function ConfigDetail() {
  const { projectId = "", recordId = "" } = useParams();
  const state = useLoad(() => getConfig(projectId, recordId));
  return <LoadBoundary state={state}>{(config) => <section className="page-content"><PageHeading title={`${config.name} v${config.version}`} detail="Immutable evaluator and scoring configuration release." action={<Link className="quiet-link" to={`/projects/${projectId}/configs`}>Back to configurations</Link>} /><RecordMetadata createdAt={config.created_at} digestLabel="Configuration digest" digest={config.digest} /><div className="policy-strip"><span>Repeated-run policy</span><strong>{config.default_attempts} attempts by default</strong></div><section className="detail-grid"><div><h2>Thresholds</h2><JsonBlock value={config.thresholds} /></div><div><h2>Severity weights</h2><JsonBlock value={config.weights} /></div></section><section className="detail-section"><h2>Evaluator settings</h2><JsonBlock value={config.settings} /></section></section>}</LoadBoundary>;
}

// Evaluation detail page that privileges its frozen source snapshots.
function EvaluationDetail() {
  const { projectId = "", recordId = "" } = useParams();
  const state = useLoad(() => getEvaluation(projectId, recordId));
  return <LoadBoundary state={state}>{(evaluation) => <section className="page-content"><PageHeading title="Frozen evaluation" detail="This record preserves the exact candidate, dataset release, and configuration selected at creation." action={<Link className="quiet-link" to={`/projects/${projectId}/evaluations`}>Back to evaluations</Link>} /><RecordMetadata createdAt={evaluation.created_at} /><FreezeAssembly candidate={evaluation.candidate_snapshot} dataset={evaluation.dataset_release_snapshot} config={evaluation.config_snapshot} /><section className="detail-section"><h2>Frozen source snapshots</h2><details open><summary>Candidate {evaluation.candidate_snapshot.application_version}</summary><JsonBlock value={evaluation.candidate_snapshot} /></details><details><summary>Dataset {evaluation.dataset_release_snapshot.dataset_name} v{evaluation.dataset_release_snapshot.version}</summary><JsonBlock value={evaluation.dataset_release_snapshot} /></details><details><summary>Configuration {evaluation.config_snapshot.name} v{evaluation.config_snapshot.version}</summary><JsonBlock value={evaluation.config_snapshot} /></details></section><p className="boundary-note">This is an input record. Execution lifecycle, evidence, and reports are not available in this delivery stage.</p></section>}</LoadBoundary>;
}

// Display common immutable record metadata.
function RecordMetadata({ createdAt, digestLabel, digest }: { createdAt: string; digestLabel?: string; digest?: string }) {
  return <dl className="metadata"><div><dt>Created</dt><dd>{timestamp(createdAt)}</dd></div>{digestLabel && digest && <div><dt>{digestLabel}</dt><dd><Digest label="sha256" value={digest} /></dd></div>}</dl>;
}

// Root application routes.
export default function App() {
  return <Routes><Route path="/" element={<ProjectsPage />} /><Route path="/projects/:projectId" element={<ProjectLayout />}><Route index element={<OverviewPage />} /><Route path="candidates" element={<CandidatesPage />} /><Route path="candidates/new" element={<CandidateForm />} /><Route path="candidates/:recordId" element={<CandidateDetail />} /><Route path="datasets" element={<DatasetsPage />} /><Route path="datasets/new" element={<DatasetForm />} /><Route path="datasets/:recordId" element={<DatasetDetail />} /><Route path="configs" element={<ConfigsPage />} /><Route path="configs/new" element={<ConfigForm />} /><Route path="configs/:recordId" element={<ConfigDetail />} /><Route path="evaluations" element={<EvaluationsPage />} /><Route path="evaluations/new" element={<EvaluationForm />} /><Route path="evaluations/:recordId" element={<EvaluationDetail />} /></Route><Route path="*" element={<ProjectsPage />} /></Routes>;
}
