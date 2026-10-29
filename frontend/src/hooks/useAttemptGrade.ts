import { useEffect, useState } from "react";
import { getAttemptEvaluation } from "../api";
import type {
  AttemptEvaluationDetail,
  AttemptEvaluationSummary,
} from "../types";
import { messageFor } from "../utils/format";

// Loads only the selected grade and invalidates it when lightweight evaluation metadata changes.
export function useAttemptGrade(
  projectId: string,
  runId: string,
  attempt: AttemptEvaluationSummary,
) {
  const identity = `${projectId}/${runId}/${attempt.id}/${attempt.status}/${attempt.verdict}/${attempt.evaluated_at}`;

  // Associates responses with their selection so obsolete grades cannot appear under another attempt.
  const [state, setState] = useState<{
    identity: string;
    data?: AttemptEvaluationDetail;
    error?: string;
  }>();

  // Allows read failures to be retried without changing the selected attempt.
  const [revision, setRevision] = useState(0);

  // Ignores responses after selection, evaluation metadata, or route changes.
  useEffect(() => {
    let current = true;
    void getAttemptEvaluation(projectId, runId, attempt.id).then(
      (data) => current && setState({ identity, data }),
      (failure: unknown) =>
        current && setState({ identity, error: messageFor(failure) }),
    );
    return () => {
      current = false;
    };
  }, [projectId, runId, attempt.id, identity, revision]);

  return {
    ...(state?.identity === identity ? state : {}),
    retry: () => setRevision((value) => value + 1),
  };
}
