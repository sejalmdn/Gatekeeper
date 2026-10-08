import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createDatasetRelease, getDatasetRelease, listDatasetReleases } from "../api";
import { LoadBoundary } from "../components/Feedback";
import { JsonInput } from "../components/FormFields";
import { JsonBlock } from "../components/RecordData";
import { RecordDetails } from "../components/RecordDetails";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { DatasetTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import type { Scenario } from "../types";
import { messageFor, parseArray } from "../utils/format";

// Dataset release ledger page.
export function DatasetsPage(): ReactElement {
    const { projectId = "" } = useParams();
    const state = useLoad(() => listDatasetReleases(projectId));
    return (
        <RecordList
            title="Dataset releases"
            detail="Immutable scenario collections used as evaluation input."
            action="Create dataset release"
            actionPath="new"
            state={state}
            projectId={projectId}
            render={(items) => <DatasetTable datasets={items} projectId={projectId} />}
            kind="dataset"
        />
    );
}

// Create an immutable scenario dataset release.
export function DatasetForm(): ReactElement {
    const { projectId = "" } = useParams();
    const navigate = useNavigate();
    const [name, setName] = useState("");
    const [version, setVersion] = useState("");
    const [scenarios, setScenarios] = useState(
        '[\n  {\n    "scenario_id": "",\n    "input": {}\n  }\n]',
    );
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);

    // Persist the immutable record and open its detail page.
    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const release = await createDatasetRelease(
                projectId, name, version, parseArray(scenarios, "Scenarios") as Scenario[],
            );
            navigate(`/projects/${projectId}/datasets/${release.id}`);
        } catch (requestError) {
            setError(messageFor(requestError));
        } finally {
            setSaving(false);
        }
    }
    return (
        <RecordForm
            submitLabel="Create dataset release"
            title="Create dataset release"
            detail="Publish a new immutable version whenever scenario content changes."
            error={error}
            saving={saving}
            onSubmit={submit}
            onCancel={() => navigate(`/projects/${projectId}/datasets`)}
        >
            <div className="form-row">
                <label className="form-field" htmlFor="dataset-name">
                    <span>Dataset name</span>
                    <input
                        id="dataset-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                    />
                </label>
                <label className="form-field" htmlFor="dataset-version">
                    <span>Version</span>
                    <input
                        id="dataset-version"
                        value={version}
                        onChange={(event) => setVersion(event.target.value)}
                        placeholder="1"
                        required
                    />
                </label>
            </div>
            <JsonInput
                id="dataset-scenarios"
                label="Scenarios"
                help="A JSON array of scenario_id and safe input objects."
                value={scenarios}
                onChange={setScenarios}
            />
        </RecordForm>
    );
}

// Dataset release detail page.
export function DatasetDetail(): ReactElement {
    const { projectId = "", recordId = "" } = useParams();
    const state = useLoad(() => getDatasetRelease(projectId, recordId));
    return (
        <LoadBoundary state={state}>{(dataset) => (
            <RecordDetails
                title={`${dataset.dataset_name} v${dataset.version}`}
                detail="Immutable scenario dataset release."
                backTo={`/projects/${projectId}/datasets`}
                backLabel="Back to dataset releases"
                createdAt={dataset.created_at}
                digestLabel="Content digest"
                digest={dataset.content_digest}
            >
                <section className="detail-section">
                    <div className="section-title">
                        <h2>Scenarios</h2>
                        <span>{dataset.scenarios.length} records</span>
                    </div>
                    <div className="scenario-list">
                        {dataset.scenarios.map((scenario) => (
                            <article key={scenario.scenario_id}>
                                <h3>{scenario.scenario_id}</h3>
                                <JsonBlock value={scenario.input} />
                            </article>
                        ))}
                    </div>
                </section>
            </RecordDetails>
        )}</LoadBoundary>
    );
}
