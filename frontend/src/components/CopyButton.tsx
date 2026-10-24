import { useState, type ReactElement } from "react";
import "../styles/CopyButton.css";

// Copies the full underlying value and reports clipboard success or failure.
export function CopyButton({
  value,
  label,
  children = "Copy",
}: {
  value: string;
  label: string;
  children?: string;
}): ReactElement {
  // Gives immediate feedback without reporting success before the clipboard resolves.
  const [status, setStatus] = useState<"ready" | "copied" | "failed">("ready");

  // Allows retrying when clipboard access is unavailable or denied.
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  let text = children;
  if (status === "copied") text = "Copied";
  if (status === "failed") text = "Copy failed · Retry";

  return (
    <button
      className="copy-button"
      type="button"
      onClick={copy}
      aria-label={label}
    >
      <span aria-hidden="true">⧉</span>
      <span role="status">{text}</span>
    </button>
  );
}
