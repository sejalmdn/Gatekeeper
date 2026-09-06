# Measurement credibility

## Frozen, aligned measurement

Gatekeeper measures a candidate: an application version plus its runtime configuration. Each
evaluation freezes the candidate, immutable scenario-dataset release, and immutable, versioned
evaluator/scoring configuration release with its thresholds, severity weights, and repeated-run
policy. A comparison is
credible only when these are aligned for all candidates.

Outcome is primary. Model responses, tool observations, and trajectories are diagnostic
evidence. Do not infer a definitive result from one non-deterministic attempt; aggregate at the
scenario level and retain attempt and scenario counts.

## Private scenarios and proxy evidence

Gatekeeper sends an offline runner one safe scenario at a time. The runner invokes the local
application but sends no final-response or trace evidence. The required proxy is the sole
model-facing evidence source and correlates observations with that scenario. For passive online
evaluation it samples the same evidence from traffic and sends it for asynchronous evaluation;
it cannot delay, alter, block, or intervene in the response.

The runner initiates the assignment pull. Its transport and customer integration remain to be
designed, but must preserve these evidence and privacy boundaries.

Expected outcomes, required/forbidden behavior, evaluator/scoring configuration, and holdout
status remain private to Gatekeeper. Dataset releases are immutable and should cover normal,
ambiguous, invalid, tool-failure, recovery, safety, and multi-step cases.

A human may review a failed online trace and promote an approved, redacted case into a new
versioned offline dataset release. The reviewer supplies the expected outcome and any required
or forbidden behavior. The original production trace remains linked as provenance and never
becomes an offline runtime input.

Proxy evidence labels state what was observed:

- `tool_requested` records a tool request observed by the proxy.
- `tool_result_reported` records a reported result observed by the proxy.
- `tool_execution_verified` is optional and requires authoritative evidence beyond the proxy.

## Deterministic decisions and reporting

Supported deterministic evaluators are outcome/schema/set/range checks, required and forbidden
actions, action sequences, and policy/safety checks. LLM-as-a-judge and guardrails are not
supported: Gatekeeper evaluates evidence only and never intervenes in a runtime response.

If LLM-as-a-judge is separately scoped later, its evaluator must first be calibrated against a
separate, versioned golden dataset of traces with human-authored correct verdicts. Report its
agreement with those labels alongside candidate evaluations; do not treat that calibration set
as a candidate scenario dataset. Calibration is not current scope.

Reports preserve machine-readable reasons, evidence references, and provenance. They report
per-scenario score, stability, tool-evidence level, flakiness, severity-weighted suite score,
and prominent blocking failures. Severity weights and pass thresholds belong to immutable,
versioned frozen configuration releases; `10/5/2/1` is an example, not a fixed scheme.
Comparisons use aligned buckets:
regressions, improvements, and stable.

Keep workflow, evaluator, infrastructure, and insufficient-evidence failures separate. An
unverifiable tool result is insufficient evidence, not proof of successful execution.
