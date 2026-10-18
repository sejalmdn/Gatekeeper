// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonInput } from "./JsonInput";

// Exercise controlled editor changes with the same value flow used by creation forms.
function EditorForm({
  initialValue,
  required = true,
  disabled = false,
}: {
  initialValue: string;
  required?: boolean;
  disabled?: boolean;
}) {
  // Retains edits so errors and formatting follow the current document.
  const [value, setValue] = useState(initialValue);

  return (
    <form>
      <JsonInput
        id="test-json"
        label="Test JSON"
        help="Enter a JSON object."
        value={value}
        onChange={setValue}
        required={required}
        disabled={disabled}
      />
    </form>
  );
}

// Verify real CodeMirror editing without replacing the editor with a mock.
describe("JSON input", () => {
  let container: HTMLDivElement;
  let root: Root;

  // Provide a DOM container and enable React's act-aware update checks.
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  // Destroy editor observers and remove DOM state between cases.
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  // Locate the live editor for realistic document transactions.
  function editor(): EditorView {
    const element = container.querySelector(".cm-editor");
    const view = element && EditorView.findFromDOM(element as HTMLElement);
    if (!view) throw new Error("JSON editor was not mounted.");
    return view;
  }

  // Locate the explicit formatter action.
  function formatButton(): HTMLButtonElement {
    return container.querySelector("button") as HTMLButtonElement;
  }

  // Preserve JSON values while formatting without submitting the surrounding form.
  it("formats valid JSON only when requested", async () => {
    const initialValue =
      '{"answer": "Hello", "count":0, "enabled":false, "items":[1,2]}';
    await act(async () =>
      root.render(<EditorForm initialValue={initialValue} />),
    );
    const submit = vi.fn();
    container.querySelector("form")!.addEventListener("submit", submit);
    expect(editor().state.doc.toString()).toBe(initialValue);
    expect(formatButton().type).toBe("button");
    await act(async () => formatButton().click());
    expect(editor().state.doc.toString()).toBe(
      JSON.stringify(JSON.parse(initialValue), null, 2),
    );
    expect(submit).not.toHaveBeenCalled();
  });

  // Keep incomplete input intact, report errors, and recover as the user completes it.
  it("preserves unfinished edits and clears errors when corrected", async () => {
    await act(async () => root.render(<EditorForm initialValue="{}" />));
    const view = editor();
    await act(async () =>
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: '{"answer":',
        },
      }),
    );
    expect(view.state.doc.toString()).toBe('{"answer":');
    expect(container.querySelector("#test-json-error")).not.toBeNull();
    expect(formatButton().disabled).toBe(true);
    expect(view.contentDOM.getAttribute("aria-invalid")).toBe("true");
    await act(async () =>
      view.dispatch({
        changes: {
          from: view.state.doc.length,
          insert: '"Hello"}',
        },
      }),
    );
    expect(container.querySelector("#test-json-error")).toBeNull();
    expect(formatButton().disabled).toBe(false);
    expect(view.contentDOM.getAttribute("aria-invalid")).toBe("false");
  });

  // Make the editor discoverable to assistive technology without trapping Tab navigation.
  it("labels the editable surface and lets Tab leave it", async () => {
    await act(async () => root.render(<EditorForm initialValue="{}" />));
    const view = editor();
    expect(view.contentDOM.id).toBe("test-json");
    expect(view.contentDOM.getAttribute("aria-labelledby")).toBe(
      "test-json-label",
    );
    expect(view.contentDOM.getAttribute("aria-describedby")).toContain(
      "test-json-help",
    );
    expect(view.contentDOM.getAttribute("aria-required")).toBe("true");
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  // Apply JSON indentation when opening a new line inside an object.
  it("indents new lines by two spaces", async () => {
    await act(async () => root.render(<EditorForm initialValue="{}" />));
    const view = editor();
    await act(async () => {
      view.dispatch({ selection: { anchor: 1 } });
      insertNewlineAndIndent(view);
    });
    expect(view.state.doc.toString()).toBe("{\n  \n}");
  });

  // Lock both typing and formatting during a pending dataset save, then restore editing.
  it("preserves JSON and disables editing while saving", async () => {
    const initialValue = '[{"role":"user","content":"Order 123"}]';
    await act(async () =>
      root.render(<EditorForm initialValue={initialValue} disabled />),
    );
    expect(editor().state.facet(EditorState.readOnly)).toBe(true);
    expect(editor().contentDOM.getAttribute("contenteditable")).toBe("false");
    expect(formatButton().disabled).toBe(true);
    expect(editor().state.doc.toString()).toBe(initialValue);

    await act(async () =>
      root.render(<EditorForm initialValue={initialValue} />),
    );
    expect(editor().state.facet(EditorState.readOnly)).toBe(false);
    expect(formatButton().disabled).toBe(false);
    expect(editor().state.doc.toString()).toBe(initialValue);
  });

  // Required and optional blank editors retain distinct validity states.
  it.each([true, false])(
    "handles empty JSON with required=%s",
    async (required) => {
      await act(async () =>
        root.render(<EditorForm initialValue="" required={required} />),
      );
      expect(editor().contentDOM.getAttribute("aria-invalid")).toBe(
        String(required),
      );
      expect(formatButton().disabled).toBe(true);
    },
  );
});
