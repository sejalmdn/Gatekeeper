import { useEffect, useState } from "react";
import { listRuleBindings } from "../api";
import type { RuleBinding } from "../types";
import { messageFor } from "../utils/format";
import type { LoadState } from "./useLoad";

// Loads scenario bindings independently of inputs and supports save refreshes and retries.
export function useDatasetBindings(projectId: string, datasetId: string) {
  // Keeps unavailable bindings distinct from a successfully loaded empty collection.
  const [state, setState] = useState<LoadState<RuleBinding[]>>({
    loading: true,
  });

  // Invalidates saved bindings without remounting the selected scenario or its input.
  const [revision, setRevision] = useState(0);

  // Discards stale responses after navigation, retry, or a successful save.
  useEffect(() => {
    let active = true;
    void listRuleBindings(projectId, datasetId)
      .then((bindings) => {
        if (active) {
          setState({
            data: bindings.filter((binding) => binding.scenario_id !== null),
            loading: false,
          });
        }
      })
      .catch((failure: unknown) => {
        if (active) setState({ error: messageFor(failure), loading: false });
      });
    return () => {
      active = false;
    };
  }, [projectId, datasetId, revision]);

  // Clears stale counts while fetching authoritative bindings again.
  function reload(): void {
    setState({ loading: true });
    setRevision((current) => current + 1);
  }

  return { state, reload };
}
