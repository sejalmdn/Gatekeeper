# Gatekeeper roadmap

Gatekeeper will be delivered in three phases. Each phase builds on a shared, versioned
execution-evidence model so later evidence sources do not require rewriting the evaluation engine.

## Phase 1: offline evaluation MVP

Build controlled regression evaluation for three scenario types:

- **Single turn:** one user message and one evaluated response.
- **Multi-turn:** supplied conversation history plus one new user message and one evaluated
  response. Gatekeeper does not simulate an adaptive user.
- **Tool use:** evaluate the model's requested tool and arguments. This phase does not claim that
  the tool was executed.

Developers upload scenarios as versioned dataset releases and configure the model or agent candidate
to evaluate. Gatekeeper's backend invokes that configured target directly for each scenario attempt
and normalizes the observed final response, tool requests, model identity, latency, token usage, and
errors. Deterministic rules evaluate that evidence against private expectations. Repeated attempts
and aligned candidate comparisons expose reliability and regressions.

Phase 1 does not call a customer application or require a customer-side runner, model proxy,
production ingestion, OTel traces, or agentic tasks.

## Phase 2: online evaluation

Add passive production evaluation through a model proxy. The proxy records model-facing evidence
and submits it for asynchronous evaluation without delaying, changing, or blocking responses.

Production rules are selected through configured bindings such as project, application,
environment, endpoint, and optional application-provided `policy_id`. Useful deterministic checks
include response contracts, allowed or forbidden tool requests, tool-argument validation, latency,
token usage, cost, and errors. Production traffic has no reference answer by default, so semantic
correctness is not inferred.

Reviewed and redacted production failures may be promoted into a new versioned offline dataset.
A human supplies the scenario type and expected behavior before the case becomes a regression test.

## Phase 3: OTel and agentic-task evaluation

Add OTel trace ingestion and the `agentic_task` scenario type. Correlated traces provide evidence
about application operations, actual tool execution, workflow paths, timing, and failures.

Agentic evaluation prioritizes authoritative final-state or verifier evidence. Gatekeeper keeps
tool requests, reported results, observed execution, and externally verified outcomes distinct.
Missing or incomplete trace and outcome evidence produces an insufficient-evidence result.

## Beyond the committed phases

LLM-as-a-judge evaluation, adaptive conversation simulation, automatic promotion of production
cases, production-response intervention, and release gating require separate scope decisions.
