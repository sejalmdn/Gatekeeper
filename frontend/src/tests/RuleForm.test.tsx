// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RuleForm } from "../pages/RuleForm";

let container: HTMLDivElement;
let root: Root;

// Exposes the redirected route and query for compatibility assertions.
function LocationProbe(): ReactElement {
  // Reads the memory router destination after the legacy redirect.
  const location = useLocation();
  return <p>{`${location.pathname}${location.search}`}</p>;
}

// Mount a fresh router for the legacy route.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

// Dispose the route after every compatibility check.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// Preserve old bookmarks and scenario shortcuts in the scenario-bound authoring view.
it("redirects the old new-rule route", async () => {
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={["/projects/p/datasets/d/rules/new?scenario=s"]}
      >
        <Routes>
          <Route
            path="/projects/:projectId/datasets/:recordId/rules/new"
            element={<RuleForm />}
          />
          <Route
            path="/projects/:projectId/datasets/:recordId"
            element={<LocationProbe />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
  expect(container.textContent).toBe(
    "/projects/p/datasets/d?scenario=s&view=add",
  );
});
