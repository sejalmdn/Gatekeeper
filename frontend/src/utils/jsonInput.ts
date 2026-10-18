// Reports JSON syntax errors without rewriting incomplete user input.
export function jsonInputError(
  value: string,
  required: boolean,
): string | undefined {
  if (!value.trim()) {
    return required ? "Enter a JSON value." : undefined;
  }
  try {
    JSON.parse(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "Enter valid JSON.";
  }
}
