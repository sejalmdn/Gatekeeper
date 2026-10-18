import type { ReactElement } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getDataset, listRuleBindings, listScenarios } from "../api";
import { LoadBoundary } from "../components/Feedback";
import { RuleEditor } from "../components/RuleEditor";
import { useLoad } from "../hooks/useLoad";

// Loads dataset scope before opening the private rule definition form.
export function RuleForm(): ReactElement {
  // Reads ownership and the optional scenario shortcut from the route.
  const { projectId = "", recordId = "" } = useParams();

  // Keeps a scenario shortcut in the URL so the form can be bookmarked.
  const [searchParams] = useSearchParams();

  // Loads the immutable scenarios and current keys required for scope validation.
  const state = useLoad(async () => {
    const [dataset, scenarios, bindings] = await Promise.all([
      getDataset(projectId, recordId),
      listScenarios(projectId, recordId),
      listRuleBindings(projectId, recordId),
    ]);
    return {
      dataset,
      scenarios,
      bindings,
    };
  });

  return (
    <LoadBoundary state={state}>
      {({ dataset, scenarios, bindings }) => (
        <RuleEditor
          projectId={projectId}
          dataset={dataset}
          scenarios={scenarios}
          bindings={bindings}
          initialScenarioId={searchParams.get("scenario") ?? ""}
        />
      )}
    </LoadBoundary>
  );
}
