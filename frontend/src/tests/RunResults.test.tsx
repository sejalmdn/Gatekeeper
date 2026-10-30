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
  expect(card.querySelector(".result-score__reason")).toBeNull();
});

// Keeps the provider's stored diagnostics prominent without exposing configured regex syntax.
it.each(["pass", "fail"] as const)(
  "shows %s regex diagnostics without the expression",
  async (outcome) => {
    vi.mocked(api.getAttemptEvaluation).mockResolvedValue({
      ...grade,
      rule_results: [
        {
          ...grade.rule_results[0],
          rule_type: "response.regex",
          outcome,
          reason: outcome === "pass" ? "regex_matched" : "regex_not_matched",
          explanation:
            'Response pattern "SECRET_REGEX_EXPRESSION" using search mode.',
        },
      ],
    });
    await renderPage("?scenario=s1&attempt=a1");
    const card = container.querySelector(".authored-rule-result")!;
    expect(card.textContent).toContain(
      outcome === "pass"
        ? "The response matches the configured regular expression."
        : "The response does not match the configured regular expression.",
    );
    expect(card.textContent).not.toContain("SECRET_REGEX_EXPRESSION");
    expect(card.textContent).toContain("/response_text");
    expect(card.querySelector("summary")?.textContent).toBe("Rule reference");
    expect(card.querySelector(".result-badge")?.textContent).toContain(outcome);
  },
);

// Reports the supplied failure explanation rather than inventing a diagnostic from its code.
it("shows saved rule failure reasons and keeps automatic checks separate", async () => {
  vi.mocked(api.getAttemptEvaluation).mockResolvedValue({
    ...grade,
    rule_results: [
      {
        ...grade.rule_results[0],
        outcome: "fail",
        reason: "required_text_missing",
        explanation: 'Missing required phrase: "return label".',
      },
    ],
  });
  await renderPage("?scenario=s1&attempt=a1");
  const card = container.querySelector(".authored-rule-result")!;
  expect(card.textContent).toContain(
    'Missing required phrase: "return label".',
  );
  expect(card.textContent).toContain("required_text_missing");
  expect(card.textContent).toContain("high");
  expect(
    container.querySelector(
      '[aria-label="Automatic tool validation"] .authored-rule-result',
    ),
  ).toBeNull();
});

// Inspects immutable rule inputs in the existing editor, mounting it only when opened.
it("shows frozen rule JSON in a lazy read-only editor", async () => {
  vi.mocked(api.getAttemptEvaluation).mockResolvedValue({
    ...grade,
    rule_configurations: [
      {
        id: "b1",
        dataset_id: "d",
        scenario_id: "s1",
        rule_key: "refund-content",
        rule_type: "response.required_text",
        role: "required",
        severity: "high",
        parameters: { values: ["Frozen return label"] },
        applies_to: null,
        created_at: "2026-10-29T00:00:00Z",
        source: "scenario",
        overridden_rule_id: null,
      },
    ],
  });
  await renderPage("?scenario=s1&attempt=a1");
  const reference = container.querySelector<HTMLDetailsElement>(
    ".authored-rule-result__details",
  )!;
  expect(reference.querySelector(".json-viewer")).toBeNull();
  await act(async () => {
    reference.open = true;
    reference.dispatchEvent(new Event("toggle"));
  });
  const editor = reference.querySelector('[role="textbox"]')!;
  expect(editor.getAttribute("aria-readonly")).toBe("true");
  expect(editor.textContent).toContain("Frozen return label");
  expect(editor.textContent).toContain('"values"');
  expect(editor.textContent).not.toContain('"rule_key"');
  expect(editor.textContent).not.toContain('"parameters"');
  expect(reference.textContent).not.toContain("Binding");
});

// Missing historical configuration must remain unavailable rather than display a guessed rule.
it("explains unavailable frozen rule configuration", async () => {
  await renderPage("?scenario=s1&attempt=a1");
  const reference = container.querySelector<HTMLDetailsElement>(
    ".authored-rule-result__details",
  )!;
  await act(async () => {
    reference.open = true;
    reference.dispatchEvent(new Event("toggle"));
  });
  expect(reference.textContent).toContain(
    "Frozen rule configuration is unavailable",
  );
  expect(reference.querySelector(".json-viewer")).toBeNull();
});

// Opens evidence lazily in a response modal without changing the selected Results route.
it("opens a saved grade and shows its response in a modal", async () => {
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
  vi.mocked(api.getExecutionAttempt).mockResolvedValue({
    ...evaluatedAttempt,
    evidence: null,
    request: null,
    response: { message: "A recorded response" },
  });
  button("View evidence").focus();
  await click(button("View evidence"));
  expect(api.getExecutionAttempt).toHaveBeenCalledExactlyOnceWith(
    "p",
    "r",
    "a1",
  );
  const modal = container.querySelector("dialog")!;
  expect(modal.open).toBe(true);
  expect(modal.textContent).toContain("A recorded response");
  expect(container.querySelector("output")?.textContent).toBe(
    "?tab=results&scenario=s1&attempt=a1",
  );
  expect(
    container.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
  ).toBe("Results");
  await click(button("Close"));
  expect(container.querySelector("dialog")).toBeNull();
  expect(document.activeElement).toBe(button("View evidence"));
});

// A failed response read can be retried without leaving Results or rerunning the candidate.
it("retries response reads and explains missing responses", async () => {
  vi.mocked(api.getExecutionAttempt).mockRejectedValueOnce(
    new Error("Evidence offline"),
  );
  await renderPage("?scenario=s1&attempt=a1");
  await click(button("View evidence"));
  expect(container.querySelector("dialog")?.textContent).toContain(
    "Evidence offline",
  );
  await click(button("Retry response"));
  expect(container.querySelector("dialog")?.textContent).toContain(
    "No response was recorded for this attempt.",
  );
  expect(api.getExecutionAttempt).toHaveBeenCalledTimes(2);
});

// Closing the dialog invalidates pending evidence requests and restores the trigger's focus.
it("closes the response with Escape and ignores late evidence", async () => {
  let resolve!: (
    value: Awaited<ReturnType<typeof api.getExecutionAttempt>>,
  ) => void;
  vi.mocked(api.getExecutionAttempt).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await renderPage("?scenario=s1&attempt=a1");
  button("View evidence").focus();
  await click(button("View evidence"));
  expect(container.querySelector("dialog")?.textContent).toContain(
    "Loading response",
  );
  await act(async () => {
    container
      .querySelector("dialog")!
      .dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  await act(async () =>
    resolve({
      ...evaluatedAttempt,
      evidence: null,
      request: null,
      response: { message: "Obsolete response" },
    }),
  );
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.textContent).not.toContain("Obsolete response");
  expect(document.activeElement).toBe(button("View evidence"));
});

// Aggregate rule filters keep incomplete results out of Passing and preserve access to every rule.
it("filters scenario rule summaries and lazily opens their details", async () => {
  const base = report.scenarios[0].bindings[0];
  vi.mocked(api.getRunSummary).mockResolvedValue({
    ...report,
    scenarios: [
      {
        ...report.scenarios[0],
        bindings: [
          {
            ...base,
            rule_key: "Failing rule",
            outcome_counts: { pass: 1, fail: 2 },
          },
          {
            ...base,
            rule_binding_id: "passing",
            rule_key: "Passing rule",
            outcome_counts: { pass: 3 },
          },
          {
            ...base,
            rule_binding_id: "unknown",
            rule_key: "Unknown rule",
            outcome_counts: { pass: 1, cannot_evaluate: 2 },
          },
        ],
      },
    ],
  });
  await renderPage("?scenario=s1");
  const section = container.querySelector(
    '[aria-label="Binding outcome counts"]',
  )!;
  expect(section.querySelectorAll("article")).toHaveLength(3);
  await click(button("Failing (1)"));
  expect(section.querySelectorAll("article")).toHaveLength(1);
  expect(section.textContent).toContain("Failing rule");
  await click(button("Passing (1)"));
  expect(section.textContent).toContain("Passing rule");
  expect(section.textContent).not.toContain("Unknown rule");
  await click(button("All (3)"));
  const reference = section.querySelector("details")!;
  expect(reference.querySelector(".json-viewer")).toBeNull();
  await act(async () => {
    reference.open = true;
    reference.dispatchEvent(new Event("toggle"));
  });
  expect(
    reference.querySelector('[aria-readonly="true"]')?.textContent,
  ).toContain("Failing rule");
  expect(api.getAttemptEvaluation).not.toHaveBeenCalled();
});

// Distinguishes incomplete measurements from observed zeros in the always-visible scenario table.
it("shows the assessment matrix and scenario metrics without hiding missing values", async () => {
  await renderPage("?scenario=s1");
  const matrix = container.querySelector(
    '[aria-label="Assessment and grading matrix"]',
  )!;
  expect(matrix.textContent).toContain("3 planned attempts");
  expect(
    matrix
      .querySelector('meter[aria-label="Completed attempts"]')
      ?.getAttribute("value"),
  ).toBe("2");
  const metrics = container.querySelector(
    '[aria-label="Scenario operational metrics"]',
  )!;
  expect(metrics.querySelectorAll("tbody tr")).toHaveLength(5);
  const rows = metrics.querySelectorAll("tbody tr");
  expect(rows[0].textContent).toContain("Unavailable");
  expect(
    rows[2].querySelector(".scenario-operational-metrics__mean")?.textContent,
  ).toBe("0");
  expect(metrics.querySelector("details")).toBeNull();
});

// Terminal states stay visible at zero while active and unallocated states appear when relevant.
it.each([
  "completed",
  "failed",
  "timed_out",
  "skipped",
  "pending",
  "running",
  "not_allocated",
])("keeps terminal states and nonzero %s execution states", async (status) => {
  const counts = {
    completed: 0,
    failed: 0,
    timed_out: 0,
    skipped: 0,
    pending: 0,
    running: 0,
    not_allocated: 0,
    [status]: 3,
  };
  vi.mocked(api.getRunSummary).mockResolvedValue({
    ...report,
    scenarios: [
      {
        ...report.scenarios[0],
        attempts: {
          ...report.scenarios[0].attempts,
          execution_status_counts: counts,
        },
      },
    ],
  });
  await renderPage("?scenario=s1");
  const execution = container.querySelector(
    ".scenario-assessment__group .result-counts",
  )!;
  const persistentStates = ["completed", "failed", "timed_out", "skipped"];
  expect(execution.children).toHaveLength(
    persistentStates.includes(status) ? 4 : 5,
  );
  for (const terminal of persistentStates) {
    expect(
      execution.querySelector(`.result-counts__item--${terminal} dd`)
        ?.textContent,
    ).toBe(terminal === status ? "3" : "0");
  }
  expect(
    execution.querySelector(`.result-counts__item--${status} dd`)?.textContent,
  ).toBe("3");
});

// Normal assessments omit empty diagnostics and scenario-level automatic validation totals.
it("hides empty assessment reasons and scenario tool validation", async () => {
  vi.mocked(api.getRunSummary).mockResolvedValue({
    ...report,
    scenarios: [{ ...report.scenarios[0], reasons: [] }],
  });
  await renderPage("?scenario=s1");
  const matrix = container.querySelector(
    '[aria-label="Assessment and grading matrix"]',
  )!;
  expect(matrix.textContent).not.toContain("Automatic tool validation");
  expect(matrix.textContent).not.toContain("Assessment reasons");
});

// Missing-evidence diagnostics remain visible when the backend supplies reasons.
it("shows reported assessment reasons when present", async () => {
  await renderPage("?scenario=s3");
  const matrix = container.querySelector(
    '[aria-label="Assessment and grading matrix"]',
  )!;
  expect(matrix.textContent).toContain("Assessment reasons");
  expect(matrix.textContent).toContain("Execution evidence is missing.");
  expect(matrix.textContent).toContain("missing_evidence");
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
