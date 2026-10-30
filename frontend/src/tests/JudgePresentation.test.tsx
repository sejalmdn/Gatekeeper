// @vitest-environment happy-dom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import type {
  EffectiveRuleBinding,
  JudgeRecord,
  RuleEvaluationResult,
} from "../types";
import { AttemptGrading } from "../components/AttemptGrading";
import { AuthoredRuleResult } from "../components/AuthoredRuleResult";
import { JudgeDetails } from "../components/JudgeDetails";
import { evaluatedAttempt, grade } from "./reportingFixtures";

let container: HTMLDivElement;
let root: Root;
const judge: JudgeRecord = {
  configuration: {
    model: "nvidia/nemotron-3.5-lightning:free",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    provider: "openrouter",
    prompt_version: "rubric-v1",
    temperature: 0,
    timeout_seconds: 60,
    max_output_tokens: 4096,
    pricing_version: "openrouter-free-v1",
    input_usd_per_million: 0,
    output_usd_per_million: 0,
  },
  outcome: "completed",
  reason: null,
  requested_model: "nvidia/nemotron-3.5-lightning:free",
  requested_provider: "openrouter",
  reported_model: "nvidia/nemotron-3.5-lightning",
  reported_provider: "Nvidia",
  started_at: evaluatedAttempt.started_at,
  completed_at: evaluatedAttempt.completed_at,
  latency_ms: 123,
  input_tokens: 456,
  output_tokens: 78,
  estimated_usd: "0",
  provider_reported_usd: "0.00000001",
  results: [],
};
const check: RuleEvaluationResult = {
  ...grade.rule_results[0],
  rule_type: "judge.rubric",
  score: 4,
  reason: "rubric_satisfied",
  explanation: "Uses the earlier order ID correctly.",
};
const rule: EffectiveRuleBinding = {
  id: check.rule_binding_id,
  dataset_id: "d",
  scenario_id: "s1",
  rule_key: check.rule_key,
  rule_type: "judge.rubric",
  role: "required",
  severity: "high",
  parameters: {
    criterion: "Use order ORD-1 from history.",
    min_score: 4,
  },
  applies_to: null,
  created_at: "2026-01-01T00:00:00Z",
  source: "scenario",
  overridden_rule_id: null,
};

// Mount isolated result presentations with explicit saved judge observations.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

// Release result views and mocked API reads after every case.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Await result loading in the same way an expanded attempt does.
async function render(element: ReactElement): Promise<void> {
  await act(async () => root.render(element));
}

// Stored outcomes stay authoritative even when a score and threshold are visible.
it.each(["pass", "fail"] as const)(
  "shows the saved %s outcome, score, reason, and frozen criterion",
  async (outcome) => {
    await render(
      <AuthoredRuleResult check={{ ...check, outcome }} rule={rule} />,
    );
    expect(container.textContent).toContain("Judge score: 4/5");
    expect(container.textContent).toContain("Minimum passing score: 4");
    expect(container.textContent).toContain("Use order ORD-1 from history.");
    expect(container.textContent).toContain(
      "Uses the earlier order ID correctly.",
    );
    expect(container.querySelector(".result-badge")?.textContent).toContain(
      outcome,
    );
  },
);

// A missing score is never represented by zero or an invented outcome.
it("shows unavailable scores and missing frozen configuration for historical rules", async () => {
  await render(
    <AuthoredRuleResult
      check={{ ...check, score: null, outcome: "cannot_evaluate" }}
    />,
  );
  expect(container.textContent).toContain("Judge score: Unavailable");
  expect(container.textContent).toContain("Minimum passing score: Unavailable");
  expect(container.textContent).not.toContain("0/5");
});

// Judge diagnostics do not appear in candidate metric components and retain tiny charges.
it("shows separate judge provenance, usage, and exact saved costs", async () => {
  await render(<JudgeDetails judge={judge} />);
  expect(container.textContent).toContain(
    "separate from candidate latency, tokens, and costs",
  );
  expect(container.querySelector("summary")?.textContent).toBe("Judge details");
  expect(container.textContent).toContain(judge.requested_model);
  expect(container.textContent).toContain("rubric-v1");
  expect(container.textContent).toContain("Judge input tokens456");
  expect(container.textContent).toContain("Judge estimated cost (USD)0");
  expect(container.textContent).toContain(
    "Judge provider-reported charge (USD)0.00000001",
  );
  expect(container.querySelector(".result-metrics")).toBeNull();
});

// Partial observations remain unknown independently from valid zero observations.
it("preserves absent judge usage and duration", async () => {
  await render(
    <JudgeDetails
      judge={{
        ...judge,
        latency_ms: null,
        input_tokens: null,
        output_tokens: 0,
      }}
    />,
  );
  expect(container.textContent).toContain("Judge duration (ms)Unavailable");
  expect(container.textContent).toContain("Judge input tokensUnavailable");
  expect(container.textContent).toContain("Judge output tokens0");
});

// Expanded attempts explain grader failures while retaining saved candidate execution status.
it.each([
  ["judge_credential_unavailable", "credentials are unavailable"],
  ["judge_rate_limited", "rate-limited this request"],
  ["judge_timeout", "request timed out"],
  ["judge_malformed_output", "entire rubric batch was rejected"],
  ["response_unavailable", "No candidate response was available"],
] as const)(
  "explains %s without offering to regrade",
  async (reason, message) => {
    vi.spyOn(api, "getAttemptEvaluation").mockResolvedValue({
      ...grade,
      judge: {
        ...judge,
        outcome: "cannot_evaluate",
        reason,
      },
      rule_results: [
        { ...check, score: null, outcome: "cannot_evaluate", reason },
      ],
      rule_configurations: [rule],
    });
    await render(
      <AttemptGrading projectId="p" runId="r" attempt={evaluatedAttempt} />,
    );
    expect(container.textContent).toContain(message);
    expect(container.textContent).toContain(reason);
    expect(container.textContent).toContain("Judge score: Unavailable");
    expect(container.textContent).not.toContain("Retry grade");
    expect(api.getAttemptEvaluation).toHaveBeenCalledTimes(1);
  },
);
