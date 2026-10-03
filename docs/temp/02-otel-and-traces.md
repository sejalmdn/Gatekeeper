# GateKeeper: OTel MVP and execution traces

## Selected MVP approach

Use the developer's existing OpenTelemetry instrumentation. GateKeeper receives, stores, and evaluates its traces. A dedicated GateKeeper SDK is [future scope](07-future-sdk.md).

Instrumentation belongs primarily in the application's backend, around its agent entry point, model calls, and actual tool execution. The application owns orchestration and tools. The same evidence contract supports offline tests and production; production executions need not have a dataset scenario.

For the MVP, publish one supported instrumentation format, its version/mapping, and a working integration example. Broader framework support can follow. Supporting OTLP transport does not imply understanding every framework's span semantics.

## Trace routing

```text
Application with OTel -> OTLP -> GateKeeper ingestion
```

Or, for an application with an existing observability backend:

```text
Application with OTel -> OTel Collector -> GateKeeper ingestion
                                      -> Existing monitoring backend
```

A Collector can export to multiple backends; direct export is also possible. [OTel Collector documentation](https://opentelemetry.io/docs/collector/).

Proposed MVP transport: authenticated OTLP/HTTP trace ingestion at `/v1/traces`, initially supporting binary Protobuf with a documented exporter configuration. This is a proposed implementation choice; the standard also supports other encodings/transports. [OTLP specification](https://opentelemetry.io/docs/specs/otlp/).

Start with trace ingestion. Separate OTel logs and metrics ingestion is not required for these MVP evaluations; derive per-execution metrics from spans and recorded usage.

## Correlation contract

- One **execution ID** identifies one scenario attempt or one production agent execution.
- One **evaluation run ID** groups offline attempts. GateKeeper stores the execution-to-run/scenario/version association internally.
- A **trace ID** groups related spans; **span IDs and parent IDs** describe individual operations and branches.
- A **tool-call ID**, when available, links the model's proposed call to the actual execution.

Proposed mapping: keep execution ID and OTel trace ID as distinct identifiers with an explicit mapping. Several executions may share an enclosing request trace; select the agent invocation span and its descendants for evaluation. If work continues in another trace, the integration must explicitly link that work to the execution.

Offline dispatch supplies the execution ID. The application attaches it to the agent invocation span and reports that span's trace ID and span ID on completion. For production, the application creates an execution ID at the agent entry point. Exact attribute names and completion payloads remain proposed.

Propagate OTel context through async jobs, parallel operations, services, and model requests through the proxy. A custom execution attribute on a parent span does not automatically appear on every child. GateKeeper can associate descendants after receiving the parent; detached work needs explicit correlation. See [OTel context propagation](https://opentelemetry.io/docs/concepts/context-propagation/).

## Required evaluation evidence

These are GateKeeper's integration requirements. Some fields use OTel conventions; others require custom attributes or application reports. Required evidence depends on the selected rules.

| Evidence | Fields or source | Requirement |
|---|---|---|
| Execution identity | Execution ID, application identity/version, environment | Every execution |
| Trace structure | Trace ID, span ID, parent ID, operation type, timestamps, span status | Every recorded operation |
| Agent lifecycle | Task input, agent identity, start/end, completed/failed/timed-out state | Every execution |
| Final answer | Root agent output or completion response | Answer/quality rules |
| Model identity | Provider, requested/actual model where available | Model comparison and usage attribution |
| Model content | Input/output messages, proposed tool calls, errors | Rules inspecting model behavior or grounding |
| Actual tools | Tool name, call ID when available, arguments, result/error, timing | Tool and agentic rules |
| Usage | Input/output tokens when available | Token rules; never substitute zero for missing usage |
| Outcome observations | Authoritative state, artifact IDs, or verifier evidence | Outcome rules |
| Policy evidence | Approval/authorization facts and causal links | Rules checking these policies |

GateKeeper must distinguish a model proposing `create_event`, the application executing it, and a verifier observing the resulting calendar state. These are three different facts. Hidden model reasoning is not required.

### Standard fields and custom additions

Useful GenAI convention fields include:

- Agent operation: `gen_ai.operation.name = invoke_agent`.
- Model: `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.input.messages`, `gen_ai.output.messages`, and `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`.
- Actual tool operation: `gen_ai.operation.name = execute_tool`, `gen_ai.tool.name`, `gen_ai.tool.call.id`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, and `error.type` on errors.

Model content and tool arguments/results are opt-in. Manually instrument uncovered tools with existing OTel APIs. Pin the supported conventions/instrumentation version because GenAI conventions are evolving. [Model/tool conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md), [agent conventions](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md).

Illustrative custom attributes on the agent span:

```json
{
  "gatekeeper.execution.id": "exec-123",
  "gatekeeper.execution.mode": "offline"
}
```

These are proposed GateKeeper attributes, not standard OTel fields. The application completion status, state observations, and policy evidence also need a documented contract. Basic HTTP/database spans alone do not satisfy it.

## Outcomes beyond tracing

The application can return evidence through its completion endpoint response/callback or expose a verifier that GateKeeper queries. For example:

```json
{
  "executionId": "exec-123",
  "outcome": {
    "meetingCount": 1,
    "attendees": ["Sam"]
  }
}
```

The dataset stores expected values; this report contains observed values. Obtain observations from authoritative test state. Trace collection cannot automatically know whether a booking exists, a refund settled, or a forbidden side effect occurred.

## Proposed ingestion and storage

```text
Authenticated OTLP receiver
  -> Preserve incoming spans and instrumentation metadata
  -> Map supported spans to agent / model / actual tool operations
  -> Assemble by execution ID and trace relationships
  -> Check evidence availability
  -> Evaluate and store results

Execution
  -> Raw spans / events + normalized operations
  -> Final answer
  -> Outcome / policy observations
  -> Evaluation results
```

Keep evidence separate from scores to support regrading. Isolate records by authenticated project/application as well as trace identifiers. Make span ingestion idempotent using project, trace ID, and span ID so exporter retries do not duplicate operations.

Use parent links and timing to preserve parallel branches. Storage tables, payload retention, large-content storage, and exact normalized schemas remain open.

## Completeness and grading

- Retain all spans required for offline tests across application sampling, Collector processing, and export. Sampling configuration alone does not guarantee delivery.
- Enable content recording required by the selected rules. Track missing, truncated, or redacted evidence explicitly.
- Treat application completion and trace readiness as separate conditions. Spans may arrive late or out of order; an ended agent span does not establish that all tool spans arrived.
- Define an evidence collection deadline and a completeness mechanism in the offline protocol. A short inactivity window alone cannot prove completeness.
- Report insufficient evidence as **cannot evaluate**. In particular, absence of a forbidden tool span proves nothing when collection is incomplete.
- Deduplicate model evidence from application and proxy spans. Define one authoritative usage record per logical call; instrument retries explicitly if a retry metric is required.
- Compute execution latency from agent lifecycle timestamps and model/tool counts from normalized operations. Pricing-based cost estimates need a separately versioned pricing source.

## Developer onboarding checklist

1. Configure the supported OTel instrumentation and OTLP export with GateKeeper credentials.
2. Record an agent invocation with execution correlation and the fields needed by its rules.
3. Enable needed model/tool content and manually cover uninstrumented tools.
4. Expose the offline execution endpoint and completion/outcome contract.
5. Send a sample execution and inspect GateKeeper's evidence availability report before running a dataset.

This is an integration contract and example-based onboarding workflow; no GateKeeper package is required for the MVP.
