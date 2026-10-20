import { useState, type ReactElement } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Dataset, Scenario } from "../types";
import { DatasetRuleView } from "./DatasetRuleView";
import "../styles/RuleForm.css";

interface DatasetRulesProps {
  projectId: string;
  dataset: Dataset;
  scenarios: Scenario[];
}

// Makes the dataset rule area the single place to inspect and create rules.
export function DatasetRules({
  projectId,
  dataset,
  scenarios,
}: DatasetRulesProps): ReactElement {
  // Keeps the inspect/add mode addressable in the dataset URL.
  const [searchParams, setSearchParams] = useSearchParams();

  // Forces authoritative inspection data to reload after a successful save.
  const [inspectionRevision, setInspectionRevision] = useState(0);
  const mode = searchParams.get("view") === "add" ? "add" : "inspect";
  const initialScenarioId = searchParams.get("scenario") ?? "";

  // Returns to inspection while preserving the dataset's outer rule tab.
  function showInspector(): void {
    setSearchParams({ tab: "rules", view: "inspect" });
  }

  // Reloads saved bindings before showing the inspection view.
  function finishSave(): void {
    setInspectionRevision((current) => current + 1);
    showInspector();
  }

  return (
    <section className="dataset-rules detail-section">
      <div className="section-title">
        <div>
          <h2>Evaluation rules</h2>
          <p>
            Private expectations used to evaluate candidate responses and tool
            requests.
          </p>
        </div>
      </div>
      <nav className="dataset-rules__inner-tabs" aria-label="Evaluation rules">
        <Link
          to="?tab=rules&view=inspect"
          aria-current={mode === "inspect" ? "page" : undefined}
        >
          Inspect rules
        </Link>
        <Link
          to="?tab=rules&view=add"
          aria-current={mode === "add" ? "page" : undefined}
        >
          Add rule
        </Link>
      </nav>
      <DatasetRuleView
        key={mode === "inspect" ? `inspect-${inspectionRevision}` : "add"}
        projectId={projectId}
        dataset={dataset}
        scenarios={scenarios}
        mode={mode}
        initialScenarioId={initialScenarioId}
        onCancel={showInspector}
        onSaved={finishSave}
      />
    </section>
  );
}
