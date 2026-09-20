import { useState, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    createEvaluation, getEvaluation, listCandidates, listConfigs,
    listDatasetReleases, listEvaluations,
} from "../api";
import { LoadBoundary, Notice } from "../components/Feedback";
import { SourceSelect } from "../components/FormFields";
import { FreezeAssembly } from "../components/FreezeAssembly";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { PageHeading } from "../components/PageHeading";
import { JsonBlock } from "../components/RecordData";
import { RecordDetails } from "../components/RecordDetails";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { EvaluationTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import { messageFor } from "../utils/format";

// Frozen evaluation ledger page.
export function EvaluationsPage(): ReactElement {
    const { projectId = "" } = useParams();
    const state = useLoad(() => listEvaluations(projectId));
    return (
        <RecordList
            title="Evaluations"
            detail="Records that freeze a candidate, dataset release, and configuration together."
            action="New evaluation"
            actionPath="new"
            state={state}
            projectId={projectId}
            render={(items) => (
                <EvaluationTable evaluations={items.slice().reverse()} projectId={projectId} />
            )}
            kind="evaluation"
        />
    );
}

// Contextual creation preserves the underlying list and native dialog keyboard behavior.
export function EvaluationModal(): ReactElement {
    const navigate = useNavigate();
    return (
        <Modal label="New frozen evaluation" onDismiss={() => navigate(-1)}>
            <EvaluationForm onCancel={() => navigate(-1)} />
        </Modal>
    );
}

// Assemble an evaluation from three existing immutable source records.
export function EvaluationForm({ onCancel }: {
    onCancel?: () => void;
}): ReactElement {
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

    // Persist the immutable record and open its detail page.
    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
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
        return <p className="page-state" role="status">Loading source records…</p>;
    }
    if (candidates.error || datasets.error || configs.error) {
        return (
            <p className="page-state page-state-error" role="alert">
                {candidates.error ?? datasets.error ?? configs.error}
            </p>
        );
    }
    if (!candidates.data?.length || !datasets.data?.length || !configs.data?.length) {
        return (
            <section className="page-content">
                <PageHeading
                    title="Create frozen evaluation"
                    detail="Select one candidate, dataset release, and scoring configuration."
                />
                <Notice>
                    Create all three source records before assembling an evaluation:
                    {" "}<Link to={`/projects/${projectId}/candidates/new`}>candidate</Link>,
                    {" "}<Link to={`/projects/${projectId}/datasets/new`}>
                        dataset release
                    </Link>, and
                    {" "}<Link to={`/projects/${projectId}/configs/new`}>configuration</Link>.
                </Notice>
            </section>
        );
    }
    return (
        <RecordForm
            submitLabel="Create frozen evaluation"
            pendingLabel="Freezing…"
            submitDisabled={!candidate || !dataset || !config}
            title="Create frozen evaluation"
            detail="Selected sources are copied into this record and stay fixed after creation."
            error={error}
            saving={saving}
            onSubmit={submit}
            onCancel={onCancel ?? (() => navigate(`/projects/${projectId}/evaluations`))}
        >
            <div className="source-selects">
                <SourceSelect
                    id="candidate"
                    label="Candidate"
                    value={candidateId}
                    onChange={setCandidateId}
                    placeholder="Choose an application version"
                    options={candidates.data.map((item) => ({
                        id: item.id,
                        label: item.application_version,
                    }))}
                />
                <SourceSelect
                    id="dataset"
                    label="Dataset release"
                    value={datasetId}
                    onChange={setDatasetId}
                    placeholder="Choose a scenario collection"
                    options={datasets.data.map((item) => ({
                        id: item.id,
                        label: `${item.dataset_name} v${item.version}`,
                    }))}
                />
                <SourceSelect
                    id="config"
                    label="Configuration"
                    value={configId}
                    onChange={setConfigId}
                    placeholder="Choose thresholds and attempts"
                    options={configs.data.map((item) => ({
                        id: item.id,
                        label: `${item.name} v${item.version}`,
                    }))}
                />
            </div>
            <details className="source-preview">
                <summary><Icon name="lock" />Review frozen inputs and digests</summary>
                <FreezeAssembly candidate={candidate} dataset={dataset} config={config} />
            </details>
            <p className="form-boundary">
                This creates a frozen input record. Execution and scoring are not available yet.
            </p>
        </RecordForm>
    );
}

// Evaluation detail page that privileges its frozen source snapshots.
export function EvaluationDetail(): ReactElement {
    const { projectId = "", recordId = "" } = useParams();
    const state = useLoad(() => getEvaluation(projectId, recordId));
    return (
        <LoadBoundary state={state}>{(evaluation) => (
            <RecordDetails
                title="Frozen evaluation"
                detail="The candidate, dataset, and scoring configuration preserved at creation."
                backTo={`/projects/${projectId}/evaluations`}
                backLabel="Back to evaluations"
                createdAt={evaluation.created_at}
            >
                <FreezeAssembly
                    candidate={evaluation.candidate_snapshot}
                    dataset={evaluation.dataset_release_snapshot}
                    config={evaluation.config_snapshot}
                />
                <section className="detail-section">
                    <h2>Frozen source snapshots</h2>
                    <details open>
                        <summary>
                            Candidate {evaluation.candidate_snapshot.application_version}
                        </summary>
                        <JsonBlock value={evaluation.candidate_snapshot} />
                    </details>
                    <details>
                        <summary>
                            Dataset {evaluation.dataset_release_snapshot.dataset_name}
                            {" "}v{evaluation.dataset_release_snapshot.version}
                        </summary>
                        <JsonBlock value={evaluation.dataset_release_snapshot} />
                    </details>
                    <details>
                        <summary>
                            Configuration {evaluation.config_snapshot.name}
                            {" "}v{evaluation.config_snapshot.version}
                        </summary>
                        <JsonBlock value={evaluation.config_snapshot} />
                    </details>
                </section>
                <Notice>
                    This is an input record. Execution lifecycle, evidence, and reports are not
                    available in this delivery stage.
                </Notice>
            </RecordDetails>
        )}</LoadBoundary>
    );
}
