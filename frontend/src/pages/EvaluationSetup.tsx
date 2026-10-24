import type { ReactElement } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { listCandidates, listDatasets, listRunSettings } from "../api";
import { EvaluationSetupForm } from "../components/EvaluationSetupForm";
import { LoadBoundary } from "../components/Feedback";
import { useLoad } from "../hooks/useLoad";

// Loads project resources and preserves the candidate or dataset entry point.
export function EvaluationSetup(): ReactElement {
  // Resolves project scope independently of any preselected resource.
  const { projectId = "" } = useParams();

  // Carries the originating candidate or dataset into the shared setup form.
  const [params] = useSearchParams();

  // Loads all choices before enabling setup to prevent incomplete submissions.
  const state = useLoad(async () => {
    const [candidates, datasets, settings] = await Promise.all([
      listCandidates(projectId),
      listDatasets(projectId),
      listRunSettings(projectId),
    ]);
    return {
      candidates,
      datasets,
      settings,
    };
  });

  return (
    <LoadBoundary state={state}>
      {(resources) => (
        <EvaluationSetupForm
          key={`${projectId}-${params.toString()}`}
          projectId={projectId}
          initialCandidateId={params.get("candidate") ?? ""}
          initialDatasetId={params.get("dataset") ?? ""}
          {...resources}
        />
      )}
    </LoadBoundary>
  );
}
