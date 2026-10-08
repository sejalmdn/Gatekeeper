import type { ReactElement } from "react";
import type { Candidate, Config, DatasetRelease } from "../types";
import "../styles/FreezeAssembly.css";
import { Icon, type IconName } from "./Icon";
import { Digest } from "./RecordData";

// Show the exact sources copied into an evaluation without implying execution results.
export function FreezeAssembly({ candidate, dataset, config }: {
    candidate?: Candidate;
    dataset?: DatasetRelease;
    config?: Config;
}): ReactElement {
    return (
        <section className="freeze-assembly" aria-label="Frozen evaluation source assembly">
            <div className="freeze-heading">
                <Icon name="lock" />
                <h2>Frozen inputs</h2>
            </div>
            <div className="freeze-sources">
                <SourceTile
                    label="Candidate"
                    icon="candidate"
                    name={candidate?.application_version}
                    digest={candidate?.runtime_configuration_digest}
                />
                <SourceTile
                    label="Dataset release"
                    icon="dataset"
                    name={dataset && `${dataset.dataset_name} v${dataset.version}`}
                    digest={dataset?.content_digest}
                />
                <SourceTile
                    label="Configuration"
                    icon="config"
                    name={config && `${config.name} v${config.version}`}
                    digest={config?.digest}
                />
            </div>
            <div className="freeze-policy">
                <span>
                    {dataset ? `${dataset.scenarios.length} scenarios` : "Dataset not selected"}
                </span>
                <span>{config ? `${config.default_attempts} default attempts per scenario`
                    : "Repeated-run policy not selected"}</span>
            </div>
            <p>Each source is copied into the evaluation record when it is created.</p>
        </section>
    );
}

// One position in the immutable source assembly.
function SourceTile({ label, icon, name, digest }: {
    label: string;
    icon: IconName;
    name?: string;
    digest?: string;
}): ReactElement {
    return (
        <div className="freeze-source">
            <span className="freeze-source-label">
                <Icon name={icon} />
                {label}</span>
            <strong>{name ?? "Not selected"}</strong>
            {digest && <Digest label="sha256" value={digest} />}
        </div>
    );
}
