import type { ReactElement } from "react";
import type { ExecutionAttempt } from "../types";
import { ExecutionAttempts } from "./ExecutionAttempts";

interface RunEvidenceProps {
  cancelled: boolean;
  attempts: ExecutionAttempt[];
  projectId: string;
  runId: string;
  opened?: string;
  onOpen: (id?: string) => void;
}

// Keeps provider evidence inspection available regardless of reporting state.
export function RunEvidence({
  cancelled,
  attempts,
  ...props
}: RunEvidenceProps): ReactElement {
  if (cancelled && attempts.length === 0) {
    return <p>This run was cancelled before attempts were allocated.</p>;
  }
  return <ExecutionAttempts attempts={attempts} {...props} />;
}
