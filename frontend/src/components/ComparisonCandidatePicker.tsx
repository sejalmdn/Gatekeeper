import type { Candidate, EvaluationRun, RunSettings } from "../types";
import { timestamp } from "../utils/format";

interface ComparisonCandidatePickerProps {
  side: "A" | "B";
  candidates: Candidate[];
  runs: EvaluationRun[];
  settings: RunSettings[];
  candidateId: string;
  runId: string;
  onCandidate: (id: string) => void;
  onRun: (id: string) => void;
}

// Lists saved runs for one candidate so evidence selection stays explicit.
export function ComparisonCandidatePicker({
  side,
  candidates,
  runs,
  settings,
  candidateId,
  runId,
  onCandidate,
  onRun,
}: ComparisonCandidatePickerProps) {
  const options = runs.filter((run) => run.candidate_id === candidateId);
  return (
    <section className="compare-candidates__candidate">
      <span className="run-comparison__eyebrow">Run {side}</span>
      <label className="compare-candidates__label">
        Candidate {side}
        <select
          value={candidateId}
          onChange={(event) => onCandidate(event.target.value)}
        >
          <option value="">Select a candidate</option>
          {candidateId &&
            !candidates.some((candidate) => candidate.id === candidateId) && (
              <option value={candidateId}>
                Unavailable candidate: {candidateId}
              </option>
            )}
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} · {candidate.model_name}
            </option>
          ))}
        </select>
      </label>
      {!candidateId && <p>Select a candidate to see its saved runs.</p>}
      {candidateId && (
        <fieldset className="compare-candidates__runs">
          <legend>Select Run {side}</legend>
          {options.length === 0 && (
            <p>No compatible terminal runs for this candidate.</p>
          )}
          {runId && !options.some((run) => run.id === runId) && (
            <p role="alert">
              Selected run {runId} is unavailable or incompatible. Choose
              another run.
            </p>
          )}
          {options.map((run) => {
            const repeats = settings.find(
              (entry) => entry.id === run.run_settings_id,
            )?.attempts_per_scenario;
            return (
              <label className="compare-candidates__run" key={run.id}>
                <input
                  type="radio"
                  name={`run${side}`}
                  value={run.id}
                  checked={runId === run.id}
                  onChange={() => onRun(run.id)}
                />
                <span>
                  <strong>{timestamp(run.created_at)}</strong>
                  <small>
                    {repeats === undefined
                      ? "Attempts unavailable"
                      : `${repeats} attempts / scenario`}
                    {" · "}
                    <code>{run.id.slice(0, 8)}</code>
                  </small>
                </span>
                <span className="compare-candidates__status">{run.status}</span>
              </label>
            );
          })}
        </fieldset>
      )}
    </section>
  );
}
