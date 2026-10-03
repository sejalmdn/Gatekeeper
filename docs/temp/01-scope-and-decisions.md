# GateKeeper: product scope and decisions

## Product purpose

GateKeeper is a new platform for evaluating the developer's actual AI application: its prompt construction, tool execution, agent loop, final answer, and resulting state. It combines controlled offline tests with production execution tracing and evaluation.

A developer can write evaluation scripts. A platform earns its value by coordinating repeated tests, storing evidence, comparing versions, sharing rules, and connecting production failures to regression cases. Trace storage alone is not the central product promise.

Regression testing is a major use case: repeat known scenarios after changing a prompt, model, or application version. The broader scope includes acceptance testing before release and production monitoring.

## Project starting point

This is a standalone project specification. No existing stack, schema, authentication model, evaluator runtime, or file layout is prescribed. The implementation agent should choose these to support the agreed workflow.

The core entities discussed are application targets, datasets and scenarios, reusable evaluation definitions and bindings, evaluation runs, execution traces, outcome observations, and evaluation results.

## Agreed direction

1. For the MVP, ingest the application's existing OTel traces through OTLP. An execution ID links model calls, actual tool executions, results, and the final answer. Support one documented instrumentation format initially; a dedicated GateKeeper SDK is future scope.
2. Keep the developer's application in the picture. It owns the agent loop and executes its tools.
3. For offline tests, GateKeeper sends scenarios to an exposed endpoint on the application's backend.
4. A dataset can contain scenarios from multiple categories. Store the category on each scenario so its input contract and applicable rules remain explicit.
5. Simplify conversation tests: supply existing history and a new user query, then evaluate the next answer. Do not implement an adaptive user simulator for this scope.
6. Use deterministic evaluators for the MVP. LLM-as-a-judge evaluation and its calibration are future scope.

## MVP integration boundary

Assume the developer already uses OTel in the application. They configure export to GateKeeper and enrich instrumentation to meet the [evaluation evidence contract](02-otel-and-traces.md). Existing OTel libraries remain part of the application; GateKeeper does not need to publish its own SDK for the MVP.

OTel supplies trace collection and transport. GateKeeper supplies datasets, offline dispatch, trace storage, evaluators, and regression reports. Actual business outcomes still need application-specific state observations or verifiers.

This decision replaces the earlier custom SDK approach. A [future GateKeeper SDK](07-future-sdk.md) can simplify onboarding and instrumentation while exporting the same evidence.

## Proposed design discussed

- Reusable evaluation definitions with scenario-specific parameter bindings, plus dataset-wide default rules.
- Deterministic evaluation of outcomes, constraints, quality, and efficiency rather than one exact expected tool sequence.
- Application-specific outcome verification using observed test-state evidence.
- Repeated attempts and version comparisons to measure reliability and regressions.

Exact schemas and execution contracts are not settled.

## Industry context discussed

These sources motivated the design; they are not requirements to integrate a particular vendor:

- [Anthropic agent evaluation guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): outcomes versus trajectories, code/model/human graders, repeated trials, and avoiding overly rigid paths.
- [LangSmith evaluation types](https://docs.langchain.com/langsmith/evaluation-types): offline benchmarking/regression testing, online monitoring, and production feedback into datasets.
- [tau-bench](https://arxiv.org/abs/2406.12045): comparing final environment state with the intended goal state and measuring repeated-trial reliability.
- [OpenAI agent evaluations](https://developers.openai.com/api/docs/guides/agent-evals): evaluating complete traces, including tools and handoffs.

A generic platform can coordinate and score evaluations. It cannot automatically know the correct real-world outcome for every application without developer-supplied expectations and evidence.
