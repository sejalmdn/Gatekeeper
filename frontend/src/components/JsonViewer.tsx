import { useMemo, type ReactElement } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import "../styles/JsonViewer.css";

// Reuses the JSON editor as a selectable, read-only configuration viewer.
export function JsonViewer({
  value,
  label,
}: {
  value: unknown;
  label: string;
}): ReactElement {
  // Retains JSON highlighting and accessible keyboard navigation without editing controls.
  const extensions = useMemo(
    () => [
      json(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        "aria-label": label,
        "aria-readonly": "true",
        role: "textbox",
        tabindex: "0",
      }),
    ],
    [label],
  );

  return (
    <CodeMirror
      className="json-viewer"
      value={JSON.stringify(value, null, 2)}
      extensions={extensions}
      theme="dark"
      readOnly
      editable={false}
      indentWithTab={false}
      basicSetup={{
        autocompletion: false,
        history: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
    />
  );
}
