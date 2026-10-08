# Gatekeeper: offline application execution

## Phase 1 approach

The developer exposes an authenticated evaluation endpoint. Gatekeeper sends a safe scenario
attempt to this endpoint, and the application invokes its normal model integration.

```text
Versioned scenario -> application evaluation endpoint
                   -> application/model execution
                   -> normalized application-reported evidence
                   -> deterministic evaluation and report
```

No proxy or OTel integration is required. Offline means controlled execution outside live user
traffic; the application may still call a hosted model.

## Lifecycle

1. Freeze the candidate, dataset release, evaluator configuration, and repeated-run policy.
2. Create a distinct execution ID for every scenario attempt.
3. Send the scenario input, execution identity, limits, and safe setup references.
4. Let the application produce one evaluated response or tool request.
5. Receive normalized evidence and validate its completeness and provenance.
6. Apply dataset and scenario rule bindings, store results, and aggregate repeated attempts.
7. Compare candidates only when their frozen evaluation configuration is aligned.

Expected outputs, rules, severity, thresholds, and holdout status never enter the application
request.

## Evidence response

The exact wire schema remains to be designed, but Phase 1 needs a transport-independent model with:

- execution ID and completed, failed, or timed-out status;
- final response when produced;
- requested tool names and arguments when produced;
- model identity and error information;
- start/end timing or duration;
- input/output token usage when available; and
- evidence-source and completeness metadata.

The application may return synchronously or through a job/callback protocol. Retries must be
idempotent and must not mix attempts. Missing usage stays unknown rather than becoming zero.

## Scenario handling

Single-turn sends one user message. Multi-turn loads supplied history and adds one new user message;
historical actions are not replayed. Tool use captures the requested tool and arguments without
executing the tool for evaluation purposes or claiming execution was verified.

The application-reported evidence is sufficient for developer-owned regression tests, provided its
provenance is visible. Phase 2 proxy evidence and Phase 3 OTel evidence can later populate the same
normalized model.
