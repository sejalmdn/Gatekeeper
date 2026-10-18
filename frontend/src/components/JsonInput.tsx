import { useMemo, type ReactElement, type ReactNode } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { indentUnit } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { jsonInputError } from "../utils/jsonInput";
import "../styles/JsonInput.css";

interface JsonInputProps {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  actions?: ReactNode;
}

// Edits JSON with syntax feedback, accessible labels, and optional explicit formatting.
export function JsonInput({
  id,
  label,
  help,
  value,
  onChange,
  placeholder,
  required = true,
  actions,
}: JsonInputProps): ReactElement {
  const error = jsonInputError(value, required);
  const invalid = error !== undefined;

  // Keeps editor configuration stable while ordinary text edits update the controlled value.
  const extensions = useMemo(
    () => [
      json(),
      indentUnit.of("  "),
      EditorView.lineWrapping,
      lintGutter(),
      linter((view) => {
        if (!required && !view.state.doc.toString().trim()) return [];
        return jsonParseLinter()(view);
      }),
      EditorView.contentAttributes.of({
        id,
        "aria-labelledby": `${id}-label`,
        "aria-describedby": `${id}-help ${id}-keyboard${invalid ? ` ${id}-error` : ""}`,
        "aria-required": String(required),
        "aria-invalid": String(invalid),
        spellcheck: "false",
      }),
    ],
    [id, required, invalid],
  );

  // Formats only complete JSON on request, leaving invalid or unfinished input untouched.
  function formatJson(): void {
    if (invalid || !value.trim()) return;
    onChange(JSON.stringify(JSON.parse(value), null, 2));
  }

  return (
    <div className="form-field json-input">
      <div className="json-input__heading">
        <label id={`${id}-label`} htmlFor={id}>
          {label}
        </label>
        <div className="json-input__actions">
          {actions}
          <button
            className="quiet-button json-input__format"
            type="button"
            onClick={formatJson}
            disabled={invalid || !value.trim()}
            aria-label={`Format JSON for ${label}`}
          >
            Format JSON
          </button>
        </div>
      </div>
      <small id={`${id}-help`}>{help}</small>
      <CodeMirror
        className="json-input__editor"
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme="dark"
        placeholder={placeholder}
        indentWithTab={false}
        basicSetup={{
          autocompletion: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
      />
      <small id={`${id}-keyboard`} className="json-input__keyboard">
        Two-space indentation. Tab moves to the next field; Ctrl+] indents a
        selection.
      </small>
      {error && (
        <p id={`${id}-error`} className="json-input__error" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
