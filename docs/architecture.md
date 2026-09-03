# Gatekeeper architecture

Gatekeeper is a hosted control plane with a frontend, deterministic evaluation service, and
reporting store. The application and its runner remain in the customer environment. The runner
only integrates with the control plane and invokes the local application; the required proxy is
the sole source of model-facing evidence.

```mermaid
sequenceDiagram
    autonumber
    participant GK as Gatekeeper control plane and frontend
    participant R as Customer runner
    participant A as Local application
    participant P as Required proxy
    participant M as Model and tools
    actor U as User

    rect rgb(235, 245, 255)
        Note over GK,M: Offline evaluation
        R->>GK: Start evaluation; request next scenario
        GK-->>R: Safe scenario assignment and correlation ID
        R->>A: Invoke locally
        A->>P: Model or tool call
        P->>M: Forward call
        M-->>P: Response or tool result
        P->>GK: Correlated observable evidence
        GK->>GK: Evaluate private rules; aggregate
        GK-->>R: Report available
    end

    rect rgb(245, 255, 235)
        Note over U,M: Passive online evaluation
        U->>A: User traffic
        A->>P: Model or tool call
        P->>M: Forward call
        M-->>P: Response or tool result
        P->>GK: Sampled observable evidence
        GK->>GK: Evaluate asynchronously; report findings
        Note over GK,A: No response delay, alteration, blocking, or intervention
    end
```

## Components and boundaries

- **Frontend and control plane:** manages projects, candidates, immutable dataset releases,
  frozen evaluation configuration, offline runs, online sampling policy, reports, and aligned
  comparisons. It also supports human review and redacted promotion of failed online traces
  into new offline dataset releases.
- **Runner:** starts offline work, obtains and supplies one scenario at a time, and invokes the
  application locally. It does not submit traces, final responses, or final-state evidence.
- **Proxy:** sits on the model-facing path, correlates observations with an offline assignment
  or online sample, and sends evidence to Gatekeeper. It records model responses, tool requests,
  tool results, and other observable behavior.
- **Evaluation service:** applies only frozen deterministic evaluators: outcome/schema/set/range
  checks, required/forbidden actions, sequences, and policy/safety checks.
- **Storage and reports:** retain evidence references, evaluator results, repeated-attempt
  aggregates, provenance, and report/comparison results. Storage implementation is internal.

## Assignment integration

The runner initiates assignment requests and receives one safe scenario at a time. The transport,
endpoint shape, authentication, and customer integration remain to be designed. This does not
defer runner assignment; the eventual interface must preserve the stated privacy and evidence
boundaries.

Private expected outcomes, required/forbidden behavior, evaluator/scoring configuration, and
holdout status stay in Gatekeeper; they are never sent to the candidate runtime. The proxy can
label observed tool evidence as `tool_requested` or `tool_result_reported`. It may label
`tool_execution_verified` only when authoritative evidence outside the proxy confirms execution.

## Evaluation semantics

An evaluation freezes the candidate, dataset release, evaluator/scoring configuration,
thresholds, severity weights, and repeated-run policy. Reports expose per-scenario score,
stability, tool-evidence level, flakiness, severity-weighted suite score, and blocking failures.
Comparisons only align matching frozen configuration and classify results as regressions,
improvements, or stable.


Gatekeeper evaluates online samples asynchronously and remains observational. It does not use
LLM judges or guardrails; it evaluates evidence only and never intervenes in a runtime response.
A reviewer may supply the expected outcome and required or forbidden behavior for a failed online
trace, redact it, and publish it only in a new dataset release. The original production trace
remains linked as provenance, not as offline runtime input.

## Deferred

Multi-agent orchestration, controlled replay, in-workflow approvals, a CLI, automatic
promotion of regression cases, LLM-as-a-judge evaluation and its calibration, and production
intervention require separate scope decisions.
