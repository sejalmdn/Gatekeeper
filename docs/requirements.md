# Gatekeeper requirements

## Product

Gatekeeper is a hosted control plane and frontend for credible evaluation of AI applications. A
candidate identifies an application version and its relevant model, prompt, tool, and runtime
configuration. Gatekeeper supports engineering decisions; it is not an agent runtime, production
orchestrator, response guard, or release gate.

An evaluation freezes the candidate, immutable dataset release, versioned evaluator and scoring
configuration, thresholds, severity weights, and repeated-run policy. Candidate comparisons use
aligned frozen inputs and configuration.

## Phase 1: offline evaluation MVP

- A dataset release may contain `single_turn`, `multi_turn`, and `tool_use` scenarios.
- A multi-turn scenario supplies conversation history and one new user message, then evaluates one
  response. Adaptive user simulation is excluded.
- A tool-use scenario evaluates requested tool selection and arguments. It does not establish that
  the tool was executed or that a real-world outcome occurred.
- Gatekeeper dispatches one safe scenario attempt at a time to an authenticated application
  evaluation endpoint. Private expectations, rules, severity, and holdout status remain in
  Gatekeeper.
- The application returns normalized execution evidence containing the status, final response,
  requested tools and arguments when applicable, latency, token usage when available, model
  identity, and errors.
- Evidence provenance is retained. Phase 1 evidence is application-reported and must not be
  presented as independently observed or externally verified.
- Missing evidence remains unknown and yields `cannot_evaluate` for rules that require it. Missing
  usage must never be treated as zero.
- Gatekeeper applies deterministic schema, exact/set/range, required/forbidden content, tool
  selection, tool-argument, latency, token, and cost checks supported by the available evidence.
- Runs support repeated attempts, machine-readable reasons, evidence references, per-scenario
  results, stability and flakiness measures, and aligned regression comparisons.

Phase 1 requires neither a production proxy nor OTel ingestion.

## Shared evidence and credibility requirements

- Keep scenario definitions, execution evidence, and evaluation results separate and versioned.
- Use a stable execution ID for every attempt and an evaluation-run ID for grouped attempts.
- Evaluators consume a transport-independent normalized evidence model rather than endpoint,
  proxy, or OTel payloads directly.
- Distinguish application, evaluator, infrastructure, and insufficient-evidence failures.
- Do not infer a definitive reliability result from one nondeterministic attempt.
- Pricing-based cost uses a versioned pricing source and remains unavailable when required usage
  or model information is missing.

## Phase 2: online evaluation

- A production model proxy records model-facing evidence and submits sampled executions for
  asynchronous evaluation without affecting the user response.
- Online rules bind through project, application, environment, endpoint, observed properties, and
  optional trusted application metadata such as `policy_id`.
- Online evaluation focuses on deterministic contracts, tool-request policy, operational metrics,
  feedback, and application-provided outcomes. It does not infer reference-answer correctness.
- A human may review and redact a production failure, add expectations, and promote it into a new
  immutable offline dataset release with provenance.

## Phase 3: OTel and agentic tasks

- OTel traces correlate application operations and actual tool execution with normalized execution
  evidence.
- The `agentic_task` scenario evaluates workflow behavior and authoritative final outcomes.
- `tool_requested`, `tool_result_reported`, observed tool execution, and
  `tool_execution_verified` are distinct evidence levels. Verification requires an authoritative
  external source.
- Incomplete traces cannot prove the absence of forbidden behavior.

## Deferred

LLM-as-a-judge evaluation and calibration, adaptive user simulation, multi-agent orchestration,
controlled replay, automatic regression-case promotion, in-workflow approvals, production-response
intervention, a CLI product, and release gating are outside the committed phases.
