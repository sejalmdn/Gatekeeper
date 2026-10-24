import type { RuleBinding } from "../types";

// Suggests a readable rule key that is unique within the selected scenario.
export function defaultRuleName(
  scenarioId: string,
  scenarioName: string,
  checkName: string,
  bindings: RuleBinding[],
): string {
  const base = `${scenarioName}_${checkName}`
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  const names = new Set(
    bindings
      .filter((binding) => binding.scenario_id === scenarioId)
      .map((binding) => binding.rule_key),
  );
  let name = base;
  let version = 2;
  while (names.has(name)) {
    name = `${base}_v${version}`;
    version += 1;
  }
  return name;
}
