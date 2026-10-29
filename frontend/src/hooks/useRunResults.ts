import { useEffect, useRef, useState } from "react";
import { getRunSummary, listAttemptEvaluations } from "../api";
import type {
  AttemptEvaluationSummary,
  EvaluationRun,
  RunSummary,
} from "../types";
import { messageFor } from "../utils/format";

interface ResultsState {
  identity: string;
  summary?: RunSummary;
  evaluations?: AttemptEvaluationSummary[];
  summaryError?: string;
  evaluationsError?: string;
  loading: boolean;
}

// Reads independent reporting endpoints, serializing cycles and retaining successful data.
export function useRunResults(
  projectId: string,
  runId: string,
  run: EvaluationRun | undefined,
  selected: boolean,
): ResultsState & { retry: () => void } {
  const identity = `${projectId}/${runId}`;
  const status = run?.status;
  const queued = Boolean(run?.queued_at);
  const terminal =
    status === "completed" || status === "failed" || status === "cancelled";

  // Retains each successful endpoint independently across tab switches and read failures.
  const [state, setState] = useState<ResultsState>({ identity, loading: true });

  // Retries reads without mutating persisted execution or reporting data.
  const [revision, setRevision] = useState(0);

  // Prevents a lifecycle transition or Retry from overlapping an unfinished cycle.
  const pending = useRef({ identity, cycle: Promise.resolve() });

  // Refreshes active Results every two seconds and performs the terminal read once.
  useEffect(() => {
    if (!status || (!selected && !terminal)) return;
    if (pending.current.identity !== identity) {
      pending.current = { identity, cycle: Promise.resolve() };
    }
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    function update(values: Partial<ResultsState>): void {
      if (!current) return;
      setState((previous) => ({
        ...(previous.identity === identity
          ? previous
          : { identity, loading: true }),
        ...values,
      }));
    }
    function load(): void {
      const cycle = pending.current.cycle.then(async () => {
        if (!current) return;
        update({ loading: true });
        await Promise.allSettled([
          getRunSummary(projectId, runId).then(
            (summary) => update({ summary, summaryError: undefined }),
            (failure: unknown) => update({ summaryError: messageFor(failure) }),
          ),
          listAttemptEvaluations(projectId, runId).then(
            (evaluations) =>
              update({ evaluations, evaluationsError: undefined }),
            (failure: unknown) =>
              update({ evaluationsError: messageFor(failure) }),
          ),
        ]);
        update({ loading: false });
        if (
          current &&
          selected &&
          (status === "running" || (status === "pending" && queued))
        ) {
          timer = setTimeout(load, 2000);
        }
      });
      pending.current.cycle = cycle;
    }
    load();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [
    projectId,
    runId,
    identity,
    status,
    queued,
    selected,
    terminal,
    revision,
  ]);

  return {
    ...(state.identity === identity ? state : { identity, loading: true }),
    retry: () => setRevision((value) => value + 1),
  };
}
