# GateKeeper: future scope for an SDK

## Position in the roadmap

The MVP uses the application's existing OTel instrumentation, OTLP export, and an exposed backend endpoint for offline execution. A dedicated GateKeeper SDK is future scope, after one complete integration and evaluation workflow works.

The SDK's purpose would be to reduce integration work for developers, especially those without sufficient agent instrumentation. It should emit the same evidence consumed by the MVP so datasets, rules, stored traces, and reports keep working.

## Possible responsibilities

- Wrap the application agent entry point with execution identity, OTel context, lifecycle status, and final output capture.
- Wrap actual tool executions to capture names, arguments, results, timings, errors, and call IDs without changing behavior.
- Offer framework hooks and manual wrappers for operations not covered automatically.
- Help propagate context through async jobs and parallel work.
- Provide helpers for offline endpoint requests, completion reporting, and export coordination.
- Provide a structured API for application-specific outcome observations and approval/authorization evidence.
- Validate local evidence against the configured integration contract and surface missing instrumentation.

These are candidate features, not a committed SDK API. Language support, framework priority, packaging, and exact helpers remain open.

## Architecture direction

```text
Application -> Optional GateKeeper SDK using OTel -> OTLP -> GateKeeper

Application -> Existing OTel instrumentation      -> OTLP -> GateKeeper
```

Keep existing OTel integration as a supported path. Prefer building SDK helpers on OTel APIs and exporters, using the same execution correlation, supported conventions, and normalized evidence schema. Avoid duplicate spans when both framework instrumentation and SDK hooks observe the same operation.

The application continues to run its agent loop and tools. An SDK can help report a verifier's observations; the application still defines authoritative business state and how to inspect it.

## When to prioritize it

Consider the SDK when onboarding repeatedly requires the same wrappers or endpoint helpers, developers struggle with context/completion wiring, or unsupported frameworks make evidence capture too difficult. Use actual integration feedback to choose its first features.

The SDK should remain optional. Missing evidence, incomplete delivery, and verifier failures still need explicit handling even when SDK helpers are present.
