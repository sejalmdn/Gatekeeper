import type { ReactElement } from "react";
import { getDataset, listScenarios } from "../api";
import { DatasetWorkspace } from "../components/DatasetWorkspace";
import { LoadBoundary } from "../components/Feedback";
import { useLoad } from "../hooks/useLoad";

// Loads one dataset's immutable records independently of its rule bindings.
export function DatasetDetailContent({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}): ReactElement {
  // Loads the container and scenario inputs together for this mounted dataset scope.
  const state = useLoad(async () => {
    const [dataset, scenarios] = await Promise.all([
      getDataset(projectId, datasetId),
      listScenarios(projectId, datasetId),
    ]);
    return { dataset, scenarios };
  });
  return (
    <LoadBoundary state={state}>
      {({ dataset, scenarios }) => (
        <DatasetWorkspace
          projectId={projectId}
          dataset={dataset}
          scenarios={scenarios}
        />
      )}
    </LoadBoundary>
  );
}
