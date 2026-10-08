# Repository Guidelines

## Purpose & Sources of Truth

Gatekeeper is a Python 3.12 FastAPI hosted control plane and frontend for credible evaluation of AI
applications. It is a decision-support system and controlled offline evaluation harness, not a
customer application host, production orchestrator, release gate, or response guard. Before
changing behavior, read `docs/requirements.md`, `docs/roadmap.md`, and the design documents listed
in `docs/README.md`. When implementation convenience conflicts with measurement credibility,
preserve credibility.

## Project Structure & Module Organization

```text
src/gatekeeper/
├── app.py                  # FastAPI application wiring only
├── api/                    # HTTP routers and shared request dependencies
├── contracts/              # Pydantic API and persisted-boundary contracts
├── frontend_dist/          # Generated Vite build served by FastAPI
├── persistence/            # SQLite lifecycle, scoping, and row mapping
└── utils/                  # Shared pure utility functions
frontend/
└── src/
    ├── components/         # Shared React presentation
    ├── hooks/              # Reusable React behavior
    ├── pages/              # Route-level behavior and state
    ├── styles/             # Component and page CSS
    ├── utils/              # Pure frontend utilities
    ├── api.ts              # Backend API client
    ├── types.ts            # Frontend boundary types
    ├── App.tsx             # Route declarations
    └── main.tsx            # Browser entry point
tests/                      # Fixtures plus contract, API, and schema tests
schemas/                    # Published JSON Schema artifacts
```

`app.py` constructs the application, initializes storage, registers routers, and exposes the
module-level ASGI application. It must not contain contracts, routes, or storage logic.
`contracts/` owns Pydantic models; `api/` owns endpoint behavior; `persistence/` owns database
access and database-to-contract mapping; and `utils/` owns reusable pure helpers. Import each
responsibility from its owning module rather than re-exporting it through `gatekeeper.app`.

Frontend source lives in `frontend/src/`. Pages own route behavior, components own reusable
presentation, hooks own reusable React behavior, `styles/` owns component and page CSS, and
`api.ts` and `types.ts` own frontend boundary communication and types. Vite generates
`src/gatekeeper/frontend_dist/`, which FastAPI serves; never edit its contents manually.

Place one concise `#` comment immediately before every module section, class, function, and router
group. Do not add repetitive comments before internal conditionals, context managers, exception
handlers, loops, or validators; use the enclosing unit's comment and clear names instead.

Product and architecture decisions live in `docs/`. Python packages live under `src/gatekeeper/`,
and tests mirror product boundaries under `tests/`. Keep transport integrations, normalized
evidence, deterministic evaluation, and reporting as separate components.

## Build, Test, and Development Commands

```bash
python3.12 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn gatekeeper.app:app --reload
.venv/bin/pytest
.venv/bin/ruff check .
```

The first two commands create the environment and install development dependencies. Uvicorn runs
the local API; pytest runs the strict test suite; Ruff checks imports, style, modernization, and
common defects.

## Architecture & Delivery Workflow

Follow the three phases in `docs/roadmap.md` sequentially and define acceptance criteria before each
phase. In Phase 1, developers upload scenario datasets and configure model or agent candidates.
Gatekeeper's backend invokes those targets directly for controlled offline evaluation and
normalizes the observed evidence. Keep expected outcomes, required/forbidden behavior,
evaluator/scoring configuration, severity, thresholds, and holdout status private to Gatekeeper;
none may enter the model or agent invocation.

Phase 2 adds a production model proxy and passive online evaluation. It samples proxy evidence
asynchronously and must never delay, alter, block, or otherwise intervene in a user response.
Phase 3 adds OTel evidence and agentic-task evaluation. Human-reviewed, redacted online failures
may be promoted only into a new versioned offline dataset release with provenance. Do not introduce
multi-agent orchestration, controlled replay, in-workflow approvals, a CLI product, automatic
regression-case creation, LLM-as-a-judge, guardrails, production-response intervention, or release
gating without a separate scope decision.

## Measurement Credibility Rules

- Treat workflow outcome as the primary measure; prompts, models, tools, state, and trajectory are
  diagnostic evidence.
- Freeze each evaluation's candidate, immutable dataset release, versioned evaluator/scoring
  configuration, thresholds, severity weights, and repeated-run policy.
- Never infer a definitive result from one non-deterministic run. Aggregate per-scenario attempts
  and retain stability, flakiness, and attempt/scenario counts.
- Compare candidates only under aligned frozen datasets, evaluator/scoring configuration, and
  repeated-run policy; classify results as regressions, improvements, or stable.
- Preserve provenance, machine-readable reasons, evidence references, and versioned thresholds and
  severity weights. Keep workflow, evaluator, infrastructure, and insufficient-evidence failures
  distinct.
- Keep holdouts reviewed and immutable. Never expose oracles, expected outcomes, or holdout status
  to the evaluated workflow.
- Label tool evidence precisely: a Phase 1 tool request does not prove execution;
  `tool_requested` and `tool_result_reported` are observations; `tool_execution_verified` requires
  an authoritative external source. An unverifiable result is insufficient evidence, not proof of
  execution.

## Coding, Testing & Review Conventions

Use four-space indentation, complete type annotations, `snake_case` functions/modules, `PascalCase`
classes, `UPPER_SNAKE_CASE` constants, and a 100-character line limit. Add concise one-line comments
where they clarify non-obvious intent. Test serialization, invalid input, cross-field invariants,
evidence chains, and measurement boundaries. Run pytest and Ruff before submission. Use focused,
imperative commits such as `Add paired comparison contracts`. Pull requests must describe behavior
and credibility impact, link issues, and list verification commands.
