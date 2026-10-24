import type { ReactElement } from "react";
import { getCandidate, getProvider } from "../api";
import { CandidateDetails } from "../components/CandidateDetails";
import { LoadBoundary } from "../components/Feedback";
import { useLoad } from "../hooks/useLoad";

// Loads one candidate and its optional provider label for the inspection page.
export function CandidateDetailContent({
  projectId,
  candidateId,
}: {
  projectId: string;
  candidateId: string;
}): ReactElement {
  // Keeps the candidate readable even when its provider metadata cannot be fetched.
  const state = useLoad(async () => {
    const candidate = await getCandidate(projectId, candidateId);
    const provider = await getProvider(projectId, candidate.provider_id).catch(
      () => undefined,
    );
    return { candidate, provider };
  });

  return (
    <LoadBoundary state={state}>
      {({ candidate, provider }) => (
        <CandidateDetails
          candidate={candidate}
          provider={provider}
          projectId={projectId}
        />
      )}
    </LoadBoundary>
  );
}
