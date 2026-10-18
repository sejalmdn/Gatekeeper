# Gatekeeper: offline model and agent execution

## Phase 1 approach

The developer uploads scenario datasets and configures the model or agent candidate in Gatekeeper.
For each attempt, Gatekeeper's backend loads the scenario input and invokes the configured target
through a supported integration.

```text
Developer-uploaded versioned scenario -> configured model or agent
                                      -> backend-observed response or tool request
                                      -> normalized execution evidence
                                      -> deterministic evaluation and report
```

No customer application endpoint, customer-side runner, proxy, or OTel integration is required.
Offline means controlled execution initiated by Gatekeeper outside live user traffic; the target
may still be a hosted model or agent service.

Candidate configuration identifies the target integration and model or agent, together with the
prompt, tool definitions, and runtime parameters relevant to the evaluation. Supported provider types are OpenAI, Anthropic, Google,
Groq, and OpenRouter. Gatekeeper selects and stores the backend adapter from the provider type;
users do not supply an adapter when creating a candidate. Existing candidates retain their saved
adapter. These configuration options do not imply that invocation adapters are implemented.
Authentication secrets
are referenced securely and are not stored in scenario datasets.

## Lifecycle

1. Select the immutable candidate, dataset, rule bindings, and run settings.
2. Create a distinct execution ID for every scenario attempt.
3. Load the scenario input and build the target invocation without private evaluation fields.
4. Invoke the configured model or agent and capture one evaluated response or tool request.
5. Normalize the observed evidence and validate its completeness and provenance.
6. Apply dataset and scenario rule bindings, store results, and aggregate repeated attempts.
7. Compare candidates only when their frozen evaluation configuration is aligned.

Expected outputs, rules, severity, and thresholds never enter the model or agent
invocation.

## Execution evidence

The exact integration adapters remain to be designed, but Phase 1 needs a transport-independent
evidence model with:

- execution ID and completed, failed, or timed-out status;
- final response when produced;
- requested tool names and arguments when produced;
- model identity and error information;
- start/end timing or duration;
- input/output token usage when available; and
- evidence-source and completeness metadata.

An integration may complete synchronously or asynchronously. Retries must preserve attempt identity
and must not mix evidence across attempts. Missing usage stays unknown rather than becoming zero.

## Scenario handling

Single-turn supplies one user message. Multi-turn loads supplied history and adds one new user
message; historical actions are not replayed. Tool use captures the requested tool and arguments
without executing the tool for evaluation purposes or claiming execution was verified.

The response observed at the configured integration boundary is sufficient for controlled
regression tests, provided its provenance and evidentiary limits are visible. Phase 2 proxy evidence
and Phase 3 OTel evidence can later populate the same normalized model.
