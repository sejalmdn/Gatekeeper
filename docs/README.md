# Gatekeeper design handoff

These documents record the current product decisions. The delivery order is defined in
[`roadmap.md`](roadmap.md).

## Read these files in order

1. [Product scope and decisions](01-scope-and-decisions.md)
2. [OTel and execution traces](02-otel-and-traces.md)
3. [Offline model and agent execution](03-offline-execution.md)
4. [Datasets and scenarios](04-datasets-and-scenarios.md)
5. [Reusable rules and evaluation](05-rules-and-evaluation.md)
6. [Implementation considerations](06-implementation-considerations.md)

## Current MVP

Phase 1 provides offline deterministic evaluation for developer-uploaded single-turn, multi-turn,
and tool-use scenarios. Developers configure a model or agent candidate, and Gatekeeper's backend
invokes it directly and normalizes the observed output, requested tools, latency, token usage, and
errors. The MVP has no customer application endpoint, runner, proxy, or OTel dependency.

Phase 2 adds passive online evaluation and its production proxy. Phase 3 adds OTel evidence and
agentic-task evaluation. All phases feed the same normalized evidence and evaluator interfaces.

Examples in these documents are illustrative unless explicitly marked as requirements. Exact API,
storage, authentication, and deployment choices remain implementation decisions.
