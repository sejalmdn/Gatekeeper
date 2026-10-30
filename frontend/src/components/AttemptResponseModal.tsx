import { useEffect, useRef, useState, type ReactElement } from "react";
import { getExecutionAttempt } from "../api";
import type { ExecutionAttemptDetail } from "../types";
import { messageFor } from "../utils/format";
import { JsonViewer } from "./JsonViewer";
import "../styles/AttemptResponseModal.css";

interface AttemptResponseModalProps {
  projectId: string;
  runId: string;
  executionId: string;
  onClose: () => void;
}

// Shows one attempt's response on demand in a native modal with keyboard focus containment.
export function AttemptResponseModal({
  projectId,
  runId,
  executionId,
  onClose,
}: AttemptResponseModalProps): ReactElement {
  // Keeps the native dialog available for opening and restoring focus when closed.
  const dialog = useRef<HTMLDialogElement>(null);

  // Retains only evidence fetched for this mounted response viewer.
  const [state, setState] = useState<{
    data?: ExecutionAttemptDetail;
    error?: string;
  }>({});

  // Retries the evidence read without re-running the attempt.
  const [revision, setRevision] = useState(0);

  // Uses native modal behavior for Escape, focus containment, and background interaction blocking.
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);

  // Ignores late responses after closing, switching attempts, or retrying.
  useEffect(() => {
    let active = true;
    void getExecutionAttempt(projectId, runId, executionId).then(
      (data) => active && setState({ data }),
      (error: unknown) => active && setState({ error: messageFor(error) }),
    );
    return () => {
      active = false;
    };
  }, [projectId, runId, executionId, revision]);

  const data = state.data;
  const responseText = data?.evidence?.response_text;
  let response: ReactElement | null = null;
  if (data) {
    if (responseText !== null && responseText !== undefined) {
      response = <pre>{responseText}</pre>;
    } else if (data.response !== null) {
      response = (
        <JsonViewer value={data.response} label="Provider response JSON" />
      );
    } else {
      response = <p>No response was recorded for this attempt.</p>;
    }
  }
  return (
    <dialog
      ref={dialog}
      className="attempt-response-modal"
      aria-label="Attempt response"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="attempt-response-modal__content">
        <header>
          <h3>Response</h3>
          <button type="button" onClick={onClose} aria-label="Close response">
            Close
          </button>
        </header>
        {!data && !state.error && <p role="status">Loading response…</p>}
        {state.error && (
          <div role="alert">
            <p>Response unavailable: {state.error}</p>
            <button
              onClick={() => {
                setState({});
                setRevision((value) => value + 1);
              }}
            >
              Retry response
            </button>
          </div>
        )}
        {data && (
          <div className="attempt-response-modal__response">{response}</div>
        )}
      </div>
    </dialog>
  );
}
