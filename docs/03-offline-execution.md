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

## Generation parameters

New candidates accept only snake_case `temperature` (0–2), `top_p` (greater than 0 and at most
1), `top_k` (positive integer), and `max_output_tokens` (positive integer). Each key may be
omitted or set to `null` to leave that setting unspecified. The creation form starts with null
sampling settings and a 1024-token output limit; these are editable Gatekeeper starter values,
not provider defaults. Requests omitting the entire object use the same starter values; an
explicit empty object leaves every setting unspecified.

These are provider-neutral settings. Future invocation adapters must map them to the provider
API and validate model support and narrower limits, rejecting unsupported explicit settings
rather than silently discarding them. Null settings are not sent to the provider. Existing
candidates keep their frozen generation parameters, including historical keys.

## Lifecycle

The current frontend can prepare an evaluation from a candidate's **Run Evaluation** action.
Setup selects a candidate and dataset and saves attempts per scenario, timeout, and pass threshold
through the existing run-settings and evaluation-run APIs. Matching saved settings are reused.
The resulting run remains pending; setup does not invoke a provider, freeze rule bindings, or
produce evaluation results. Execution and frozen evaluation configuration remain future work.

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
