# Gatekeeper: reusable rules and evaluation

## Rules and bindings

A rule binding selects a built-in evaluator and supplies its private expected values and settings
for a dataset or scenario.

```text
RuleBinding
- dataset or scenario reference
- rule type and validated parameters
- required, scored, or informational role
- severity
```

Dataset-level bindings apply defaults across mixed scenario types. Scenario bindings add specific
expectations. Applicability is explicit; a missing required observation yields `cannot_evaluate`
rather than pass.

## Rule authoring and effective rules

The dataset detail page combines a scenario list with a detail pane containing the selected
scenario's immutable input and private rules. Scenario selection is addressable through the
`scenario` query parameter. Dataset-level rule authoring and inspection are deferred in the UI;
existing backend contracts and stored dataset defaults remain unchanged.

Add rule opens a full-width form scoped to the selected scenario. Save and Cancel return to that
scenario; successful saves refresh its rules and counts. Type-specific forms cover deterministic
rules; semantic judge authoring is not enabled. Saved rules can be inspected but cannot yet be
edited, deleted, or executed through this UI.

An applicable scenario binding with the same `rule_key` completely replaces the dataset default,
including its parameters, role, and severity. Other applicable defaults remain inherited. A default
that does not apply to the selected scenario type is never reported as overridden.

`GET /v1/projects/{project_id}/datasets/{dataset_id}/scenarios/{scenario_id}/effective-rules`
returns the resolved rules with `source` (`dataset` or `scenario`) and `overridden_rule_id` when
an applicable default was replaced. The endpoint and future evaluation engine share a pure rule
resolver. This inspection does not invoke a candidate or evaluator. Rule expectations remain
separate from immutable scenario inputs, and explicit JSON null assertion operands survive storage.

## Phase 1 evaluator context

```text
Scenario definition + normalized backend-observed ExecutionEvidence
```

Phase 1 rule types include:

| Family | Rule types |
|---|---|
| Operational | `metric.latency`, `metric.tokens`, `metric.cost` |
| Response | `response.required_text`, `response.forbidden_text`, `response.regex`, `response.json_valid`, `response.json_schema`, `response.json_field`, `response.length` |
| Semantic | `judge.rubric` |
| Tool request | `tool.selection`, `tool.argument_field`, `tool.expected_calls` |

Every tool request is automatically parsed as JSON and validated against the corresponding tool
schema declared by the candidate. These checks are not configurable rule bindings. Tool-specific
rules add private scenario expectations. Multiple tool requests emitted in one model response are
matched without assigning execution order. Repeated requests to the same tool are supported by
unordered one-to-one expected-call matching.

Tool-use rules concern requests in Phase 1. Rules for actual execution, returned results, workflow
ordering, or final business state belong to Phase 3.

## Parameter examples

```json
{
  "rule_type": "response.regex",
  "parameters": {
    "pattern": "ORD-[0-9]+",
    "mode": "search",
    "flags": ["IGNORECASE"]
  }
}
```

JSON field assertions use JSON Pointer, such as `/customer/address/city` or `/items/1/id`, and one
of `exists`, `not_exists`, `equals`, `not_equals`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, or
`between`.

```json
{
  "rule_type": "judge.rubric",
  "parameters": {
    "criterion": "Uses the order ID from history without asking for it again.",
    "min_score": 4
  }
}
```

The deployment-configured judge evaluates all applicable rubric rules for one attempt in one
batched request. It returns a score from 1 through 5 and a reason for each rule key. Judge latency,
usage, cost, and failures remain separate from candidate metrics.

## Results and metrics

Required rules determine scenario success. Scored and informational results remain separate so a
good efficiency score cannot hide a required-rule failure. Store machine-readable reasons,
provenance, and evidence references.

Scored rules use fixed severity weights: `critical = 4`, `high = 3`, `medium = 2`, and `low = 1`.
The numbers express relative influence when scored results are aggregated. Required rules determine
pass/fail regardless of severity, while informational rules do not contribute to scoring. The
weights are product constants and cannot vary by run.

Track pass rate, per-rule results, latency, input/output tokens, model-call count when reported,
errors, and cost where derivable. Define denominators and keep failed, timed-out, and incomplete
attempts visible. Never substitute zero for unavailable evidence.

Repeat scenarios to measure nondeterminism. Report attempt and scenario counts, stability, and
flakiness. `pass@k` and `pass^k` may be reported when clearly defined. Regrading stored evidence
tests evaluator changes; reinvoking the configured target tests candidate changes.

## Later phases

Phase 2 applies compatible deterministic rules to sampled proxy evidence using configured
production bindings. Without a reference answer, it monitors contracts and anomalies rather than
claiming semantic correctness.

Phase 3 extends the evaluator context with OTel operations and authoritative outcome observations.
Rules must distinguish tool requests, reported results, observed executions, and verified state.
