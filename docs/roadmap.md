# Gatekeeper delivery roadmap

Delivery stays within the current hosted-control-plane, frontend, runner, proxy, offline, and
passive-online scope. Each stage needs acceptance criteria before implementation. Every feature
slice delivers the contract, JSON Schema, validation, and tests for the boundary it exposes or
persists; do not create contracts or schemas for unrealized capabilities.

## Stage 1: control-plane foundations

- Deliver projects and candidates, with each candidate defined as an application version plus
  runtime configuration.
- Deliver immutable scenario-dataset releases and frozen references to candidates, datasets,
  evaluator/scoring configuration, thresholds, severity weights, and repeated-run policy.

Acceptance: a created evaluation can reference only immutable, versioned inputs, while expected
outcomes, required/forbidden behavior, evaluator/scoring configuration, and holdout status remain
private to Gatekeeper.

## Stage 2: offline evaluation lifecycle

- Deliver evaluation creation and lifecycle management.
- Decide and deliver the runner-initiated, one-at-a-time assignment pull interface for this
  feature, sending only safe input/context, controlled-environment references, limits, and
  correlation data.

Acceptance: the runner can pull one safe assignment at a time and invoke the local application
without receiving private rules or submitting final responses, traces, or final-state evidence.

## Stage 3: proxy evidence ingestion

- Deliver correlated proxy observations for offline assignments and the model-facing evidence
  boundary.
- Record `tool_requested` and `tool_result_reported` as observations; record
  `tool_execution_verified` only with authoritative external evidence.

Acceptance: Gatekeeper can link proxy evidence to its assignment without treating an unverifiable
tool result as proof of execution.

## Stage 4: offline deterministic evaluation

- Deliver frozen deterministic outcome, schema, set, range, required/forbidden action, sequence,
  and policy/safety evaluation rules.
- Preserve evaluator results and distinguish workflow, evaluator, infrastructure, and
  insufficient-evidence failures.

Acceptance: private frozen rules evaluate proxy evidence only; Gatekeeper uses neither an LLM
judge nor a production-response intervention.

## Stage 5: offline reports

- Deliver repeated-attempt aggregation and per-scenario stability, flakiness, attempt/scenario
  counts, score, tool-evidence level, machine-readable reasons, evidence references, and
  provenance.
- Publish severity-weighted suite scores and prominent blocking failures under the frozen policy.

Acceptance: one non-deterministic attempt is reported as diagnostic evidence, not as a definitive
candidate result.

## Stage 6: passive online evaluation and comparison

- Deliver asynchronous proxy sampling and online evaluation that never delays, alters, blocks, or
  otherwise intervenes in a user response.
- Deliver aligned comparisons that classify results as regressions, improvements, or stable only
  under matching frozen datasets, evaluator/scoring configuration, and repeated-run policy.
- Deliver human review, redaction, and promotion of approved online failures into new versioned
  offline dataset releases, with private reviewer-supplied rules and linked source-trace
  provenance.

Acceptance: online evidence remains observational, and any promoted case is a new immutable
dataset release rather than production trace input to an offline runtime.

Deferred: multi-agent orchestration, controlled replay, in-workflow approvals, a CLI,
automatic promotion of regression cases, and any production blocking or intervention. LLM
judges are also deferred; if separately planned, they require a versioned, human-labeled golden
calibration dataset and agreement reporting alongside candidate evaluations.
