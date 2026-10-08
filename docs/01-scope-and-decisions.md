# Gatekeeper: product scope and decisions

## Product purpose

Gatekeeper coordinates repeatable evaluations, preserves evidence and provenance, and compares
configured model or agent candidates across model, prompt, tool, and runtime changes. Regression
testing is the first product goal.

## Agreed direction

1. Phase 1 is an offline-only MVP with single-turn, multi-turn, and tool-use scenarios.
2. A dataset may contain multiple scenario types; every scenario stores its own type.
3. Multi-turn means supplied history plus one new message and one evaluated response.
4. Tool use evaluates the model's requested tool and arguments. Actual execution belongs to
   agentic evaluation.
5. Developers upload scenario datasets and configure model or agent candidates. Gatekeeper invokes
   each configured target directly from its backend and normalizes the observed evidence.
6. Latency, token usage, model identity, errors, and cost where derivable are Phase 1 metrics.
7. Phase 1 uses deterministic evaluators. LLM-as-a-judge remains outside the committed roadmap.
8. Phase 2 adds a production proxy and passive online evaluation. Phase 3 adds OTel and agentic
   tasks.

## Integration boundary

The normalized evidence contract is independent of transport. In Phase 1 a backend integration
adapter invokes the configured model or agent and produces it; in Phase 2 a proxy adds model-facing
production evidence; in Phase 3 an OTel adapter adds workflow and actual-tool evidence. Evaluators
operate on this normalized representation.

Gatekeeper keeps expectations, rule configuration, thresholds, severity, and holdout status away
from the evaluated model or agent. It records evidence provenance so model or agent responses are
not presented as proof of actual tool execution or independently verified outcomes.

## Measurement approach

Use immutable dataset releases, versioned evaluator configuration, repeated attempts, and aligned
candidate comparisons. Required rules determine pass/fail; efficiency and informational measures
remain visible separately. Missing evidence produces `cannot_evaluate`, not a pass.

Production inputs have no oracle by default. Phase 2 therefore provides monitoring and a reviewed
feedback loop into offline datasets rather than automatic semantic correctness judgments.
