import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createConfig, getConfig, listConfigs } from "../api";
import { LoadBoundary } from "../components/Feedback";
import { JsonInput } from "../components/FormFields";
import { JsonBlock } from "../components/RecordData";
import { RecordDetails } from "../components/RecordDetails";
import { RecordForm } from "../components/RecordForm";
import { RecordList } from "../components/RecordList";
import { ConfigTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import { messageFor, parseObject } from "../utils/format";

// Evaluator and scoring configuration ledger page.
export function ConfigsPage(): ReactElement {
    const { projectId = "" } = useParams();
    const state = useLoad(() => listConfigs(projectId));
    return (
        <RecordList
            title="Configurations"
            detail="Versioned thresholds, severity weights, and repeated-run policy."
            action="Create configuration"
            actionPath="new"
            state={state}
            projectId={projectId}
            render={(items) => <ConfigTable configs={items} projectId={projectId} />}
            kind="configuration"
        />
    );
}

// Create an immutable evaluator and scoring configuration release.
export function ConfigForm(): ReactElement {
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

    // Persist the immutable record and open its detail page.
    async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
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
    return (
        <RecordForm
            submitLabel="Create configuration"
            title="Create configuration"
            detail="Version thresholds, severity weights, and the repeated-run policy."
            error={error}
            saving={saving}
            onSubmit={submit}
            onCancel={() => navigate(`/projects/${projectId}/configs`)}
        >
            <div className="form-row">
                <label className="form-field" htmlFor="config-name">
                    <span>Configuration name</span>
                    <input
                        id="config-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                    />
                </label>
                <label className="form-field" htmlFor="config-version">
                    <span>Version</span>
                    <input
                        id="config-version"
                        value={version}
                        onChange={(event) => setVersion(event.target.value)}
                        placeholder="1"
                        required
                    />
                </label>
            </div>
            <label className="form-field" htmlFor="default-attempts">
                <span>Default attempts</span>
                <small>Positive whole number used by the repeated-run policy.</small>
                <input
                    id="default-attempts"
                    type="number"
                    min="1"
                    step="1"
                    value={attempts}
                    onChange={(event) => setAttempts(event.target.value)}
                    required
                />
            </label>
            <JsonInput
                id="config-settings"
                label="Evaluator settings"
                help="A JSON object retained as versioned evaluator configuration."
                value={settings}
                onChange={setSettings}
            />
            <div className="form-row">
                <JsonInput
                    id="config-thresholds"
                    label="Thresholds"
                    help="A non-empty JSON object with numeric values."
                    value={thresholds}
                    onChange={setThresholds}
                />
                <JsonInput
                    id="config-weights"
                    label="Severity weights"
                    help="A non-empty JSON object with positive numeric values."
                    value={weights}
                    onChange={setWeights}
                />
            </div>
        </RecordForm>
    );
}

// Configuration release detail page.
export function ConfigDetail(): ReactElement {
    const { projectId = "", recordId = "" } = useParams();
    const state = useLoad(() => getConfig(projectId, recordId));
    return (
        <LoadBoundary state={state}>{(config) => (
            <RecordDetails
                title={`${config.name} v${config.version}`}
                detail="Immutable evaluator and scoring configuration release."
                backTo={`/projects/${projectId}/configs`}
                backLabel="Back to configurations"
                createdAt={config.created_at}
                digestLabel="Configuration digest"
                digest={config.digest}
            >
                <div className="policy-strip">
                    <span>Repeated-run policy</span>
                    <strong>{config.default_attempts} attempts by default</strong>
                </div>
                <section className="detail-grid">
                    <div>
                        <h2>Thresholds</h2>
                        <JsonBlock value={config.thresholds} />
                    </div>
                    <div>
                        <h2>Severity weights</h2>
                        <JsonBlock value={config.weights} />
                    </div>
                </section>
                <section className="detail-section">
                    <h2>Evaluator settings</h2>
                    <JsonBlock value={config.settings} />
                </section>
            </RecordDetails>
        )}</LoadBoundary>
    );
}
