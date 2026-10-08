# Gatekeeper: implementation considerations

## Phase 1 delivery order

1. Define versioned datasets, the three MVP scenario types, rule definitions and bindings, and
   frozen evaluation configuration.
2. Define the transport-independent `ExecutionEvidence` model with provenance, completeness,
   latency, token usage, errors, final responses, and requested tools.
3. Add developer-managed model/agent candidate configuration and backend invocation adapters.
4. Implement deterministic evaluators and explicit `cannot_evaluate` handling.
5. Add repeated attempts, aggregation, candidate comparison, and regression reports.
6. Expose dataset import/editing, run initiation, evidence inspection, and reports through the API
   and frontend.

Start with one complete single-turn example, then add multi-turn and tool-use examples. Phase 1
contains no model proxy, OTLP receiver, trace assembler, actual-tool verification, or agentic-task
evaluation.

## Component boundaries

- **Dataset management:** immutable releases, mixed scenario types, and private expectations.
- **Candidate management:** developer-configured model/agent targets, prompts, tools, runtime
  parameters, and secure credential references.
- **Offline orchestration:** backend invocation, timeouts, retries, and attempt identity.
- **Evidence normalization:** normalize integration responses and retain their source provenance.
- **Evaluation engine:** deterministic rule execution independent of evidence transport.
- **Reporting:** attempt results, stability, efficiency metrics, and aligned comparisons.
- **Web/API surface:** upload datasets, configure candidates, initiate runs, and inspect
  evidence/results.

Supported integrations, credential handling, asynchronous target behavior, custom-evaluator
runtime, storage, retention, and exact scoring normalization remain implementation choices.

## Verification priorities

- Mixed scenario types validate and execute according to their own contracts.
- Supplied history produces one next response without replaying historical actions.
- Tool name and argument checks use requested calls and never claim actual execution.
- Latency and token metrics work in Phase 1; missing usage remains unknown.
- Expected values and rules never reach the evaluated model or agent.
- Parallel executions, retries, and repeated attempts cannot mix evidence or scores.
- Missing and malformed evidence produce explicit failure or `cannot_evaluate` results.
- Candidate comparisons reject unaligned dataset, evaluator, threshold, or repeated-run versions.

## Later delivery

Phase 2 adds a production proxy, asynchronous sampling, production rule bindings, and reviewed
promotion into offline datasets. Phase 3 adds OTLP ingestion, trace normalization and readiness,
agentic tasks, actual-tool evidence, and outcome verification. Both phases map into the Phase 1
evidence and evaluator boundaries.
