// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ResultMetrics } from "../components/ResultMetrics";
import { ScenarioOperationalMetrics } from "../components/ScenarioOperationalMetrics";
import type { OperationalMetrics } from "../types";
import { formatUsd } from "../utils/format";

// Tiny monetary observations must remain visibly nonzero and distinct from missing values.
it("preserves tiny decimal amounts, zero, and unavailable costs", () => {
  expect(formatUsd("0.00000000000001")).toBe("0.00000000000001");
  expect(formatUsd("0")).toBe("0");
  expect(formatUsd(null)).toBe("Unavailable");
  expect(formatUsd(undefined)).toBe("Unavailable");
});

// Reports keep costs with token metrics and disclose incomplete estimate coverage.
it("integrates total cost and scenario cost statistics into existing metrics", () => {
  const statistics = {
    observed_count: 3,
    missing_count: 0,
    minimum: 1,
    maximum: 1,
    mean: 1,
    sum: 3,
  };
  const metrics: OperationalMetrics = {
    completed_invocations: 3,
    excluded_unsuccessful_attempts: 0,
    excluded_unexecuted_attempts: 0,
    excluded_in_progress_attempts: 0,
    latency_ms: statistics,
    input_tokens: statistics,
    output_tokens: statistics,
    total_tokens: statistics,
    estimated_cost_usd: {
      observed_count: 1,
      missing_count: 2,
      minimum: "0.00000001",
      maximum: "0.00000001",
      mean: "0.00000001",
      sum: "0.00000001",
      sum_label: "Sum of known estimates",
      pricing_entries: [],
    },
  };
  const top = document.createElement("div");
  top.innerHTML = renderToStaticMarkup(<ResultMetrics metrics={metrics} />);
  const totals = top.querySelectorAll("dl > div");
  expect(totals).toHaveLength(5);
  expect(totals[3].textContent).toContain("Total tokens");
  expect(totals[4].textContent).toBe("Total cost (USD)0.00000001");
  expect(top.textContent).toContain("Cost estimation excludes cache discounts");
  expect(top.textContent).toContain("missing costs are excluded");
  expect(top.querySelector("h4")).toBeNull();
  expect(top.querySelector(".cost-metrics-row__dot")).toBeNull();

  const scenario = document.createElement("div");
  scenario.innerHTML = renderToStaticMarkup(
    <ScenarioOperationalMetrics metrics={metrics} />,
  );
  const rows = scenario.querySelectorAll("tbody tr");
  expect(rows).toHaveLength(5);
  expect(rows[4].textContent).toContain("Estimated cost (USD)");
  const cells = rows[4].querySelectorAll("td");
  expect(cells[0].textContent).toBe("1");
  expect(cells).toHaveLength(5);
  expect(cells[4].textContent).toBe("0.00000001");
  expect(scenario.querySelectorAll("h4")).toHaveLength(1);
  expect(rows[4].querySelector(".cost-metrics-row__dot")).not.toBeNull();
  for (const table of [top, scenario]) {
    expect(
      [...table.querySelectorAll("thead th")].map((cell) => cell.textContent),
    ).not.toContain("Missing");
    expect(table.querySelectorAll("thead th")).toHaveLength(6);
  }

  expect(
    renderToStaticMarkup(
      <ResultMetrics metrics={{ ...metrics, estimated_cost_usd: undefined }} />,
    ),
  ).toContain("Unavailable");
});
