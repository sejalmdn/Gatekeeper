import type { ReactElement } from "react";
import { useParams } from "react-router-dom";
import { getDataset, listDatasets, listScenarios } from "../api";
import { DatasetScenarioList } from "../components/DatasetScenarioList";
import { LoadBoundary } from "../components/Feedback";
import { RecordDetails } from "../components/RecordDetails";
import { RecordList } from "../components/RecordList";
import { DatasetTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";

// Dataset list page.
export function DatasetsPage(): ReactElement {
  // Reads the project scope for dataset collection requests.
  const { projectId = "" } = useParams();

  // Loads the project's immutable datasets for the collection page.
  const state = useLoad(() => listDatasets(projectId));
  return (
    <RecordList
      title="Datasets"
      detail="Collections of typed evaluation scenarios."
      action="Create dataset"
      actionPath="new"
      state={state}
      projectId={projectId}
      render={(items) => (
        <DatasetTable datasets={items} projectId={projectId} />
      )}
      kind="dataset"
    />
  );
}

// Dataset detail loads the container and its scenarios from separate resources.
export function DatasetDetail(): ReactElement {
  // Reads the project and dataset scopes for immutable detail requests.
  const { projectId = "", recordId = "" } = useParams();

  // Loads immutable dataset metadata and scenarios for inspection together.
  const state = useLoad(async () => ({
    dataset: await getDataset(projectId, recordId),
    scenarios: await listScenarios(projectId, recordId),
  }));
  return (
    <LoadBoundary state={state}>
      {({ dataset, scenarios }) => (
        <RecordDetails
          title={dataset.name}
          detail={dataset.description ?? "Scenario dataset"}
          backTo={`/projects/${projectId}/datasets`}
          backLabel="Back to datasets"
          createdAt={dataset.created_at}
        >
          <DatasetScenarioList scenarios={scenarios} />
        </RecordDetails>
      )}
    </LoadBoundary>
  );
}
