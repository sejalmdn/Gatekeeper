import type { ReactElement } from "react";
import { json, timestamp } from "../utils/format";
import "../styles/RecordData.css";

// Read-only JSON remains selectable and scrollable without widening the page.
export function JsonBlock({ value }: { value: unknown }): ReactElement {
  return (
    <pre className="json-block" tabIndex={0} aria-label="JSON record">
      {json(value)}
    </pre>
  );
}

// Shared metadata for resource inspection.
export function RecordMetadata({
  createdAt,
}: {
  createdAt: string;
}): ReactElement {
  return (
    <dl className="record-metadata">
      <div>
        <dt>Created</dt>
        <dd>{timestamp(createdAt)}</dd>
      </div>
    </dl>
  );
}
