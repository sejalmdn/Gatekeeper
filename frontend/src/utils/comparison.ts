import { formatNumber } from "./format";

// Format observed rates without turning unavailable evidence into a zero.
export function comparisonRate(value: number | null): string {
  return value === null ? "Unavailable" : `${formatNumber(value * 100)}%`;
}

// Preserve decimal strings while giving signed numerical differences consistent units.
export function comparisonValue(
  value: number | string | null | undefined,
): string {
  if (value == null) return "Unavailable";
  return typeof value === "string" ? value : formatNumber(value);
}

// Label differences as B minus A without assigning a regression or winner.
export function comparisonDelta(value: number | null, unit = "pp"): string {
  if (value === null) return "Unavailable";
  return `${value > 0 ? "+" : ""}${formatNumber(value)} ${unit}`;
}

// Classifies a saved numerical difference without rounding decimal money strings.
export function comparisonDirection(
  value: number | string | null | undefined,
): "positive" | "negative" | "neutral" {
  if (value == null) return "neutral";
  if (typeof value === "number") {
    if (value > 0) return "positive";
    if (value < 0) return "negative";
    return "neutral";
  }
  if (!/[1-9]/.test(value)) return "neutral";
  return value.startsWith("-") ? "negative" : "positive";
}

// Maps reduced resource usage to favorable colors while preserving the signed difference.
export function comparisonMetricDirection(
  value: number | string | null | undefined,
): "positive" | "negative" | "neutral" {
  const direction = comparisonDirection(value);
  if (direction === "negative") return "positive";
  if (direction === "positive") return "negative";
  return "neutral";
}
