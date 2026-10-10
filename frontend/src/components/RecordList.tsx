import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LoadState } from "../hooks/useLoad";
import { EmptyRecord, LoadBoundary } from "./Feedback";
import { Icon } from "./Icon";
import { PageHeading } from "./PageHeading";
import "../styles/RecordList.css";

interface RecordListProps<T> {
  title: string;
  detail: string;
  action: string;
  actionPath: string;
  state: LoadState<T[]>;
  projectId: string;
  render: (items: T[]) => ReactNode;
  kind: string;
}

// Shared list frame preserves record counts, empty states, and creation actions.
export function RecordList<T>({
  title,
  detail,
  action,
  actionPath,
  state,
  projectId,
  render,
  kind,
}: RecordListProps<T>): ReactElement {
  return (
    <section className="page-content">
      <PageHeading
        title={title}
        detail={detail}
        action={
          <Link className="button" to={actionPath}>
            <Icon name="plus" />
            {action}
          </Link>
        }
      />
      <div className="record-list">
        <div className="record-list-header">
          <h2>
            All records
            <span>{state.data?.length ?? "—"}</span>
          </h2>
          <span className="record-list-note">Project scoped</span>
        </div>
        <LoadBoundary state={state}>
          {(items) =>
            items.length ? (
              render(items)
            ) : (
              <EmptyRecord kind={kind} projectId={projectId} />
            )
          }
        </LoadBoundary>
      </div>
    </section>
  );
}
