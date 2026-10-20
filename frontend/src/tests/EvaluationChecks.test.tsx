// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import * as api from "../api";
import { EvaluationChecks } from "../pages/EvaluationChecks";

let container: HTMLDivElement;
let root: Root;

const expectedCategories = {
  "Response content": [
    "Required text",
    "Forbidden text",
    "Regular expression",
    "Response length",
  ],
  "JSON structure": ["Valid JSON", "JSON Schema", "JSON field"],
  "Tool requests": [
    "Tool selection",
    "Tool argument field",
    "Expected tool calls",
  ],
  "Speed, tokens, or cost": ["Latency limit", "Token limits", "Cost limit"],
};

// Mount each reference view in an isolated browser document.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

// Dispose the view and restore backend stubs after each assertion.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Render the static page without project layout data.
async function renderPage(): Promise<void> {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <EvaluationChecks />
      </MemoryRouter>,
    ),
  );
}

// Return the rendered check row with the requested visible name.
function checkRow(name: string): HTMLElement {
  const heading = [...container.querySelectorAll("tbody th")].find(
    (item) => item.textContent === name,
  );
  return heading?.closest("tr") as HTMLElement;
}

// List every authorable check once in its intended reference section.
it("groups all authorable checks and excludes the unavailable semantic rubric", async () => {
  await renderPage();
  expect(container.querySelectorAll("table")).toHaveLength(4);
  expect(container.querySelectorAll("tbody tr")).toHaveLength(13);
  const expectedHeaders = [
    "Check",
    "What it checks",
    "Configuration",
    "Supported scenarios",
  ];
  for (const table of container.querySelectorAll("table")) {
    expect(
      [...table.querySelectorAll("thead th")].map((cell) => cell.textContent),
    ).toEqual(expectedHeaders);
  }
  for (const [category, checks] of Object.entries(expectedCategories)) {
    const panelHeading = [...container.querySelectorAll("h2")].find(
      (item) => item.textContent === category,
    );
    const names = [
      ...panelHeading!.closest("section")!.querySelectorAll("tbody th"),
    ].map((item) => item.textContent);
    expect(names).toEqual(checks);
  }
  const renderedChecks = [...container.querySelectorAll("tbody th")].map(
    (item) => item.textContent,
  );
  expect(new Set(renderedChecks).size).toBe(13);
  expect(container.textContent).not.toContain("Semantic rubric");
});

// Reflect rule-authoring compatibility through visible scenario badges.
it("shows scenario compatibility for response, operational, and tool checks", async () => {
  await renderPage();
  const badges = (name: string) =>
    [...checkRow(name).querySelectorAll(".badge")].map(
      (item) => item.textContent,
    );
  for (const name of [
    ...expectedCategories["Response content"],
    ...expectedCategories["JSON structure"],
  ]) {
    expect(badges(name)).toEqual(["Single turn", "Multi-turn"]);
  }
  for (const name of expectedCategories["Speed, tokens, or cost"]) {
    expect(badges(name)).toEqual(["Single turn", "Multi-turn", "Tool use"]);
  }
  for (const name of expectedCategories["Tool requests"]) {
    expect(badges(name)).toEqual(["Tool use"]);
  }
});

// Explain private expectations, missing evidence, and tool-request boundaries.
it("states the evaluation evidence boundaries", async () => {
  await renderPage();
  expect(container.textContent).toContain("Expectations stay private");
  expect(container.textContent).toContain("cannot_evaluate");
  expect(container.textContent).toContain(
    "verify requests, not tool execution",
  );
  expect(container.textContent).toContain(
    "automatically validates requested arguments",
  );
});

// Reach the page through project routing with matching navigation and breadcrumb labels.
it("registers the project route and marks its reference link active", async () => {
  vi.spyOn(api, "getProject").mockResolvedValue({
    id: "project-1",
    name: "Payments",
    created_at: "2026-01-01T00:00:00Z",
  });
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/projects/project-1/evaluation-checks"]}>
        <App />
      </MemoryRouter>,
    ),
  );
  const reference = container.querySelector(
    'nav[aria-label="Project reference"] a',
  );
  expect(reference?.getAttribute("href")).toBe(
    "/projects/project-1/evaluation-checks",
  );
  expect(reference?.classList.contains("active")).toBe(true);
  expect(
    container.querySelector('.workspace-breadcrumb [aria-current="page"]')
      ?.textContent,
  ).toBe("Evaluation checks");
  expect(container.querySelector("h1")?.textContent).toBe("Evaluation checks");
});
