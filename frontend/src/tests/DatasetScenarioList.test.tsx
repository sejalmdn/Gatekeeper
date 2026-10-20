// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Scenario } from "../types";
import { DatasetScenarioList } from "../components/DatasetScenarioList";

const scenario: Scenario = {
  id: "s",
  dataset_id: "d",
  scenario_key: "hello",
  name: "Hello",
  scenario_type: "single_turn",
  input: { user_message: "Hello" },
  created_at: "2026-01-01T00:00:00Z",
};

// Keep immutable scenario cards focused on inputs instead of rule creation.
it("does not expose a rule creation link", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () =>
    root.render(<DatasetScenarioList scenarios={[scenario]} />),
  );
  expect(container.textContent).not.toContain("Add rule");
  expect(container.querySelector("a")).toBeNull();
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
