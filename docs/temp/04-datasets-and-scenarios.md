# GateKeeper: datasets and scenarios

## Agreed organization

Each dataset contains multiple scenarios of one type. Keep different types in separate datasets. An optional evaluation suite can group related datasets, but suite implementation was not explicitly settled.

| Dataset type | Input | Primary evaluation focus |
|---|---|---|
| Single turn | One user message | Resulting answer |
| Contextual turn | Existing history plus a new user message | Next answer using the history |
| Tool use | Request intended to exercise a tool; optional history | Selection, arguments, actual execution, result handling |
| Agentic task | Goal, optional history, initial test-state fixture | Final outcome, constraints, quality, efficiency |

These are practical dataset categories, not mutually exclusive agent capabilities. A single-turn response can involve tools. Tool-use evaluation is a focused agentic test; full agentic tasks evaluate end-to-end completion. Do not equate a contextual-turn input with exactly one model call: the application may still use internal tools while producing the next answer.

## Proposed common structure

```text
Dataset
- identity, name, scenario type, version
- application target reference
- default rule bindings
- scenarios[]

Scenario
- identity, name
- typed input
- setup / fixture reference
- expected values
- scenario-specific rule bindings
```

The scenario is the test definition. The trace is evidence from one attempt at that scenario. Keep these separate, and store the exact scenario/rule versions or snapshots used by a run.

For the MVP, evidence comes from the [application's OTel integration](02-otel-and-traces.md) plus its completion/outcome reports. Store scenario/run/version links in GateKeeper; attach an execution ID to the agent span instead of copying dataset content or rule definitions into telemetry. Rule evidence requirements determine which messages, tool arguments/results, and state facts the application must record.

## Illustrative inputs

Single turn:

```json
{"userMessage": "What is 2 + 2?"}
```

Contextual turn:

```json
{
  "history": [
    {"role": "user", "content": "My order is 123."},
    {"role": "assistant", "content": "How can I help with it?"}
  ],
  "nextUserMessage": "Where is it?"
}
```

Tool-use input can be the same request shape as single turn. Its expectations identify whether the check concerns a proposed call, an executed call, arguments, or use of the returned result. Define this distinction in the rule, not by silently treating a proposal as execution.

Agentic task example (illustrative schema):

```json
{
  "id": "meeting-01",
  "input": {
    "userGoal": "Book a meeting with Sam on 2026-10-06 at 2 pm IST"
  },
  "setup": {"fixture": "empty-test-calendar"},
  "expected": {
    "eventCount": 1,
    "attendee": "Sam",
    "startTime": "2026-10-06T14:00:00+05:30"
  },
  "rules": [
    {"rule": "calendar_state_matches", "severity": "required"},
    {
      "rule": "forbidden_tool",
      "parameters": {"tool": "send_email"},
      "severity": "required"
    },
    {
      "rule": "max_tool_calls",
      "parameters": {"count": 8},
      "severity": "scored"
    }
  ]
}
```

This uses an explicit timestamp to avoid an ambiguous relative date. Resolve similar ambiguity with defined clock/timezone or fixtures when testing time-sensitive behavior.

## Expected values versus rule parameters

Expected values are scenario facts such as an order ID or intended final state. A rule binding can contain a direct expectation or reference those values. The exact mapping syntax is open; avoid maintaining two independent copies of the same expectation.

Rules need not live in a separate uploaded document. The UI or JSON import can define scenarios and their rule bindings; the system stores definitions and links. Exact import/export shapes and whether rule creation is allowed during import remain open.
