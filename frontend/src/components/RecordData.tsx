import type { ReactElement } from "react";
import { json, shortDigest, timestamp } from "../utils/format";
import "../styles/RecordData.css";

// Expandable digests expose the complete integrity reference to keyboard and touch users.
export function Digest({ label, value }: { label: string; value: string }): ReactElement {
    return (
        <details className="digest">
            <summary title={value}>
                <span>{label}</span>{" "}{shortDigest(value)}
            </summary>
            <code>{value}</code>
        </details>
    );
}

// Read-only JSON remains selectable and scrollable without widening the page.
export function JsonBlock({ value }: { value: unknown }): ReactElement {
    return (
        <pre className="json-block" tabIndex={0} aria-label="JSON record">
            {json(value)}
        </pre>
    );
}

// Shared metadata for immutable record inspection.
export function RecordMetadata({ createdAt, digestLabel, digest }: {
    createdAt: string;
    digestLabel?: string;
    digest?: string;
}): ReactElement {
    return (
        <dl className="record-metadata">
            <div>
                <dt>Created</dt>
                <dd>{timestamp(createdAt)}</dd>
            </div>
            <div>
                <dt>Record type</dt>
                <dd>Immutable snapshot</dd>
            </div>
            {digestLabel && digest && (
                <div>
                    <dt>{digestLabel}</dt>
                    <dd>
                        <Digest label="sha256" value={digest} />
                    </dd>
                </div>
            )}
        </dl>
    );
}
