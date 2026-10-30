import type { BindingSummary } from "../types";

// Labels aggregate rule results without treating incomplete outcomes as passing.
export function ruleStatus(rule: BindingSummary): string {
  if (rule.outcome_counts.fail > 0) return "Failing";
  if (
    rule.planned_results > 0 &&
    rule.outcome_counts.pass === rule.planned_results
  )
    return "Passing";
  return "Unresolved";
}
