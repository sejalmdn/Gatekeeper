# GateKeeper: reusable rules and evaluation

## Reuse: checking logic versus scenario expectations

A reusable definition describes **how to check** evidence. A binding supplies **what to check for** in a particular scenario.

Example: define `tool_arguments_match` once. Bind it to an order scenario with `lookup_order` and `orderId: 123`; bind it to a calendar scenario with `create_event` and the expected attendee/time.

Two forms of reuse:

- Same definition and settings: never execute `delete_account` across many scenarios.
- Same definition, different settings: finish within 10 seconds for a simple answer or 60 seconds for a complex task.

Not every definition is universal. `refund_state_matches` may be specific to one application's schema while remaining reusable across its refund scenarios.

## Proposed definitions and bindings

```text
RuleDefinition
- identity/version
- evidence it consumes
- parameters it requires
- grading implementation or verifier reference
- result shape: pass/fail or score, with evidence/reason

RuleBinding
- dataset or scenario reference
- rule definition reference/version
- scenario-specific parameters or references to expected values
- required / scored / informational role
```

Dataset-level bindings apply common rules. Scenario-level bindings add case-specific checks. Default override/removal behavior and applicability need an explicit design; they were not agreed.

Potential logical relationships are `Dataset -> Scenario`, `Dataset -> RuleBinding`, and `Scenario -> RuleBinding -> RuleDefinition`. This is a conceptual model; the database and storage schema remain open choices.

## Evaluator context

An evaluator should be able to inspect:

```text
Scenario definition + final answer + execution trace + outcome observations
```

Each definition states which evidence is required. A missing observation must not silently count as success. Distinguish a violated rule from a verifier failure, incomplete trace, or non-applicable check.

## MVP evaluation with OTel evidence

The ingestion layer maps supported OTel spans into the evaluator context. Rules consume normalized evidence, independent of whether a future SDK helps produce it.

| Initial check | Evidence requirement |
|---|---|
| Required/forbidden tool | Actual tool-execution spans; complete relevant trace for absence checks |
| Tool argument validation | Recorded executed-tool arguments, with no missing required fields |
| Final answer schema or quality rubric | Final answer plus any required reference facts/context |
| Execution duration and call counts | Agent lifecycle and complete normalized model/tool operations |
| Token usage | Recorded token counts; unavailable usage remains unknown |
| Outcome matches expectations | Application state observation or verifier result |
| Approval/authorization constraint | Explicit policy facts linked to the relevant action |

Start with these checks and report evidence availability per rule. The exact first evaluator set remains a proposed implementation choice. OTel does not supply grading logic or automatically verify business outcomes. Advanced retry metrics need explicit retry evidence; cost estimates need model usage and a versioned pricing source.

## Four evaluation dimensions

| Dimension | Examples | Typical evidence |
|---|---|---|
| Outcome | Task completed; correct record/artifact; no duplicate or unintended changes | Authoritative final state/artifacts |
| Constraints | Forbidden tools; argument limits; authorization; approval before action; error recovery | Trace and application observations |
| Quality | Correctness, clarity, relevance, claims grounded in tool results | Answer and trace, reference facts/rubric |
| Efficiency | End-to-end latency, steps, model/tool calls, tokens, cost | Timing and usage records |

Use code checks for objective conditions, calibrated LLM rubrics for subjective quality, and human review for ambiguous failures and judge calibration. An LLM judge is not a substitute for checking whether a database write actually happened.

Generic state equality works only after the application exposes relevant facts. The developer defines application-specific expectations and how to obtain authoritative observations. A verifier can inspect test state and return evidence; its exact integration is open.

## Paths and constraints

Do not require one exact execution path by default. Agents can take different valid routes. Prefer outcome checks and constraints such as:

- A prohibited tool was never executed.
- Every refund amount stayed within the allowed limit.
- Approval preceded a charge where policy requires it.
- Exactly one intended reservation exists at completion.

Require ordering only where it represents a real business rule. Preserve the trace to explain why a case failed, not merely to enforce a reference transcript.

## Scoring and metrics

Proposed grading model: required checks gate case success; quality/efficiency scores are reported separately; informational metrics do not gate success. Exact score normalization and thresholds are open. A good final message should not offset a failed required outcome or constraint.

Track task success rate, constraint violation rate, per-rule results, quality scores, latency, tokens, model/tool calls, tool errors, and cost. Cost per successful task is useful alongside cost per attempt. Keep incomplete/error executions visible in reports and define denominators explicitly.

Repeat scenarios because agent behavior can vary. Record success per case across attempts and compare the same versioned cases under controlled fixtures. Optional reliability metrics discussed: `pass@k` means at least one success in k attempts; `pass^k` means all k attempts succeed. Those answer different questions.

Regrading a stored trace tests grading changes. Rerunning the application creates a new execution and tests agent changes. Do not confuse the two.
