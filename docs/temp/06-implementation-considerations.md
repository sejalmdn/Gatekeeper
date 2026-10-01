# GateKeeper: implementation considerations and open choices

This file is a proposed implementation aid for the new GateKeeper project. The user has selected the direction, not a precise API, stack, or storage design. Another agent is expected to perform the implementation.

## Suggested delivery order

1. Design one typed scenario envelope, rule definitions/bindings, and execution identity/lifecycle. Publish the MVP OTel evidence contract and select one supported instrumentation format/version.
2. Implement authenticated OTLP trace ingestion, span normalization, execution correlation, and a working example using existing OTel libraries.
3. Add application target registration, dispatch to the exposed backend endpoint, proxy correlation, and completion/evidence-readiness handling.
4. Apply deterministic trace/answer rules and ingest application-specific outcome evidence.
5. Expose dataset editing/import, per-case rule assignments, trace viewing, and evaluation reports.
6. Add repeated trials, version comparison, and shared production/offline grading where applicable.

Start with one complete example application and scenario, then expand the supported scenario types within datasets. The MVP uses existing OTel libraries with documented enrichment. A dedicated GateKeeper SDK is [future scope](07-future-sdk.md). A hosted tool runtime, adaptive user simulation, LLM-as-a-judge evaluation, and support for every framework format are outside the selected MVP.

## Important design choices still open

- Technology stack, repository structure, database, background processing, and authentication model.
- Initial OTel instrumentation language/framework, convention version, content recording, and normalized evidence mapping.
- Exact OTLP/HTTP encoding support and ingestion deployment; binary Protobuf is the proposed starting point. Additional transports can follow.
- Execution-to-trace/span mapping, detached-job correlation, per-tool call correlation, and canonical model-call records.
- Endpoint request/response shape, credentials, application version selection, and allowed destinations.
- Synchronous execution versus jobs with callbacks/polling, completion barriers, timeouts, cancellation, retries, and idempotency.
- Fixture preparation/reset and state-verifier contracts.
- Definition versioning, parameter validation and expected-value references, default-rule overrides, and grading applicability.
- Storage schema, payload retention, and handling of large or sensitive inputs/results.
- Initial deterministic built-in evaluators and the interface/runtime for developer-provided deterministic custom evaluators.
- Whether evaluation suites and CI release gates are part of the first delivery or later.

## Proposed component boundaries

- **Application OTel integration:** existing libraries plus developer instrumentation for agent lifecycle, actual tools, execution correlation, and required content. The developer also implements offline completion/outcome reporting.
- **OTLP receiver and normalization:** authenticated trace ingestion and mapping of the supported instrumentation format into evaluation evidence.
- **Model proxy:** forward application model requests and collect correlated model evidence.
- **Execution evidence storage:** assemble operations into executions, track collection readiness, and preserve raw spans and outcome observations.
- **Dataset and rule management:** typed scenarios, definitions, bindings, and versioned expectations.
- **Offline orchestration:** dispatch scenarios to application endpoints and track completion.
- **Evaluation engine:** apply rules to answers, traces, and state evidence; record scores and reasons.
- **Web interface and API:** configure targets, manage datasets, inspect traces, initiate runs, and compare results.

These are logical boundaries, not a requirement to deploy separate services. Design the initial implementation around a complete application execution rather than treating one model response as the whole agentic task.

## Verification that addresses the new risks

Meaningful integration checks should cover:

- One scenario runs through the real application entry point and proxy; the application executes its own tools.
- Existing OTel exporters can send the documented payload to GateKeeper directly and through the documented Collector configuration.
- Parallel executions and repeated attempts cannot mix traces or scores.
- Out-of-order spans and duplicate exports assemble into one execution without duplicate counts.
- Tool proposals are distinguishable from actual executions; model usage is not double counted.
- Supplied conversation history generates the next answer without replaying historical actions.
- A final answer claiming success fails when authoritative final state disagrees.
- Different valid tool paths can pass; an actual constraint violation cannot be hidden by a high quality score.
- Rule reuse works with different case parameters, and dataset-wide rules combine predictably with case rules.
- One dataset can contain different scenario types, with each scenario validated and evaluated according to its own type.
- Tool errors, delayed events, timeout, and completion/export failures remain visible rather than disappearing from evaluation counts.
- Missing tool arguments, sampled/lost spans, and absent outcome evidence produce cannot-evaluate results for affected rules. An incomplete trace cannot pass a forbidden-tool absence check.

These checks are recommendations for implementation verification, not tests created by this documentation task.

## Later integration scope

After the MVP works, consider a [GateKeeper SDK](07-future-sdk.md) to simplify instrumentation and endpoint integration, additional OTel framework mappings/transports, broader production collection options, and separately scoped LLM-as-a-judge evaluation with calibration. The SDK should use the same evidence contract and preserve OTel-only integrations.
