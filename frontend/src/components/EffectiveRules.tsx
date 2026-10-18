import type { ReactElement } from "react";
import { listEffectiveRules } from "../api";
import { useLoad } from "../hooks/useLoad";
import type { Scenario } from "../types";
import { LoadBoundary } from "./Feedback";
import { RuleBindingList } from "./RuleBindingList";

interface EffectiveRulesProps {
  projectId: string;
  datasetId: string;
  scenarioId: string;
  scenarios: Scenario[];
}

// Reads the backend's resolved rules so the UI and future evaluations share precedence.
export function EffectiveRules({
  projectId,
  datasetId,
  scenarioId,
  scenarios,
}: EffectiveRulesProps): ReactElement {
  // Loads effective rules for this mounted scenario and never reuses another scenario's result.
  const state = useLoad(() =>
    listEffectiveRules(projectId, datasetId, scenarioId),
  );
  return (
    <LoadBoundary state={state}>
      {(bindings) => (
        <RuleBindingList bindings={bindings} scenarios={scenarios} />
      )}
    </LoadBoundary>
  );
}
