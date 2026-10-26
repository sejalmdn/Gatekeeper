import type { ReactElement, ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { listCandidates, listDatasets, listProviders } from "../api";
import { Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { PageHeading } from "../components/PageHeading";
import { useLoad, type LoadState } from "../hooks/useLoad";
import type { Project } from "../types";
import "../styles/OverviewPage.css";

interface RecordCountProps {
  label: string;
  to: string;
  state: LoadState<unknown[]>;
  unit: string;
  badge: string;
  detail?: string;
  footer: ReactNode;
}

// Project overview presents the resources currently available in the frontend.
export function OverviewPage(): ReactElement {
  const project = useOutletContext<Project>();
  const providers = useLoad(() => listProviders(project.id));
  const candidates = useLoad(() => listCandidates(project.id));
  const datasets = useLoad(() => listDatasets(project.id));
  return (
    <section className="page-content">
      <PageHeading
        title={`Project overview // ${project.name}`}
        detail="Provider connections, evaluation candidates, and scenario datasets."
        context={
          <span className="badge badge-amber">Project :: {project.name}</span>
        }
        action={
          <Link className="button" to="providers/new">
            <Icon name="plus" />
            Create provider
          </Link>
        }
      />
      <div className="record-shelf" aria-label="Project record counts">
        <RecordCount
          label="Providers"
          to="providers"
          state={providers}
          unit="Connections"
          badge="Credentials referenced"
          detail={providers.data?.at(-1)?.name}
          footer="Provider type and endpoint"
        />
        <RecordCount
          label="Candidates"
          to="candidates"
          state={candidates}
          unit="Targets"
          badge="Configured"
          detail={candidates.data?.at(-1)?.name}
          footer="Model, prompt, tools, and parameters"
        />
        <RecordCount
          label="Datasets"
          to="datasets"
          state={datasets}
          unit="Collections"
          badge="Typed scenarios"
          detail={datasets.data?.at(-1)?.name}
          footer="Single-turn, multi-turn, and tool use"
        />
      </div>
      <Notice>
        Start an execution from a candidate to collect scenario evidence.
        Inspect saved runs in Executions. Rule grading is not available yet.
      </Notice>
    </section>
  );
}

// Reusable inventory cards distinguish unloaded records from a real zero count.
function RecordCount({
  label,
  to,
  state,
  unit,
  badge,
  detail,
  footer,
}: RecordCountProps): ReactElement {
  return (
    <Link to={to} className="record-count">
      <div className="record-count-heading">
        <span>{label}</span>
        <span className="badge">{badge}</span>
      </div>
      <div className="record-count-value">
        <strong>
          {state.data ? String(state.data.length).padStart(2, "0") : "—"}
        </strong>
        <span>{unit}</span>
      </div>
      <p>
        {state.error ? (
          "Could not load records"
        ) : state.loading ? (
          "Loading records…"
        ) : (
          <>
            <span>Latest: </span>
            <strong>{detail ?? "No records yet"}</strong>
          </>
        )}
      </p>
      <div className="record-count-footer">
        <span>{footer}</span>
        <Icon name="arrow" />
      </div>
    </Link>
  );
}
