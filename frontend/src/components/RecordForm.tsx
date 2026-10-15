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
  className?: string;
  caption?: ReactNode;
  actionSummary?: ReactNode;
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
  className,
  caption = "Project resource",
  actionSummary,
}: RecordFormProps): ReactElement {
  const formClassName = ["record-form", className].filter(Boolean).join(" ");

  return (
    <section className="page-content form-page">
      <PageHeading title={title} detail={detail} />
      <form className={formClassName} onSubmit={onSubmit} aria-busy={saving}>
        <div className="record-form-caption">{caption}</div>
        {children}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="record-form-actions">
          {actionSummary && (
            <div className="record-form-action-summary">{actionSummary}</div>
          )}
          <div className="record-form-action-buttons">
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
        </div>
      </form>
    </section>
  );
}
