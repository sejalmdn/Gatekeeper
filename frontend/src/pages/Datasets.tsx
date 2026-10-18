import type { ReactElement } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getDataset, listDatasets, listScenarios } from "../api";
import { DatasetRules } from "../components/DatasetRules";
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

  // Keeps the selected dataset section addressable without changing its inputs.
  const [searchParams] = useSearchParams();
  const rulesSelected = searchParams.get("tab") === "rules";

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
          <nav className="dataset-rules__tabs" aria-label="Dataset sections">
            <Link
              to="?tab=scenarios"
              aria-current={!rulesSelected ? "page" : undefined}
            >
              Scenarios
            </Link>
            <Link
              to="?tab=rules"
              aria-current={rulesSelected ? "page" : undefined}
            >
              Rules
            </Link>
          </nav>
          {rulesSelected ? (
            <DatasetRules
              projectId={projectId}
              datasetId={recordId}
              scenarios={scenarios}
            />
          ) : (
            <DatasetScenarioList
              scenarios={scenarios}
              ruleCreatePath={`/projects/${projectId}/datasets/${recordId}/rules/new`}
            />
          )}
        </RecordDetails>
      )}
    </LoadBoundary>
  );
}
