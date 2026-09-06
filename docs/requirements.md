# Gatekeeper requirements

## Product

Gatekeeper is a hosted control plane and frontend for evaluating complete agent workflows. A
candidate is an application version plus its runtime configuration, including its workflow,
model, prompt, tool, and environment versions. Applications run in customer environments;
Gatekeeper is not an agent runtime, production orchestrator, or release gate.

An evaluation freezes a candidate, immutable scenario-dataset release, and immutable, versioned
evaluator/scoring configuration release. Comparisons use the same frozen dataset,
evaluator/scoring configuration release, and repeated-run policy for every candidate.

## Scope

- The hosted control plane and frontend manage projects, candidates, immutable datasets,
  evaluations, reports, and aligned comparisons.
- The customer-side runner starts offline evaluations and requests one safe scenario assignment
  at a time. It invokes the local application but submits neither final responses nor traces.
- The required customer-side proxy is the sole model-facing evidence source. It correlates each
  observation with the assigned scenario and records model responses, tool requests/results,
  and other observable behavior.
- Offline evaluation evaluates assigned scenarios after local execution. Passive online
  evaluation samples production traffic through the proxy and evaluates it asynchronously.
  It never delays, alters, blocks, or otherwise guards a user response.
- Assignments contain only safe input/context, controlled-environment references, limits, and
  correlation data. Private expected outcomes, required/forbidden behavior, holdout status,
  and evaluator/scoring configuration never reach the candidate runtime.
- A human may review a failed online trace and promote a redacted, approved case into a new
  versioned offline dataset release. The reviewer supplies expected outcomes and required or
  forbidden behavior; the original production trace remains linked as provenance.

The runner pulls assignments from Gatekeeper. Its transport, endpoint shape, authentication, and
customer integration are still to be designed; this is active scope, not a deferred capability.

## Deterministic evaluation and reports

Gatekeeper supports deterministic outcome, schema, set, and range checks; required and
forbidden actions; action sequences; and policy/safety checks. It excludes LLM-as-a-judge and
guardrail implementation: Gatekeeper evaluates evidence only and never intervenes in a runtime
response.

Reports retain machine-readable reasons, provenance, and evidence references. They show
per-scenario score, stability across repeated attempts, tool-evidence level, flakiness,
severity-weighted suite score, and prominent blocking failures. Aligned comparisons classify
scenario results as regressions, improvements, or stable.

Severity weights and pass thresholds are fields in the immutable, versioned evaluator/scoring
configuration release. `10/5/2/1` is only an example weight scheme, not a product constant.

## Evidence labels and limits

- `tool_requested`: the proxy observed a request to use a tool.
- `tool_result_reported`: the proxy observed a result reported for that tool request.
- `tool_execution_verified`: optional evidence that an authoritative external source confirms
  execution; proxy observation alone cannot establish this label.

Gatekeeper distinguishes workflow, evaluator, infrastructure, and insufficient-evidence
failures. A single non-deterministic attempt is diagnostic, not a definitive candidate result.

## Deferred

Multi-agent orchestration, controlled replay, in-workflow approvals, a CLI product, automatic
promotion of regression cases, LLM-as-a-judge evaluation and its calibration, and
production-response intervention are outside the current scope.
