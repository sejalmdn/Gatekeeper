// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScenarioEditor } from "../components/ScenarioEditor";

let container: HTMLDivElement;
let root: Root;

// Mount the composer with real DOM inputs and its real JSON editor.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

// Dispose editor observers after each scenario type.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// Simulate browser input through React's native value tracker.
async function enter(id: string, value: string): Promise<void> {
  const element = container.querySelector(`#${id}`)!;
  const prototype = Object.getPrototypeOf(element);
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    const event = element.tagName === "SELECT" ? "change" : "input";
    element.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

// Delay required history feedback until the developer starts editing JSON.
it("keeps multi-turn history calm until its first edit", async () => {
  await act(async () =>
    root.render(
      <ScenarioEditor scenarios={[]} disabled={false} onAdd={vi.fn()} />,
    ),
  );
  await enter("scenario-type", "multi_turn");
  const view = EditorView.findFromDOM(
    container.querySelector(".cm-editor") as HTMLElement,
  )!;
  expect(container.querySelector("#scenario-history-error")).toBeNull();
  expect(view.contentDOM.getAttribute("aria-invalid")).toBe("false");
  await act(async () =>
    view.dispatch({
      changes: {
        from: 0,
        insert: "{",
      },
    }),
  );
  expect(container.querySelector("#scenario-history-error")).not.toBeNull();
  expect(view.contentDOM.getAttribute("aria-invalid")).toBe("true");
});

// Verify history edits survive collapse and reach the validated scenario payload.
it.each(["multi_turn", "tool_use"])(
  "adds %s history from the JSON editor without losing collapsed edits",
  async (scenarioType) => {
    const onAdd = vi.fn();
    await act(async () =>
      root.render(
        <ScenarioEditor scenarios={[]} disabled={false} onAdd={onAdd} />,
      ),
    );
    await enter("scenario-key", "order-follow-up");
    await enter("scenario-name", "Uses order context");
    await enter("user-message", "Where is it?");
    await enter("scenario-type", scenarioType);
    const view = EditorView.findFromDOM(
      container.querySelector(".cm-editor") as HTMLElement,
    )!;
    expect(view.contentDOM.getAttribute("aria-required")).toBe(
      String(scenarioType === "multi_turn"),
    );
    const history = [
      {
        role: "user",
        content: "My order is 123.",
      },
    ];
    await act(async () =>
      view.dispatch({
        changes: { from: 0, insert: JSON.stringify(history) },
      }),
    );
    const toggle = container.querySelector(
      ".scenario-editor__toggle",
    ) as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(
      (container.querySelector("#scenario-editor-content") as HTMLElement)
        .hidden,
    ).toBe(true);
    await act(async () => toggle.click());
    expect(view.state.doc.toString()).toBe(JSON.stringify(history));
    await act(async () =>
      (
        container.querySelector(
          ".scenario-editor__actions button",
        ) as HTMLButtonElement
      ).click(),
    );
    expect(onAdd).toHaveBeenCalledWith({
      scenario_key: "order-follow-up",
      name: "Uses order context",
      scenario_type: scenarioType,
      input: {
        user_message: "Where is it?",
        history,
      },
    });
  },
);
