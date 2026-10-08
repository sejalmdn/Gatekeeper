# Gatekeeper design handoff

These documents record the current product decisions. The delivery order is defined in
[`docs/roadmap.md`](../roadmap.md).

## Read these files in order

1. [Product scope and decisions](01-scope-and-decisions.md)
2. [OTel and execution traces](02-otel-and-traces.md)
3. [Offline application execution](03-offline-execution.md)
4. [Datasets and scenarios](04-datasets-and-scenarios.md)
5. [Reusable rules and evaluation](05-rules-and-evaluation.md)
6. [Implementation considerations](06-implementation-considerations.md)
7. [Future SDK](07-future-sdk.md)

## Current MVP

Phase 1 provides offline deterministic evaluation for single-turn, multi-turn, and tool-use
scenarios. The application evaluation endpoint returns normalized evidence, including final output,
requested tools, latency, token usage, and errors. The MVP has no proxy or OTel dependency.

Phase 2 adds passive online evaluation and its production proxy. Phase 3 adds OTel evidence and
agentic-task evaluation. All phases feed the same normalized evidence and evaluator interfaces.

Examples in these documents are illustrative unless explicitly marked as requirements. Exact API,
storage, authentication, and deployment choices remain implementation decisions.
