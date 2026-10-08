import type { ReactElement, ReactNode } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { listCandidates, listConfigs, listDatasetReleases, listEvaluations } from "../api";
import { EmptyRecord, LoadBoundary, Notice } from "../components/Feedback";
import { Icon } from "../components/Icon";
import { PageHeading } from "../components/PageHeading";
import { EvaluationTable } from "../components/RecordTable";
import { useLoad, type LoadState } from "../hooks/useLoad";
import type { Project } from "../types";
import "../styles/OverviewPage.css";

// Project overview presents real inventory and frozen records in the Stitch layout.
export function OverviewPage(): ReactElement {
    const project = useOutletContext<Project>();
    const projectId = project.id;
    const location = useLocation();
    const candidates = useLoad(() => listCandidates(projectId));
    const datasets = useLoad(() => listDatasetReleases(projectId));
    const configs = useLoad(() => listConfigs(projectId));
    const evaluations = useLoad(() => listEvaluations(projectId));
    const latestCandidate = candidates.data?.at(-1);
    const latestDataset = datasets.data?.at(-1);
    const latestConfig = configs.data?.at(-1);
    const scenarioCount = datasets.data?.reduce((sum, item) => sum + item.scenarios.length, 0);
    return (
        <section className="page-content">
            <PageHeading
                title={`Project overview // ${project.name}`}
                detail="Versioned candidates, scenario datasets, and frozen evaluation inputs."
                context={<span className="badge badge-amber">Project :: {project.name}</span>}
                action={<Link className="button" to="evaluations/new"
                    state={{ backgroundLocation: location }}>
                    <Icon name="plus" />New evaluation
                </Link>}
            />
            <div className="record-shelf" aria-label="Project record counts">
                <RecordCount label="Candidates" to="candidates" state={candidates}
                    unit="Versions" badge="Registered"
                    detail={latestCandidate?.application_version}
                    footer="Application + runtime configuration" />
                <RecordCount label="Datasets" to="datasets" state={datasets}
                    unit="Releases" badge="Immutable"
                    detail={latestDataset
                        && `${latestDataset.dataset_name} v${latestDataset.version}`}
                    footer={scenarioCount !== undefined
                        ? `${scenarioCount} scenario entries across releases`
                        : "Versioned scenario inputs"} />
                <RecordCount label="Configurations" to="configs" state={configs}
                    unit="Policies" badge="Versioned"
                    detail={latestConfig && `${latestConfig.name} v${latestConfig.version}`}
                    footer="Thresholds, weights, and attempts" />
                <RecordCount label="Evaluations" to="evaluations" state={evaluations}
                    unit="Records" badge="Frozen inputs"
                    detail={evaluations.data?.length ? "Sources preserved" : undefined}
                    footer="Execution and reports unavailable" />
            </div>
            <section className="overview-records" aria-labelledby="recent-evaluations">
                <div className="overview-section-heading">
                    <h2 id="recent-evaluations">
                        <span className="status-dot" />Recent project evaluations
                    </h2>
                    <Link className="quiet-link" to="evaluations">View all evaluations</Link>
                </div>
                <LoadBoundary state={evaluations}>
                    {(items) => items.length ? (
                        <EvaluationTable evaluations={items.slice(-5).reverse()}
                            projectId={projectId} />
                    ) : <EmptyRecord kind="evaluation" projectId={projectId} />}
                </LoadBoundary>
                <div className="overview-records-footer">
                    <span>
                        <Icon name="lock" />Candidate, dataset, and configuration stay fixed.
                    </span>
                    <Link className="button button-secondary" to="configs">
                        <Icon name="config" />Scoring configurations
                    </Link>
                </div>
            </section>
            <Notice>
                <strong>Evaluation inputs only.</strong> Execution, evidence, and reports are not
                available yet. A frozen record does not indicate an evaluation result.
            </Notice>
        </section>
    );
}

// Reusable inventory cards distinguish unloaded records from a real zero count.
function RecordCount({ label, to, state, unit, badge, detail, footer }: {
    label: string;
    to: string;
    state: LoadState<unknown[]>;
    unit: string;
    badge: string;
    detail?: string;
    footer: ReactNode;
}): ReactElement {
    return (
        <Link to={to} className="record-count">
            <div className="record-count-heading">
                <span>{label}</span><span className="badge">{badge}</span>
            </div>
            <div className="record-count-value">
                <strong>{state.data ? String(state.data.length).padStart(2, "0") : "—"}</strong>
                <span>{unit}</span>
            </div>
            <p>{state.error ? "Could not load records" : state.loading ? "Loading records…"
                : <><span>Latest: </span><strong>{detail ?? "No records yet"}</strong></>}</p>
            <div className="record-count-footer"><span>{footer}</span><Icon name="arrow" /></div>
        </Link>
    );
}
