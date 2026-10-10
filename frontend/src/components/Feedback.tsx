import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LoadState } from "../hooks/useLoad";
import "../styles/Feedback.css";
import { Icon } from "./Icon";

// Read states never substitute unavailable records with fabricated data.
export function LoadBoundary<T>({
  state,
  children,
}: {
  state: LoadState<T>;
  children: (data: T) => ReactNode;
}): ReactElement {
  if (state.loading) {
    return (
      <p className="page-state" role="status">
        Loading records…
      </p>
    );
  }
  if (state.error) {
    return (
      <p className="page-state page-state-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.data === undefined) {
    return <p className="page-state">No record is available.</p>;
  }
  return <>{children(state.data)}</>;
}

// Empty record lists offer a direct route to their creation form.
export function EmptyRecord({
  kind,
  projectId,
}: {
  kind: string;
  projectId: string;
}): ReactElement {
  const records: Record<string, { path: string; action: string }> = {
    provider: { path: "providers", action: "Create provider" },
    candidate: { path: "candidates", action: "Create candidate" },
    dataset: { path: "datasets", action: "Create dataset" },
  };
  const record = records[kind];
  return (
    <div className="empty-state">
      <span className="empty-state-icon">
        <Icon name="folder" />
      </span>
      <h3>No {kind}s yet</h3>
      <p>Create a record to continue setting up this project.</p>
      <Link
        className="button button-secondary"
        to={`/projects/${projectId}/${record.path}/new`}
      >
        <Icon name="plus" />
        {record.action}
      </Link>
    </div>
  );
}

// Explain measurement boundaries alongside the records they qualify.
export function Notice({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="boundary-note">
      <Icon name="info" />
      <p>{children}</p>
    </div>
  );
}
