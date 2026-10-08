# Gatekeeper: OTel and execution traces

## Roadmap position

OTel integration belongs to Phase 3. It is not required for the offline MVP or the Phase 2
model-proxy integration. Phase 1 must still define normalized execution evidence so OTel can later
be added as another evidence producer.

## Phase 3 purpose

Use the application's existing OTel instrumentation and OTLP export to observe workflow operations,
including actual tool execution. Gatekeeper initially supports one documented GenAI instrumentation
format and convention version. An OTel Collector may export to Gatekeeper and an existing monitoring
backend.

```text
Application with OTel -> OTLP/Collector -> Gatekeeper OTel adapter
                                      -> normalized ExecutionEvidence
                                      -> evaluators
```

## Correlation

- An execution ID identifies one offline attempt or production execution.
- An evaluation-run ID groups offline attempts.
- Trace, span, parent, and link identifiers preserve operation relationships.
- A tool-call ID links a requested tool to an observed execution when available.

Execution and trace IDs remain distinct. Async or detached work must propagate or explicitly link
the execution identity. OTel delivery may be delayed or incomplete, so application completion and
trace readiness are separate states.

## Evidence levels

Gatekeeper must keep these facts separate:

1. The model requested a tool.
2. A tool result was reported to the model.
3. An application tool span recorded execution.
4. An authoritative source verified the resulting state.

An OTel span is execution evidence, but only an authoritative state observation or verifier can
establish `tool_execution_verified`. Missing, sampled, truncated, or redacted evidence remains
explicit. An incomplete trace cannot prove that a forbidden operation did not occur.

## Phase 3 evidence

Depending on the configured rules, normalized evidence may include agent lifecycle, model calls,
actual tool operations, errors, timestamps, token usage, final output, and outcome observations.
Gatekeeper preserves raw supported spans separately from normalized evidence and scores so stored
executions can be regraded.

Ingestion must be authenticated, tenant-isolated, idempotent, and able to assemble out-of-order
spans. Exact OTLP transport, semantic-convention version, retention, and readiness protocol will be
designed when Phase 3 begins.

OTel provides observations and transport. It does not provide grading logic or automatically prove
business outcomes.
