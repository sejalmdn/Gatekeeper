import type { ReactElement } from "react";
import { useParams } from "react-router-dom";
import { listDatasets } from "../api";
import { RecordList } from "../components/RecordList";
import { DatasetTable } from "../components/RecordTable";
import { useLoad } from "../hooks/useLoad";
import { DatasetDetailContent } from "./DatasetDetailContent";

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

  return (
    <DatasetDetailContent
      key={`${projectId}-${recordId}`}
      projectId={projectId}
      datasetId={recordId}
    />
  );
}
