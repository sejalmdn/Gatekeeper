# Gatekeeper: reusable rules and evaluation

## Rules and bindings

A rule definition describes how to evaluate evidence. A binding supplies the expected values and
configuration for a dataset or scenario.

```text
RuleDefinition
- identity and version
- supported scenario types and required evidence
- parameter contract
- deterministic implementation
- result shape and reasons

RuleBinding
- dataset or scenario reference
- definition version
- parameters or expected-value references
- required, scored, or informational role
```

Dataset-level bindings apply defaults across mixed scenario types. Scenario bindings add specific
expectations. Applicability is explicit; a missing required observation yields `cannot_evaluate`
rather than pass.

## Phase 1 evaluator context

```text
Scenario definition + normalized backend-observed ExecutionEvidence
```

Initial deterministic checks include:

| Check | Required evidence |
|---|---|
| Response schema or content | Final response and expected values |
| Required/forbidden deterministic content | Final response |
| Requested tool selection | Complete tool requests observed by the backend integration |
| Tool arguments | Requested arguments and expected values/schema |
| Latency limit | Start/end timing or duration |
| Token limit | Recorded input/output usage |
| Cost | Usage, model identity, and versioned pricing |

Tool-use rules concern requests in Phase 1. Rules for actual execution, returned results, workflow
ordering, or final business state belong to Phase 3.

## Results and metrics

Required rules determine scenario success. Scored and informational results remain separate so a
good efficiency score cannot hide a required-rule failure. Store machine-readable reasons,
provenance, and evidence references.

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

LLM-as-a-judge and subjective rubrics that require it remain outside the committed roadmap.
