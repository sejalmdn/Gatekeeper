// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { OverviewPage } from "../pages/OverviewPage";
import type { Project } from "../types";

let container: HTMLDivElement;
let root: Root;
const project: Project = {
  id: "project-1",
  name: "Payments",
  created_at: "2026-01-01T00:00:00Z",
};

// Mount the overview inside the project outlet context it uses in production.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "listProviders").mockResolvedValue([]);
  vi.spyOn(api, "listCandidates").mockResolvedValue([]);
  vi.spyOn(api, "listDatasets").mockResolvedValue([]);
});

// Dispose the mounted overview and restore API stubs after each assertion.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Render the overview with its real project-scoped links and data readers.
async function renderPage(): Promise<void> {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={project} />}>
            <Route path="/" element={<OverviewPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  );
}

// Assign each overview resource its fixed palette class, icon, and destination.
it("renders paired resource cards for providers, candidates, and datasets", async () => {
  await renderPage();
  const cards = [
    ["providers", "/providers"],
    ["candidates", "/candidates"],
    ["datasets", "/datasets"],
  ] as const;
  for (const [tone, href] of cards) {
    const card = container.querySelector<HTMLAnchorElement>(
      `.record-count--${tone}`,
    );
    expect(card?.getAttribute("href")).toBe(href);
    expect(card?.querySelector(".record-count-icon .icon")).not.toBeNull();
    expect(card?.querySelector(".record-count-content")).not.toBeNull();
  }
});
