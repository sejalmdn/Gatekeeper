import type { ReactElement, ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  // Keeps list filters in the URL so searches survive navigation and refreshes.
  const [searchParams, setSearchParams] = useSearchParams();

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
      <label className="record-list-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label={`Search ${title.toLowerCase()}`}
          placeholder={`Search ${title.toLowerCase()}…`}
          value={searchParams.get("q") ?? ""}
          onChange={(event) => {
            const next = new URLSearchParams(searchParams);
            if (event.target.value) {
              next.set("q", event.target.value);
            } else {
              next.delete("q");
            }
            setSearchParams(next, { replace: true });
          }}
        />
      </label>
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
