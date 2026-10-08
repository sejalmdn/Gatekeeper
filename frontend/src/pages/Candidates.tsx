import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCandidate, getCandidate, listCandidates } from "../api";
import { LoadBoundary } from "../components/Feedback";
import { JsonInput } from "../components/FormFields";
import { JsonBlock } from "../components/RecordData";
import { RecordDetails } from "../components/RecordDetails";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { CandidateTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import { messageFor, parseObject } from "../utils/format";

// Candidate ledger page.
export function CandidatesPage(): ReactElement {
    const { projectId = "" } = useParams();
    const state = useLoad(() => listCandidates(projectId));
    return (
        <RecordList
            title="Candidates"
            detail="Application versions and their frozen runtime configuration."
            action="Create candidate"
            actionPath="new"
            state={state}
            projectId={projectId}
            render={(items) => <CandidateTable candidates={items} projectId={projectId} />}
            kind="candidate"
        />
    );
}

// Create a candidate from an application version and runtime JSON.
export function CandidateForm(): ReactElement {
    const { projectId = "" } = useParams();
    const navigate = useNavigate();
    const [version, setVersion] = useState("");
    const [runtime, setRuntime] = useState('{\n  "model": ""\n}');
    const [error, setError] = useState<string>();
    const [saving, setSaving] = useState(false);

    // Persist the immutable record and open its detail page.
    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const candidate = await createCandidate(
                projectId, version, parseObject(runtime, "Runtime configuration"),
            );
            navigate(`/projects/${projectId}/candidates/${candidate.id}`);
        } catch (requestError) {
            setError(messageFor(requestError));
        } finally {
            setSaving(false);
        }
    }
    return (
        <RecordForm
            submitLabel="Create candidate"
            title="Create candidate"
            detail="Save an immutable application version and runtime configuration."
            error={error}
            saving={saving}
            onSubmit={submit}
            onCancel={() => navigate(`/projects/${projectId}/candidates`)}
        >
            <label className="form-field" htmlFor="application-version">
                <span>Application version</span>
                <input
                    id="application-version"
                    value={version}
                    onChange={(event) => setVersion(event.target.value)}
                    placeholder="2026.09.07"
                    required
                />
            </label>
            <JsonInput
                id="runtime-configuration"
                label="Runtime configuration"
                help="A non-empty JSON object describing the workflow runtime."
                value={runtime}
                onChange={setRuntime}
            />
        </RecordForm>
    );
}

// Candidate detail page.
export function CandidateDetail(): ReactElement {
    const { projectId = "", recordId = "" } = useParams();
    const state = useLoad(() => getCandidate(projectId, recordId));
    return (
        <LoadBoundary state={state}>{(candidate) => (
            <RecordDetails
                title={`Candidate ${candidate.application_version}`}
                detail="Immutable application version and runtime configuration."
                backTo={`/projects/${projectId}/candidates`}
                backLabel="Back to candidates"
                createdAt={candidate.created_at}
                digestLabel="Runtime configuration digest"
                digest={candidate.runtime_configuration_digest}
            >
                <section className="detail-section">
                    <h2>Runtime configuration</h2>
                    <JsonBlock value={candidate.runtime_configuration} />
                </section>
            </RecordDetails>
        )}</LoadBoundary>
    );
}
