# GateKeeper: offline execution through the application

## Selected approach

The developer exposes an authenticated backend endpoint for evaluation requests. GateKeeper selects scenarios from a dataset and calls that endpoint. The application sends those inputs into its normal agent entry point, executing its own tool loop.

```text
GateKeeper dataset
  -> Application evaluation endpoint
  -> Normal application agent loop
       -> Model calls through GateKeeper proxy
       -> Tools executed by application
  -> OTel spans via OTLP + completion/final answer/outcome report
  -> GateKeeper graders and reports
```

This tests the real application/proxy integration as well as agent behavior. Offline means controlled test executions outside live user traffic; it does not mean the model is disconnected or the proxy is bypassed.

## Proposed lifecycle

1. Start an evaluation run, identifying dataset version and application target/version.
2. For each scenario and trial, create a distinct execution ID.
3. Send the scenario stimulus and setup reference to the application's endpoint.
4. The application prepares isolated test state and runs its normal agent entry point with OTel context enabled. Attach the supplied execution ID to its agent invocation span.
5. Record model calls and actual tool executions as correlated spans and export them through OTLP, directly or through a Collector.
6. The application reports completion, agent trace/span IDs, final answer, and relevant outcome evidence through its response, callback, or polling result.
7. GateKeeper waits for trace readiness, checks required evidence, and applies dataset-wide and scenario-specific bindings. Missing evidence produces a cannot-evaluate result.
8. Store per-rule results, aggregate case results, and compare runs or versions.

The UI may initiate a run, but clicking a UI button is not inherent to offline evaluation. An API or CI job can initiate the same workflow.

## Suggested endpoint responsibilities

The exact route name is open. `POST /internal/evaluate` was an example, not an agreed API.

Request information:

- Evaluation run ID, scenario ID, execution ID, and attempt number.
- Typed input: one message, history plus next message, or task goal.
- Test fixture/setup reference and execution limits.
- Target version information if the application supports selecting a version per request.

Completion information:

- Execution ID and status.
- Agent invocation trace ID and span ID for trace association.
- Final answer and relevant artifact identifiers.
- Outcome observations, or a way for GateKeeper to request them from a verifier.
- Error/timeout information where applicable.

GateKeeper should keep expected values and grading rules on the evaluation side. Do not reveal the expected answer to the agent through the test request. Setup references and stimulus are different from grading expectations.

## Completion versus OTel delivery

The execution endpoint and OTLP ingestion endpoint have different responsibilities. The application endpoint starts the task and reports its business result. OTLP carries recorded operations; it does not by itself define GateKeeper's execution-completion protocol.

Completion can arrive before child spans. Maintain separate execution status and evidence-collection status. Define a collection deadline and how the application/export path establishes readiness; mark incomplete evidence explicitly rather than grading absence as success. Export flushing can help, but a root span ending or a local flush alone does not prove GateKeeper received every required span.

Retain every required offline span and record the inputs/results needed by the selected rules. For details, see the [OTel MVP contract](02-otel-and-traces.md). OTel enrichment and the application endpoint are MVP integration work; a custom GateKeeper SDK is not required.

## State and tool behavior

Use isolated test accounts, data, and external-service environments for repeatability. A fixture reference is an instruction to the application to prepare known state; GateKeeper does not execute the application's business tools.

For contextual-turn cases, load the supplied history and generate the next answer. Loading historical messages must not execute their past actions again.

Outcome evidence may be an observed state snapshot or an application-provided verifier. The verifier should inspect authoritative test state rather than trust an agent's statement of success.

## Open protocol choices

- Synchronous completion response versus accepting a job and later callback/polling.
- How application completion and trace export are coordinated.
- Timeout, cancellation, retry, and idempotency behavior. Retrying a dispatch should not accidentally repeat a business action in the same attempt.
- Endpoint registration, authentication, and allowed network destinations.
- Who prepares/resets fixtures and how state is observed after eventual writes.

These details were not decided in the discussion; design them explicitly rather than treating example payloads as final.
