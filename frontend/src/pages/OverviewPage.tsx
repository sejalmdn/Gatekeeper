import type { ReactElement, ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { listCandidates, listDatasets, listProviders } from "../api";
import { Notice } from "../components/Feedback";
import { Icon, type IconName } from "../components/Icon";
import { PageHeading } from "../components/PageHeading";
import { useLoad, type LoadState } from "../hooks/useLoad";
import type { Project } from "../types";
import "../styles/OverviewPage.css";

interface RecordCountProps {
  tone: RecordCountTone;
  icon: IconName;
  label: string;
  to: string;
  state: LoadState<unknown[]>;
  unit: string;
  badge: string;
  footer: ReactNode;
}

// Identifies the fixed visual treatment for each project resource card.
type RecordCountTone = "providers" | "candidates" | "datasets";

// Project overview presents the resources currently available in the frontend.
export function OverviewPage(): ReactElement {
  const project = useOutletContext<Project>();
  const providers = useLoad(() => listProviders(project.id));
  const candidates = useLoad(() => listCandidates(project.id));
  const datasets = useLoad(() => listDatasets(project.id));
  return (
    <section className="page-content overview-page">
      <PageHeading
        title={`${project.name}`}
        detail="Provider connections, evaluation candidates, and scenario datasets."
        // action={
        //   <Link className="button" to="providers/new">
        //     <Icon name="plus" />
        //     Create provider
        //   </Link>
        // }
      />
      <div className="record-shelf" aria-label="Project record counts">
        <RecordCount
          tone="providers"
          icon="config"
          label="Providers"
          to="providers"
          state={providers}
          unit="Connections"
          badge="Credentials referenced"
          footer="Provider type and endpoint"
        />
        <RecordCount
          tone="candidates"
          icon="candidate"
          label="Candidates"
          to="candidates"
          state={candidates}
          unit="Targets"
          badge="Configured"
          footer="Model, prompt, tools, and parameters"
        />
        <RecordCount
          tone="datasets"
          icon="dataset"
          label="Datasets"
          to="datasets"
          state={datasets}
          unit="Collections"
          badge="Typed scenarios"
          footer="Single-turn, multi-turn, and tool use"
        />
      </div>
      <div className="overview-page__notice">
        <Notice>
          Start an execution from a candidate to collect scenario evidence. Inspect saved runs in Executions.
        </Notice>
      </div>
    </section>
  );
}

// Reusable inventory cards distinguish unloaded records from a real zero count.
function RecordCount({
  tone,
  icon,
  label,
  to,
  state,
  unit,
  badge,
  footer,
}: RecordCountProps): ReactElement {
  return (
    <Link to={to} className={`record-count record-count--${tone}`}>
      <div className="record-count-content">
        <div className="record-count-main">
          <div className="record-count-icon">
            <Icon name={icon} />
          </div>
          <div className="record-count-detail">
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
          </div>
        </div>
        <p>
          {state.error ? (
            "Could not load records"
          ) : state.loading ? (
            "Loading records…"
          ) : null}
        </p>
      </div>
      <div className="record-count-footer">
        <span>{footer}</span>
        <Icon name="arrow" />
      </div>
    </Link>
  );
}
