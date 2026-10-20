import type { ReactElement } from "react";
import { listRuleBindings } from "../api";
import { useLoad } from "../hooks/useLoad";
import type { Dataset, Scenario } from "../types";
import { DatasetRuleInspector } from "./DatasetRuleInspector";
import { LoadBoundary } from "./Feedback";
import { RuleEditor } from "./RuleEditor";

interface DatasetRuleViewProps {
  projectId: string;
  dataset: Dataset;
  scenarios: Scenario[];
  mode: "inspect" | "add";
  initialScenarioId: string;
  onCancel: () => void;
  onSaved: () => void;
}

// Loads the authoritative bindings needed by one rule-tab view.
export function DatasetRuleView({
  projectId,
  dataset,
  scenarios,
  mode,
  initialScenarioId,
  onCancel,
  onSaved,
}: DatasetRuleViewProps): ReactElement {
  // Reads fresh bindings whenever inspection remounts after a save.
  const state = useLoad(() => listRuleBindings(projectId, dataset.id));

  return (
    <LoadBoundary state={state}>
      {(bindings) =>
        mode === "add" ? (
          <RuleEditor
            projectId={projectId}
            dataset={dataset}
            scenarios={scenarios}
            bindings={bindings}
            initialScenarioId={initialScenarioId}
            onCancel={onCancel}
            onSaved={onSaved}
          />
        ) : (
          <DatasetRuleInspector
            projectId={projectId}
            datasetId={dataset.id}
            scenarios={scenarios}
            bindings={bindings}
          />
        )
      }
    </LoadBoundary>
  );
}
