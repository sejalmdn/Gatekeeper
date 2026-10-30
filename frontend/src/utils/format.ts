import type { JsonObject } from "../types";

// Round displayed measurements to two decimal places while preserving missing values and zero.
export function formatNumber(value: number | null): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en", {
        maximumFractionDigits: 2,
        useGrouping: false,
      }).format(value);
}

// Convert request failures into readable form feedback.
export function messageFor(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

// Format record timestamps in the browser's locale and timezone.
export function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// Format structured values for inspection and editing.
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

// Reject non-object JSON before sending a record to the API.
export function parseObject(value: string, field: string): JsonObject {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON object.`);
  }
  return parsed as JsonObject;
}

// Leave array item validation to the API's scenario contract.
export function parseArray(value: string, field: string): unknown[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error(`${field} must be a JSON array.`);
  }
  return parsed;
}

// Preserve decimal strings so tiny estimates never appear as zero.
export function formatUsd(value: string | null | undefined): string {
  return value == null ? "Unavailable" : value;
}
