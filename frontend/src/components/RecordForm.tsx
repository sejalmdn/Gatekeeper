import type { FormEvent, ReactElement, ReactNode } from "react";
import { Icon } from "./Icon";
import { PageHeading } from "./PageHeading";
import "../styles/RecordForm.css";

interface RecordFormProps {
  title: string;
  detail: string;
  error?: string;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  submitDisabled?: boolean;
}

// Creation form shell keeps errors, pending state, and cancellation in one place.
export function RecordForm({
  title,
  detail,
  error,
  saving,
  onSubmit,
  onCancel,
  children,
  submitLabel,
  pendingLabel = "Creating…",
  submitDisabled = false,
}: RecordFormProps): ReactElement {
  return (
    <section className="page-content form-page">
      <PageHeading title={title} detail={detail} />
      <form className="record-form" onSubmit={onSubmit} aria-busy={saving}>
        <div className="record-form-caption">Project resource</div>
        {children}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="record-form-actions">
          <button
            className="quiet-button"
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving || submitDisabled}>
            <Icon name="plus" />
            {saving ? pendingLabel : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
