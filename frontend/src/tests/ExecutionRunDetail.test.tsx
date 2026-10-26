// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { EvaluationRunDetail } from "../pages/EvaluationRunDetail";
import { EvaluationRuns } from "../pages/EvaluationRuns";
import type { ExecutionAttempt, ExecutionAttemptDetail } from "../types";
import {
  candidate,
  dataset,
  settings,
  run as pendingRun,
} from "./executionFixtures";

let container: HTMLDivElement;
let root: Root;
const run = {
  ...pendingRun,
  status: "running" as const,
  queued_at: candidate.created_at,
  snapshot_digest: "snapshot-digest",
  total_attempts: 18,
  finished_attempts: 1,
};
const attempt: ExecutionAttempt = {
  id: "execution-1",
  run_id: "r",
  scenario_id: "scenario-1",
  scenario_key: "refund",
  scenario_name: "Refund policy",
  scenario_type: "single_turn",
  attempt_number: 1,
  status: "completed",
  started_at: candidate.created_at,
  completed_at: candidate.created_at,
  error: null,
};
const detail: ExecutionAttemptDetail = {
  ...attempt,
  request: { messages: [{ role: "user", content: "My order?" }] },
  response: { id: "provider-1" },
  evidence: {
    version: 1,
    execution_id: attempt.id,
    run_id: "r",
    scenario_id: attempt.scenario_id,
    attempt_number: 1,
    status: "completed",
    started_at: candidate.created_at,
    completed_at: candidate.created_at,
    duration_ms: 42,
    response_text: "Your order is on its way.",
    refusal: null,
    finish_reason: "stop",
    requested_model: candidate.model_name,
    returned_model: "actual/model",
    provider_request_id: "provider-1",
    provider_type: "openrouter",
    adapter: candidate.adapter,
    source: "direct_provider_response",
    tool_requests: [
      {
        call_id: "call-1",
        name: "lookup_order",
        arguments_text: '{"order_id":"ORD-1"}',
        arguments: { order_id: "ORD-1" },
        issues: [],
      },
    ],
    input_tokens: null,
    output_tokens: 0,
    completeness_issues: ["usage_unavailable"],
    error: null,
  },
};

// Isolates real route and evidence interactions from provider transport.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "getEvaluationRun").mockResolvedValue(run);
  vi.spyOn(api, "listEvaluationRuns").mockResolvedValue([run]);
  vi.spyOn(api, "listExecutionAttempts").mockResolvedValue([attempt]);
  vi.spyOn(api, "getExecutionAttempt").mockResolvedValue(detail);
  vi.spyOn(api, "getCandidate").mockResolvedValue(candidate);
  vi.spyOn(api, "getDataset").mockResolvedValue(dataset);
  vi.spyOn(api, "getRunSettings").mockResolvedValue(settings);
  vi.spyOn(api, "startEvaluationRun").mockResolvedValue(run);
  vi.spyOn(api, "cancelEvaluationRun").mockResolvedValue(run);
});

// Removes polling work and restores timers and transport after every test.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Exercises shareable routes, including the execution history ledger.
async function renderPage(
  path = "/projects/p/evaluation-runs/r",
): Promise<void> {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/projects/:projectId/evaluation-runs/:recordId"
            element={<EvaluationRunDetail />}
          />
          <Route
            path="/projects/:projectId/evaluation-runs"
            element={<EvaluationRuns />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

// Finds actions by visible wording rather than implementation selectors.
function button(label: string): HTMLButtonElement {
  return [...container.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  )!;
}

// Large artifacts load only when an attempt is opened and unavailable usage stays explicit.
it("opens response and tool request evidence on click", async () => {
  await renderPage();
  expect(container.textContent).toContain("1 / 18 attempts finished");
  expect(container.textContent).toContain("Pass threshold · inactive");
  expect(api.getExecutionAttempt).not.toHaveBeenCalled();
  const open = container.querySelector<HTMLButtonElement>(
    '[aria-controls="attempt-execution-1"]',
  )!;
  await act(async () => open.click());
  expect(api.getExecutionAttempt).toHaveBeenCalledExactlyOnceWith(
    "p",
    "r",
    "execution-1",
  );
  expect(container.textContent).toContain("Your order is on its way.");
  expect(container.textContent).toContain(
    "Requested only · tool was not executed",
  );
  expect(container.textContent).toContain("Unavailable");
  expect(container.textContent).toContain("actual/model");
  expect(
    container.querySelector('[aria-label="Provider request JSON"]'),
  ).not.toBeNull();
  await act(async () => open.click());
  expect(container.textContent).not.toContain("Your order is on its way.");
});

// Active runs poll until terminal state, then stop issuing progress requests.
it("polls active runs and stops after completion", async () => {
  vi.useFakeTimers();
  await renderPage();
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...run,
    status: "completed",
    finished_attempts: 18,
  });
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(container.textContent).toContain("18 / 18 attempts finished");
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(api.getEvaluationRun).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain("Cancel run");
});

// Refresh failures preserve the last successful view and can be retried explicitly.
it("retains progress after a polling failure and offers refresh", async () => {
  vi.useFakeTimers();
  await renderPage();
  vi.mocked(api.getEvaluationRun).mockRejectedValueOnce(
    new Error("Connection unavailable"),
  );
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(container.textContent).toContain("Connection unavailable");
  expect(container.textContent).toContain("Refund policy");
  await act(async () => button("Refresh").click());
  expect(container.textContent).not.toContain("Connection unavailable");
  expect(api.getEvaluationRun).toHaveBeenCalledTimes(3);
});

// A pending saved run retries starting without creating another run or settings record.
it("retries failed starts on the same pending run", async () => {
  vi.mocked(api.getEvaluationRun).mockResolvedValue(pendingRun);
  vi.mocked(api.startEvaluationRun).mockRejectedValueOnce(
    new Error("Candidate configuration invalid"),
  );
  await renderPage();
  await act(async () => button("Start run").click());
  expect(container.textContent).toContain("Candidate configuration invalid");
  vi.mocked(api.getEvaluationRun).mockResolvedValue(run);
  await act(async () => button("Start run").click());
  expect(api.startEvaluationRun).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("1 / 18 attempts finished");
});

// Cancellation is visible while the current provider request finishes.
it("requests cancellation and disables the repeated action", async () => {
  await renderPage();
  vi.mocked(api.getEvaluationRun).mockResolvedValue({
    ...run,
    cancel_requested_at: candidate.created_at,
  });
  await act(async () => button("Cancel run").click());
  expect(api.cancelEvaluationRun).toHaveBeenCalledExactlyOnceWith("p", "r");
  expect(container.textContent).toContain("Stopping after the current attempt");
  expect(button("Cancel run").disabled).toBe(true);
});

// Unmount must stop scheduling future polling requests.
it("cleans up polling on navigation away", async () => {
  vi.useFakeTimers();
  await renderPage();
  await act(async () => root.render(<p>Another page</p>));
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(api.getEvaluationRun).toHaveBeenCalledTimes(1);
});

// Saved history links directly to evidence routes and reports actual persisted status.
it("lists saved executions with shareable evidence links", async () => {
  await renderPage("/projects/p/evaluation-runs");
  expect(
    container.querySelector('a[href="/projects/p/evaluation-runs/r"]'),
  ).not.toBeNull();
  expect(container.textContent).toContain("1 / 18 attempts");
  expect(container.textContent).toContain("running");
});
