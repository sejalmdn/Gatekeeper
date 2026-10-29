import { formatNumber } from "./format";

// Formats supplied rates while preserving an unavailable denominator.
export function percent(value: number | null): string {
  return value === null ? "Unavailable" : `${formatNumber(value * 100)}%`;
}

// Makes known reporting states readable while retaining codes in the calling view.
export function resultLabel(code: string): string {
  const labels: Record<string, string> = {
    not_evaluated: "Ungraded",
    cannot_evaluate: "Cannot evaluate",
    no_scored_rules: "No scored rules are configured.",
    incomplete_scored_results:
      "Score unavailable until all planned scored results are decisive.",
    insufficient_repeats:
      "Insufficient repeats: at least two decisive attempts are needed.",
    no_required_checks: "No required checks are configured.",
    missing_attempts: "Some planned attempts are missing.",
    invocation_unsuccessful: "Some invocations did not complete successfully.",
    missing_evidence: "Execution evidence is missing.",
    missing_evaluation: "Some attempts have no stored evaluation.",
    non_decisive_evaluation: "Some evaluations have no decisive outcome.",
    unknown_automatic_validation:
      "Some automatic tool checks could not be resolved.",
    incomplete_rule_results:
      "Some authored rule results are missing or undecidable.",
    frozen_snapshot_unavailable:
      "Frozen evaluation configuration is unavailable for this run.",
    stored_summary_unavailable:
      "The stored report is unavailable for this finished run.",
  };
  return labels[code] ?? code.replaceAll("_", " ");
}

// Presents outcome counts without combining execution, rule, and grading denominators.
export function resultCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([key, count]) => `${resultLabel(key)}: ${count}`)
    .join(" · ");
}

// Distinguishes grading outcomes with symbols as well as text and border treatments.
export function resultSymbol(verdict: string): string {
  const symbols: Record<string, string> = {
    pass: "✓",
    fail: "×",
    error: "!",
    cannot_evaluate: "?",
    not_evaluated: "○",
  };
  return symbols[verdict] ?? "?";
}
