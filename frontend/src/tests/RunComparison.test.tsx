// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as api from "../api";
import { RunComparisonPage } from "../pages/RunComparisonPage";
import { ComparisonSummary } from "../components/ComparisonSummary";
import { ComparisonStatistics } from "../components/ComparisonStatistics";
import { ComparisonScenario } from "../components/ComparisonScenario";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ComparisonSide,
  RunComparison,
  ScenarioComparison,
} from "../types";
import { candidate, run, settings } from "./executionFixtures";

let container: HTMLDivElement;
let root: Root;
const first = { ...run, id: "a", status: "completed" as const };
const second = { ...run, id: "b", status: "cancelled" as const };
const metadata = {
  id: "a",
  candidate_id: candidate.id,
  candidate_name: candidate.name,
  model: candidate.model_name,
  dataset_id: run.dataset_id,
  dataset_name: "Dataset",
  status: "completed" as const,
  created_at: candidate.created_at,
  started_at: null,
  completed_at: null,
  settings,
};
const unavailable: RunComparison = {
  project_id: "p",
  run_a: metadata,
  run_b: { ...metadata, id: "b" },
  availability: "unavailable",
  reason: "frozen_snapshot_unavailable",
  warnings: [],
  aggregate_a: null,
  aggregate_b: null,
  differences: null,
  scenarios: [],
};

// Mounts real selectors and URL state with isolated saved API data.
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(api, "listEvaluationRuns").mockResolvedValue([first, second]);
  vi.spyOn(api, "listCandidates").mockResolvedValue([candidate]);
  vi.spyOn(api, "getRunComparison").mockResolvedValue(unavailable);
});

// Cleans up React subscriptions and request mocks after each interaction test.
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Uses the real route so selectors retain refreshable query parameters.
async function mount(query: string) {
  await act(async () =>
    root.render(
      <MemoryRouter
        initialEntries={[`/projects/p/evaluation-runs/compare${query}`]}
      >
        <Routes>
          <Route
            path="/projects/:projectId/evaluation-runs/compare"
            element={<RunComparisonPage />}
          />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

// Restores linked selections and explains historical gaps without discarding identities.
it("restores URL selections, history gaps, and links to original reports", async () => {
  await mount("?runA=a&runB=b");
  expect(api.getRunComparison).toHaveBeenCalledWith("p", "a", "b");
  expect(container.textContent).toContain("Historical comparison unavailable");
  expect(container.querySelector("select")).toBeNull();
  expect(container.querySelector(".run-comparison__dataset")?.textContent).toBe(
    "Dataset: Dataset",
  );
  expect(container.querySelectorAll(".comparison-run-card")).toHaveLength(2);
  for (const card of container.querySelectorAll(".comparison-run-card")) {
    expect(card.textContent).not.toContain("Dataset");
    expect(card.textContent).not.toContain("Run details");
  }
  expect(
    container.querySelector(
      'a[href="/projects/p/compare-candidates?runA=a&runB=b"]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector('a[href="/projects/p/evaluation-runs/a"]'),
  ).not.toBeNull();
});

// Broken links retain editable selectors and retry the same saved identities.
it("retains invalid linked choices and offers retry after API errors", async () => {
  vi.mocked(api.getRunComparison).mockRejectedValueOnce(
    new Error("different datasets"),
  );
  await mount("?runA=a&runB=missing");
  expect(container.textContent).toContain("different datasets");
  expect(
    container.querySelector(
      'a[href="/projects/p/compare-candidates?runA=a&runB=missing"]',
    ),
  ).not.toBeNull();
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Retry")
      ?.click(),
  );
  expect(api.getRunComparison).toHaveBeenCalledTimes(2);
});

const stats = {
  observed_count: 1,
  missing_count: 0,
  minimum: 0,
  maximum: 0,
  mean: 0,
  sum: 0,
};
const side: ComparisonSide = {
  attempts: {
    planned_attempts: 3,
    passing_attempts: 1,
    decisive_attempts: 1,
    pass_rate: 1 / 3,
    execution_status_counts: {},
    evaluation_verdict_counts: { pass: 1, not_evaluated: 2 },
  },
  pass_rate: null,
  reason: "no_common_required_rules",
  score: {
    planned_weight: 0,
    known_weight: 0,
    passing_weight: 0,
    coverage: null,
    weighted_score: null,
    reason: "no_scored_rules",
  },
  metrics: {
    completed_invocations: 1,
    excluded_unsuccessful_attempts: 1,
    excluded_unexecuted_attempts: 1,
    excluded_in_progress_attempts: 0,
    latency_ms: stats,
    input_tokens: stats,
    output_tokens: stats,
    total_tokens: stats,
    estimated_cost_usd: {
      ...stats,
      minimum: "0",
      maximum: "0",
      mean: "0",
      sum: "0",
      sum_label: "Sum of known estimates",
      pricing_entries: [],
    },
  },
  included_scenarios: 0,
  excluded_scenarios: 1,
};
const delta = {
  pass_rate_pp: null,
  weighted_score_pp: null,
  metrics: { estimated_cost_usd: { sum: "-0.00000000000001" } },
};

// Preserves exact money differences in the streamlined operational table.
it("renders decimal differences without the coverage and pricing section", async () => {
  await act(async () =>
    root.render(<ComparisonStatistics a={side} b={side} delta={delta} />),
  );
  expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  const all = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "All observations",
  )!;
  await act(async () => all.click());
  expect(all.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelectorAll("tbody tr")).toHaveLength(20);
  expect(container.textContent).toContain("-0.00000000000001");
  expect(container.textContent).not.toContain("Observation coverage");
  expect(container.textContent).not.toContain("Saved pricing entries");
  expect(container.querySelector("thead")?.textContent).not.toContain(
    "Missing",
  );
});

// Metrics-only scenarios explain common-rule gaps without evidence links.
it("shows no-common-rule scenarios and exclusive counts without evidence links", () => {
  const scenario: ScenarioComparison = {
    scenario_id: "s",
    scenario_key: "key",
    scenario_name: "Scenario",
    run_a: side,
    run_b: side,
    differences: delta,
    common_rules: [],
    only_in_run_a: [],
    only_in_run_b: [],
  };
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ComparisonScenario scenario={scenario} />
    </MemoryRouter>,
  );
  expect(html).toContain("No common rules");
  expect(html).not.toContain("Exclusive rules");
  expect(html).not.toContain("Outcome counts");
  expect(html).not.toContain("evidence ↗");
});

// Prominent warnings precede results even for metrics-only comparisons.
it("shows settings warnings and metrics-only explanations", async () => {
  vi.mocked(api.getRunComparison).mockResolvedValue({
    ...unavailable,
    availability: "available",
    reason: null,
    warnings: [
      "different_attempts_per_scenario",
      "single_attempt_evidence",
      "no_common_rules_metrics_only",
    ],
    aggregate_a: side,
    aggregate_b: side,
    differences: delta,
  });
  await mount("?runA=a&runB=b");
  expect(container.textContent).toContain("different attempts per scenario");
  expect(container.textContent).toContain("single attempt evidence");
  expect(container.textContent).toContain("no common rules metrics only");
});

// Swapping persists the new run order so every delta is recomputed by the API.
it("swaps selections and requests the reversed comparison", async () => {
  await mount("?runA=a&runB=b");
  const swap = container.querySelector<HTMLButtonElement>(
    ".run-comparison__swap",
  )!;
  await act(async () => swap.click());
  expect(api.getRunComparison).toHaveBeenLastCalledWith("p", "b", "a");
});

// Scenario drill-down keeps pass rates and operational observations in separate views.
it("opens a scenario and switches to operational metrics", async () => {
  const rule = {
    rule_binding_id: "binding-1",
    rule_key: "required-text",
    rule_type: "response.required_text" as const,
    role: "required" as const,
    severity: "high" as const,
    planned_results: 3,
    outcome_counts: { pass: 1, not_evaluated: 2 },
  };
  const scenario: ScenarioComparison = {
    scenario_id: "s",
    scenario_key: "refund",
    scenario_name: "Refund policy",
    run_a: side,
    run_b: side,
    differences: delta,
    common_rules: [
      {
        run_a: rule,
        run_b: rule,
        pass_rate_a: 1 / 3,
        pass_rate_b: 1 / 3,
        pass_rate_difference_pp: 0,
      },
    ],
    only_in_run_a: [],
    only_in_run_b: [],
  };
  await act(async () =>
    root.render(
      <MemoryRouter>
        <ComparisonScenario scenario={scenario} />
      </MemoryRouter>,
    ),
  );
  const accordion = container.querySelector<HTMLDetailsElement>(
    ".comparison-scenario",
  )!;
  expect(accordion.open).toBe(false);
  await act(async () => accordion.querySelector("summary")!.click());
  expect(accordion.open).toBe(true);
  expect(
    container.querySelector(".comparison-scenario__table")?.textContent,
  ).toContain("33.33%");
  expect(container.querySelector(".comparison-statistics")).toBeNull();
  expect(
    container.querySelector(".comparison-scenario__rule-type")?.textContent,
  ).toBe("response.required_text");
  expect(container.textContent).not.toContain("planned attempts");
  expect(container.querySelector("a")).toBeNull();
  const operational = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Operational metrics",
  )!;
  await act(async () => operational.click());
  expect(container.querySelector(".comparison-scenario__table")).toBeNull();
  expect(container.querySelector(".comparison-statistics")).not.toBeNull();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  expect(container.textContent).not.toContain("All observations");
  expect(container.textContent).not.toMatch(/\btok\b/);
  const rates = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Rule pass rates",
  )!;
  await act(async () => rates.click());
  expect(container.querySelector(".comparison-scenario__table")).not.toBeNull();
});

// Filters use numerical differences and keep unavailable rates separate from unchanged rates.
it("filters changed, same, and unavailable scenario rates", async () => {
  const makeScenario = (
    id: string,
    value: number | null,
  ): ScenarioComparison => ({
    scenario_id: id,
    scenario_key: id,
    scenario_name: id,
    run_a: side,
    run_b: side,
    differences: {
      ...delta,
      pass_rate_pp: value,
    },
    common_rules: [],
    only_in_run_a: [],
    only_in_run_b: [],
  });
  vi.mocked(api.getRunComparison).mockResolvedValue({
    ...unavailable,
    availability: "available",
    scenarios: [
      makeScenario("changed", 50),
      makeScenario("same", 0),
      makeScenario("unknown", null),
    ],
  });
  await mount("?runA=a&runB=b");
  expect(container.querySelectorAll(".comparison-scenario")).toHaveLength(3);
  const filter = [
    ...container.querySelectorAll(".comparison-results__filters button"),
  ].find((button) =>
    button.textContent?.startsWith("Changed rates"),
  ) as HTMLButtonElement;
  await act(async () => filter.click());
  expect(container.querySelectorAll(".comparison-scenario")).toHaveLength(1);
  expect(
    container.querySelector(".comparison-scenario__title")?.textContent,
  ).toBe("changed");
  const unknown = [
    ...container.querySelectorAll(".comparison-results__filters button"),
  ].find((button) =>
    button.textContent?.startsWith("Unavailable"),
  ) as HTMLButtonElement;
  await act(async () => unknown.click());
  expect(
    container.querySelector(".comparison-scenario__title")?.textContent,
  ).toBe("unknown");
});

// Keeps signed rule deltas distinct and lists only populated exclusive-rule groups.
it("colors rule changes and shows exclusive rules without outcome counts", async () => {
  const rule = {
    rule_binding_id: "binding",
    rule_key: "Required text",
    rule_type: "response.required_text" as const,
    role: "required" as const,
    severity: "high" as const,
    planned_results: 3,
    outcome_counts: { pass: 1, not_evaluated: 2 },
  };
  const scenario: ScenarioComparison = {
    scenario_id: "s",
    scenario_key: "scenario",
    scenario_name: "Scenario",
    run_a: side,
    run_b: side,
    differences: delta,
    common_rules: [25, -25, 0, null].map((change, index) => ({
      run_a: { ...rule, rule_binding_id: `binding-${index}` },
      run_b: rule,
      pass_rate_a: 0.5,
      pass_rate_b: change === null ? null : 0.5 + change / 100,
      pass_rate_difference_pp: change,
    })),
    only_in_run_a: [rule],
    only_in_run_b: [],
  };
  await act(async () =>
    root.render(<ComparisonScenario scenario={scenario} />),
  );
  const changes = container.querySelectorAll(
    ".comparison-scenario__rule-delta",
  );
  expect(changes[0].className).toContain("--positive");
  expect(changes[1].className).toContain("--negative");
  expect(changes[2].className).toContain("--neutral");
  expect(changes[3].className).toContain("--neutral");
  const exclusive = container.querySelector(".comparison-scenario__exclusive")!;
  expect(exclusive.textContent).toContain("Only in Run A (1)");
  expect(exclusive.textContent).not.toContain("Only in Run B");
  expect(exclusive.textContent).not.toContain("not_evaluated");
  expect(container.textContent).not.toContain("Outcome counts");
});

// Summary colors reflect metric direction while preserving signed decimal deltas.
it("shows bracketed signed changes on summary cards", async () => {
  await act(async () =>
    root.render(
      <ComparisonSummary
        a={side}
        b={side}
        delta={{
          pass_rate_pp: 25,
          weighted_score_pp: -10,
          metrics: {
            latency_ms: { mean: 0 },
            total_tokens: { mean: null },
            estimated_cost_usd: { sum: "-0.00000000000001" },
          },
        }}
      />,
    ),
  );
  const cards = container.querySelectorAll(".comparison-summary__card");
  expect(cards[0].querySelector("strong")?.className).toContain("--positive");
  expect(cards[0].textContent).toContain("(+25 pp)");
  expect(cards[1].querySelector("strong")?.className).toContain("--negative");
  expect(cards[1].textContent).toContain("(-10 pp)");
  expect(cards[2].querySelector("strong")?.className).toContain("--neutral");
  expect(cards[2].querySelector(".comparison-summary__change")).toBeNull();
  expect(cards[2].querySelector("small")?.textContent).toBe("Milliseconds");
  expect(cards[3].querySelector("strong")?.className).toContain("--neutral");
  expect(cards[4].querySelector("strong")?.className).toContain("--positive");
  expect(cards[4].textContent).toContain("(-0.00000000000001)");
});

// Lower resource use is favorable; zero and unavailable evidence remain neutral.
it("colors scenario metric deltas and preserves neutral values", async () => {
  await act(async () =>
    root.render(
      <ComparisonStatistics
        a={side}
        b={side}
        summaryOnly
        delta={{
          pass_rate_pp: null,
          weighted_score_pp: null,
          metrics: {
            latency_ms: { mean: -10 },
            input_tokens: { mean: 12 },
            output_tokens: { mean: 0 },
            total_tokens: { mean: null },
            estimated_cost_usd: { mean: "0.00000000000001" },
          },
        }}
      />,
    ),
  );
  const changes = container.querySelectorAll(".comparison-statistics__delta");
  expect(changes[0].className).toContain("--positive");
  expect(changes[1].className).toContain("--negative");
  expect(changes[2].className).toContain("--neutral");
  expect(changes[3].className).toContain("--neutral");
  expect(changes[4].className).toContain("--negative");
  expect(changes[4].textContent).toContain("0.00000000000001");
});

// Summary efficiency colors reverse with resource usage, without reversing delta signs.
it.each([-10, 10])(
  "uses efficiency colors on summary resources for delta %s",
  async (change) => {
    await act(async () =>
      root.render(
        <ComparisonSummary
          a={side}
          b={side}
          delta={{
            pass_rate_pp: change,
            weighted_score_pp: change,
            metrics: {
              latency_ms: { mean: change },
              total_tokens: { mean: change },
              estimated_cost_usd: { sum: String(change) },
            },
          }}
        />,
      ),
    );
    const cards = container.querySelectorAll(".comparison-summary__card");
    const rateColor = change > 0 ? "--positive" : "--negative";
    const resourceColor = change < 0 ? "--positive" : "--negative";
    for (const card of [...cards].slice(0, 2)) {
      expect(card.querySelector("strong")?.className).toContain(rateColor);
    }
    for (const card of [...cards].slice(2)) {
      expect(card.querySelector("strong")?.className).toContain(resourceColor);
      expect(
        card.querySelector(".comparison-summary__change")?.textContent,
      ).toContain(change > 0 ? "+10" : "-10");
    }
  },
);
