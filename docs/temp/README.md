# GateKeeper implementation handoff

GateKeeper is a new, standalone platform for evaluating AI applications and agent executions. This folder summarizes the design discussion through 2026-09-27 for an implementation agent. It describes the intended product, not an existing implementation.

## Read these files in order

1. [Product scope and decisions](01-scope-and-decisions.md): motivation, agreed direction, and alternatives set aside.
2. [OTel MVP and execution traces](02-otel-and-traces.md): trace routing, required evidence, correlation, and storage.
3. [Offline application execution](03-offline-execution.md): how dataset scenarios reach the application's exposed backend endpoint.
4. [Datasets and scenarios](04-datasets-and-scenarios.md): mixed-type datasets, scenario types, common structure, examples, and expected outcomes.
5. [Reusable rules and evaluation](05-rules-and-evaluation.md): definitions, bindings, grading, metrics, and nondeterminism.
6. [Implementation considerations](06-implementation-considerations.md): proposed delivery order, open design choices, and meaningful verification.
7. [Future scope: GateKeeper SDK](07-future-sdk.md): optional integration helpers after the OTel MVP.

## MVP tracing decision

Use the application's existing OpenTelemetry (OTel) instrumentation and export traces to GateKeeper through OTLP, directly or through an OTel Collector. Start with one documented instrumentation format and a working example application. A dedicated GateKeeper SDK is future scope.

The application still owns agent execution and tools. It must provide evaluation evidence that ordinary HTTP tracing does not capture, plus an exposed endpoint for offline scenarios and completion/outcome reporting. See the OTel contract and offline execution files for these responsibilities.

MVP evaluation uses deterministic checks over recorded evidence and developer-supplied expectations. LLM-as-a-judge evaluation and its calibration are future scope.

## How to interpret this handoff

- **Agreed direction** means the user explicitly selected the approach during discussion.
- **Proposed design** means a concrete recommendation discussed with the user, but exact APIs, JSON schemas, storage tables, and behavior still need to be designed.
- **Open choice** means the discussion did not settle the implementation detail.
- Example IDs, field names, endpoints, and payloads are illustrative; they are not an existing protocol.

Build GateKeeper around application and agent evaluation. The technology stack, repository layout, and initial implementation are open choices; this handoff does not assume an existing codebase or migration requirements.

These files document the design. They do not implement GateKeeper.
