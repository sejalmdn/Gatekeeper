import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getCandidate,
  getDataset,
  getEvaluationRun,
  getRunSettings,
} from "../api";
import { LoadBoundary, Notice } from "../components/Feedback";
import { RecordDetails } from "../components/RecordDetails";
import { useLoad } from "../hooks/useLoad";

// Shows persisted run configuration without implying that a pending run has executed.
export function EvaluationRunDetail(): ReactElement {
  // Reads the project-scoped saved run identity from its shareable URL.
  const { projectId = "", recordId = "" } = useParams();

  // Resolves saved references so confirmation survives refresh and direct navigation.
  const state = useLoad(async () => {
    const run = await getEvaluationRun(projectId, recordId);
    const [candidate, dataset, settings] = await Promise.all([
      getCandidate(projectId, run.candidate_id),
      getDataset(projectId, run.dataset_id),
      getRunSettings(projectId, run.run_settings_id),
    ]);
    return {
      run,
      candidate,
      dataset,
      settings,
    };
  });

  return (
    <LoadBoundary state={state}>
      {({ run, candidate, dataset, settings }) => (
        <RecordDetails
          title="Evaluation run"
          detail="Saved candidate, dataset, and run settings."
          backTo={`/projects/${projectId}/candidates/${candidate.id}`}
          backLabel="Back to candidate"
          createdAt={run.created_at}
        >
          <Notice>
            {run.status === "pending"
              ? "Pending · execution unavailable. This run is saved; no model calls have been made."
              : `Run status: ${run.status}. Execution results are not available on this page.`}
          </Notice>
          <section className="detail-section detail-grid">
            <div>
              <h2>Candidate</h2>
              <Link to={`/projects/${projectId}/candidates/${candidate.id}`}>
                {candidate.name}
              </Link>
            </div>
            <div>
              <h2>Dataset</h2>
              <Link to={`/projects/${projectId}/datasets/${dataset.id}`}>
                {dataset.name}
              </Link>
            </div>
            <div>
              <h2>Attempts per scenario</h2>
              <p>{settings.attempts_per_scenario}</p>
            </div>
            <div>
              <h2>Timeout per attempt</h2>
              <p>{settings.timeout_ms / 1000} seconds</p>
            </div>
            <div>
              <h2>Pass threshold</h2>
              <p>{Number((settings.pass_threshold * 100).toFixed(6))}%</p>
            </div>
          </section>
        </RecordDetails>
      )}
    </LoadBoundary>
  );
}
