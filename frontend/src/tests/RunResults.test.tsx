// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MemoryRouter,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { EvaluationRunDetail } from "../pages/EvaluationRunDetail";
import { candidate, dataset, run, settings } from "./executionFixtures";
import { evaluatedAttempt, grade, report } from "./reportingFixtures";

let container: HTMLDivElement;
let root: Root;
const completed = {
  ...run,
  status: "completed" as const,
  queued_at: candidate.created_at,
  total_attempts: 3,
  finished_attempts: 3,
};

// Exposes browser navigation and current selection for route integration tests.
function Navigation() {
  // Drives actual router history rather than directly manipulating component state.
  const navigate = useNavigate();

  // Reports the shareable URL produced by disclosures and evidence links.
  const location = useLocation();

  return (
    <>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
      <button onClick={() => navigate("/projects/p/evaluation-runs/other")}>
        Other run
      </button>
      <output>{location.search}</output>
    </>
  );
}

// Supplies representative reporting boundaries without provider calls.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "getEvaluationRun").mockResolvedValue(completed);
  vi.spyOn(api, "listExecutionAttempts").mockResolvedValue([evaluatedAttempt]);
  vi.spyOn(api, "getCandidate").mockResolvedValue(candidate);
  vi.spyOn(api, "getDataset").mockResolvedValue(dataset);
  vi.spyOn(api, "getRunSettings").mockResolvedValue(settings);
  vi.spyOn(api, "getRunSummary").mockResolvedValue(report);
  vi.spyOn(api, "listAttemptEvaluations").mockResolvedValue([
    evaluatedAttempt,
    {
      ...evaluatedAttempt,
      id: "a2",
      attempt_number: 2,
      verdict: "fail",
    },
    {
      ...evaluatedAttempt,
      id: "a3",
      attempt_number: 3,
      status: "timed_out",
      verdict: "cannot_evaluate",
    },
  ]);
  vi.spyOn(api, "getAttemptEvaluation").mockResolvedValue(grade);
  vi.spyOn(api, "getExecutionAttempt").mockResolvedValue({
    ...evaluatedAttempt,
    evidence: null,
    request: null,
    response: null,
  });
});

// Removes timers and pending component effects between independent cases.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Mounts the real run page with optional saved tab and disclosure selection.
async function renderPage(search = "") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/projects/p/evaluation-runs/r${search}`]}>
        <Navigation />
        <Routes>
          <Route
            path="/projects/:projectId/evaluation-runs/:recordId"
            element={<EvaluationRunDetail />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

// Finds controls by their accessible visible labels.
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );
  expect(found, `button ${label}`).toBeDefined();
  return found!;
}

// Uses the same click path as mouse and keyboard activation.
async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

// Confirms mixed assessments, incomplete scores, supplied nulls and zeros, and lazy reads.
it("defaults to Results and displays backend assessments, stability and metric coverage", async () => {
  await renderPage();
  expect(
    container.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Results");
  expect(container.textContent).toContain("1 / 3");
  expect(container.textContent).toContain("33.33%");
  expect(container.textContent).toContain("66.67%");
  expect(container.textContent).toContain("flaky");
  expect(container.textContent).toContain(
    "Insufficient repeats: at least two decisive attempts",
  );
  expect(container.textContent).toContain("incomplete_scored_results");
  const means = container.querySelector(".result-metrics__means")!;
  expect(means.textContent).toContain("Latency (ms) · meanUnavailable");
  expect(means.textContent).toContain("Output tokens · mean0");
  expect(api.getAttemptEvaluation).not.toHaveBeenCalled();
  expect(api.getExecutionAttempt).not.toHaveBeenCalled();
  await click(
    container.querySelector('[aria-controls="scenario-results-s3"]')!,
  );
  expect(container.textContent).toContain("Execution evidence is missing.");
  expect(container.textContent).toContain("new_reason_code");
});

// Keeps compact score states and the graphical threshold explicit without changing backend data.
it("shows scenario score warnings, zero rates and accessible threshold markers", async () => {
  vi.mocked(api.getRunSummary).mockResolvedValue({
    ...report,
    scenarios: [
      {
        ...report.scenarios[0],
        attempts: { ...report.scenarios[0].attempts, pass_rate: 0 },
        score: {
          planned_weight: 0,
          known_weight: 0,
          passing_weight: 0,
          weighted_score: null,
          coverage: null,
          reason: "no_scored_rules",
        },
      },
    ],
  });
  await renderPage();
  const card = container.querySelector(".scenario-results")!;
  expect(card.querySelector("svg")?.getAttribute("aria-label")).toBe(
    "Pass rate 0%; threshold 80%",
  );
  expect(
    card.querySelector("svg rect:nth-child(2)")?.getAttribute("width"),
  ).toBe("0");
  expect(card.querySelector("svg line")?.getAttribute("x1")).toBe("80");
  expect(card.querySelector(".result-score__coverage")?.textContent).toContain(
    "Coverage Unavailable",
  );
  expect(card.querySelector(".result-score__reason")?.textContent).toContain(
    "No scored rules are configured.",
  );
});

// Tests deep links, separate check families, evidence pointers and history restoration.
it("opens a saved grade and links to the same attempt in Evidence with browser navigation", async () => {
  await renderPage("?tab=results&scenario=s1&attempt=a1");
  expect(api.getAttemptEvaluation).toHaveBeenCalledExactlyOnceWith(
    "p",
    "r",
    "a1",
  );
  expect(api.getExecutionAttempt).not.toHaveBeenCalled();
  expect(
    container.querySelector('[aria-label="Automatic tool validation"]')
      ?.textContent,
  ).toContain("valid_tool_schema");
  expect(
    container.querySelector('[aria-label="Authored rule results"]')
      ?.textContent,
  ).toContain("refund-content");
  expect(container.textContent).toContain("/response_text");
  const evidenceLink = [...container.querySelectorAll("a")].find(
    (link) => link.textContent === "View evidence",
  )!;
  await click(evidenceLink);
  expect(api.getExecutionAttempt).toHaveBeenCalledExactlyOnceWith(
    "p",
    "r",
    "a1",
  );
  expect(container.querySelector("output")?.textContent).toContain(
    "tab=evidence&scenario=s1&attempt=a1",
  );
  await click(button("Back"));
  expect(
    container.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Results");
  await click(button("Forward"));
  expect(
    container.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Evidence");
});

// Invalid identifiers never trigger private artifact or grade reads.
it("ignores invalid selections and supports arrow, Home and End tab navigation", async () => {
  await renderPage("?tab=invalid&scenario=invalid&attempt=invalid");
  expect(api.getAttemptEvaluation).not.toHaveBeenCalled();
  button("Results").focus();
  await act(async () =>
    button("Results").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(button("Evidence"));
  expect(button("Evidence").getAttribute("aria-selected")).toBe("true");
  expect(api.getExecutionAttempt).not.toHaveBeenCalled();
  await act(async () =>
    button("Evidence").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Home", bubbles: true }),
    ),
  );
  expect(button("Results").getAttribute("aria-selected")).toBe("true");
});

// Summary failure cannot suppress grades, progress, or the evidence surface.
it("keeps grading available after independent summary failure and retries reads", async () => {
  vi.mocked(api.getRunSummary).mockRejectedValueOnce(
    new Error("Summary offline"),
  );
  await renderPage("?scenario=s1&attempt=a1");
  expect(container.textContent).toContain("Summary offline");
  expect(container.textContent).toContain("3 / 3 attempts finished");
  expect(container.textContent).toContain("Required text found in response.");
  await click(button("Retry results"));
  expect(container.textContent).not.toContain("Summary offline");
  expect(container.textContent).toContain("Scenario assessments");
});

// A lightweight grade failure must not erase a successful summary or invent ungraded verdicts.
it("preserves summary when lightweight grades fail and can inspect a grade lazily", async () => {
  vi.mocked(api.listAttemptEvaluations).mockRejectedValue(
    new Error("Grades offline"),
  );
  await renderPage("?scenario=s1");
  expect(container.textContent).toContain("Scenario assessments");
  expect(container.textContent).toContain("Grades offline");
  expect(container.textContent).toContain("Unknown grade");
  await click(container.querySelector('[aria-controls="grade-a1"]')!);
  expect(container.textContent).toContain("Required text found in response.");
});

// Reporting absence is explicit for unstarted, historical, and missing stored reports.
it.each([
  ["pending", "frozen_snapshot_unavailable", "This run has not started"],
  [
    "failed",
    "frozen_snapshot_unavailable",
    "Frozen evaluation configuration is unavailable",
  ],
  [
    "cancelled",
    "stored_summary_unavailable",
    "The stored report is unavailable",
  ],
] as const)(
  "keeps unavailable %s runs inspectable",
  async (status, reason, wording) => {
    vi.mocked(api.getEvaluationRun).mockResolvedValue({ ...run, status });
    vi.mocked(api.getRunSummary).mockResolvedValue({
      ...report,
      availability: "unavailable",
      aggregates: null,
      scenarios: [],
      reason,
    });
    await renderPage("?scenario=s1&attempt=a1");
    expect(container.textContent).toContain(wording);
    expect(container.textContent).toContain("Required text found in response.");
    await click(button("Evidence"));
    expect(api.getExecutionAttempt).toHaveBeenCalled();
  },
);

// Cancellation before allocation leaves both inspection and reporting state usable.
it("shows cancellation before allocation in Evidence", async () => {
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...run,
    status: "cancelled",
  });
  vi.mocked(api.listExecutionAttempts).mockResolvedValue([]);
  vi.mocked(api.listAttemptEvaluations).mockResolvedValue([]);
  await renderPage("?tab=evidence");
  expect(container.textContent).toContain(
    "cancelled before attempts were allocated",
  );
  expect(api.getExecutionAttempt).not.toHaveBeenCalled();
});

// Active polling ends after a terminal refresh, retaining previous data if that refresh fails.
it("refreshes active results and retains stale data after a failed final refresh", async () => {
  vi.useFakeTimers();
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...completed,
    status: "running",
  });
  await renderPage();
  expect(container.textContent).toContain("Partial results");
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(api.getRunSummary).toHaveBeenCalledTimes(2);
  vi.mocked(api.getEvaluationRun).mockResolvedValue(completed);
  vi.mocked(api.getRunSummary).mockRejectedValue(
    new Error("Final read failed"),
  );
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(container.textContent).toContain("Final read failed");
  expect(container.textContent).toContain("may be stale");
  expect(container.textContent).toContain("Scenario assessments");
  const calls = vi.mocked(api.getRunSummary).mock.calls.length;
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(api.getRunSummary).toHaveBeenCalledTimes(calls);
  expect(container.textContent).not.toContain("Partial results");
  vi.mocked(api.getRunSummary).mockResolvedValue(report);
  await click(button("Retry results"));
  expect(container.textContent).not.toContain("Final read failed");
});

// Evaluation completion can follow execution completion without changing attempt status.
it("reloads an open completed-but-ungraded attempt when grading arrives", async () => {
  vi.useFakeTimers();
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...completed,
    status: "running",
  });
  vi.mocked(api.listAttemptEvaluations).mockResolvedValue([
    { ...evaluatedAttempt, verdict: "not_evaluated", evaluated_at: null },
  ]);
  vi.mocked(api.getAttemptEvaluation).mockResolvedValueOnce({
    ...grade,
    verdict: "not_evaluated",
    evaluated_at: null,
    rule_results: [],
    automatic_tool_validation: [],
  });
  await renderPage("?scenario=s1&attempt=a1");
  expect(container.textContent).toContain("No stored evaluation is available");
  vi.mocked(api.listAttemptEvaluations).mockResolvedValue([evaluatedAttempt]);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(api.getAttemptEvaluation).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Required text found in response.");
});

// Slow reads must not overlap polling cycles and must be ignored after navigating away.
it("serializes slow cycles and ignores obsolete summary responses", async () => {
  vi.useFakeTimers();
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...completed,
    status: "running",
  });
  let resolve!: (value: typeof report) => void;
  vi.mocked(api.getRunSummary).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await renderPage();
  await act(async () => vi.advanceTimersByTimeAsync(8000));
  expect(api.getRunSummary).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Refund policy");
  await click(button("Evidence"));
  await act(async () =>
    resolve({ ...report, evaluator_versions: ["obsolete-version"] }),
  );
  expect(container.textContent).not.toContain("obsolete-version");
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(api.getRunSummary).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<p>Another page</p>));
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(api.listAttemptEvaluations).toHaveBeenCalledTimes(1);
});

// A late grade response cannot replace the current attempt's result.
it("ignores obsolete grading responses after selection changes", async () => {
  let resolve!: (value: typeof grade) => void;
  vi.mocked(api.getAttemptEvaluation).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await renderPage("?scenario=s1&attempt=a1");
  vi.mocked(api.getAttemptEvaluation).mockResolvedValue({
    ...grade,
    id: "a2",
    verdict: "fail",
  });
  await click(container.querySelector('[aria-controls="grade-a2"]')!);
  await act(async () =>
    resolve({ ...grade, evaluator_version: "obsolete-evaluator" }),
  );
  expect(container.textContent).not.toContain("obsolete-evaluator");
  expect(
    container.querySelector('[aria-label="Attempt 2 grading"]'),
  ).not.toBeNull();
});

// Failed grading reads stay local to the disclosure and can be retried independently.
it("retries an individual grade without fetching provider artifacts", async () => {
  vi.mocked(api.getAttemptEvaluation).mockRejectedValueOnce(
    new Error("Grade read failed"),
  );
  await renderPage("?scenario=s1&attempt=a1");
  expect(container.textContent).toContain("Grade read failed");
  expect(container.textContent).toContain("Scenario assessments");
  await click(button("Retry grade"));
  expect(container.textContent).toContain("Required text found in response.");
  expect(api.getExecutionAttempt).not.toHaveBeenCalled();
});

// Execution failures and absent grading are labeled independently, including skipped attempts.
it("distinguishes failed, skipped, and completed ungraded attempts", async () => {
  vi.mocked(api.listAttemptEvaluations).mockResolvedValue([
    { ...evaluatedAttempt, verdict: "not_evaluated", evaluated_at: null },
    {
      ...evaluatedAttempt,
      id: "a2",
      attempt_number: 2,
      status: "skipped",
      verdict: "not_evaluated",
      evaluated_at: null,
    },
    {
      ...evaluatedAttempt,
      id: "a3",
      attempt_number: 3,
      status: "failed",
      verdict: "error",
    },
  ]);
  await renderPage("?scenario=s1");
  const buttons = [...container.querySelectorAll(".scenario-results__attempt")];
  expect(buttons[0].textContent).toContain("UngradedExecution: completed");
  expect(buttons[1].textContent).toContain("UngradedExecution: skipped");
  expect(buttons[2].textContent).toContain("errorExecution: failed");
});

// Timestamp changes invalidate a selected grade even when its verdict remains the same.
it("refreshes changed evaluation timestamps without reloading unchanged grades", async () => {
  vi.useFakeTimers();
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...completed,
    status: "running",
  });
  await renderPage("?scenario=s1&attempt=a1");
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(api.getAttemptEvaluation).toHaveBeenCalledTimes(1);
  vi.mocked(api.listAttemptEvaluations).mockResolvedValue([
    { ...evaluatedAttempt, evaluated_at: "2026-10-25T00:00:00Z" },
  ]);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(api.getAttemptEvaluation).toHaveBeenCalledTimes(2);
});

// An unresolved read for the old route must not delay or overwrite a new run's report.
it("starts fresh reporting on navigation and ignores the prior route's late response", async () => {
  let resolve!: (value: typeof report) => void;
  vi.mocked(api.getRunSummary).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await renderPage();
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...completed,
    id: "other",
  });
  vi.mocked(api.getRunSummary).mockResolvedValue({
    ...report,
    evaluation_run_id: "other",
    scenarios: [{ ...report.scenarios[0], scenario_name: "Current scenario" }],
  });
  await click(button("Other run"));
  expect(container.textContent).toContain("Current scenario");
  await act(async () =>
    resolve({
      ...report,
      scenarios: [
        { ...report.scenarios[0], scenario_name: "Obsolete scenario" },
      ],
    }),
  );
  expect(container.textContent).not.toContain("Obsolete scenario");
  expect(container.textContent).toContain("Current scenario");
  expect(api.getRunSummary).toHaveBeenLastCalledWith("p", "other");
});
