import { useEffect, useState } from "react";
import {
  getCandidate,
  getDataset,
  getEvaluationRun,
  getRunSettings,
  listExecutionAttempts,
} from "../api";
import type {
  Candidate,
  Dataset,
  EvaluationRun,
  ExecutionAttempt,
  RunSettings,
} from "../types";
import { messageFor } from "../utils/format";

interface RunData {
  run: EvaluationRun;
  candidate: Candidate;
  dataset: Dataset;
  settings: RunSettings;
  attempts: ExecutionAttempt[];
}

// Polls active executions without discarding evidence on a refresh error.
export function useExecutionRun(projectId: string, runId: string) {
  // Retains the most recent successful response when progress reads fail.
  const [data, setData] = useState<RunData>();

  // Distinguishes a refresh failure from the initial loading state.
  const [failure, setFailure] = useState<{
    projectId: string;
    runId: string;
    message: string;
  }>();

  // Restarts reads after an explicit refresh or lifecycle action.
  const [revision, setRevision] = useState(0);

  // Serializes progress reads and stops scheduling after completion or unmount.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let references: Omit<RunData, "run" | "attempts"> | undefined;
    async function load(): Promise<void> {
      try {
        const run = await getEvaluationRun(projectId, runId);
        const attempts = await listExecutionAttempts(projectId, runId);
        if (!references) {
          const [candidate, dataset, settings] = await Promise.all([
            getCandidate(projectId, run.candidate_id),
            getDataset(projectId, run.dataset_id),
            getRunSettings(projectId, run.run_settings_id),
          ]);
          references = {
            candidate,
            dataset,
            settings,
          };
        }
        if (!active) return;
        setData({
          ...references,
          run,
          attempts,
        });
        setFailure(undefined);
        if (
          run.status === "running" ||
          (run.status === "pending" && run.queued_at)
        ) {
          timer = setTimeout(() => void load(), 2000);
        }
      } catch (error) {
        if (active)
          setFailure({ projectId, runId, message: messageFor(error) });
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [projectId, runId, revision]);

  return {
    data:
      data?.run.id === runId && data.run.project_id === projectId
        ? data
        : undefined,
    error:
      failure?.projectId === projectId && failure.runId === runId
        ? failure.message
        : undefined,
    refresh: () => setRevision((value) => value + 1),
  };
}
