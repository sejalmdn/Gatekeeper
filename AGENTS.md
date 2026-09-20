# Repository Guidelines

## Purpose & Sources of Truth

Gatekeeper is a Python 3.12 FastAPI hosted control plane and frontend for credible evaluation of complete agent workflows. It is a decision-support system, not an agent runtime, production orchestrator, release gate, or response guard. Before changing behavior, read all four documents in `docs/`: `requirements.md`, `architecture.md`, `measurement-credibility.md`, and `roadmap.md`. When implementation convenience conflicts with measurement credibility, preserve credibility.

### Core Philosophy

This is a project focused on core evaluation logic and credibility principles. **Prioritize simplicity, readability, and maintainability over enterprise scalability.** Do not add architectural abstractions or extra dependencies unless explicitly requested. Design for an individual developer evaluating their own application; avoid enterprise administration, multi-tenant workflows, and operational controls unless explicitly requested.

## Frontend Design

Use the `$frontend-design` skill whenever building or materially reshaping the frontend. Ground
the interface in Gatekeeper's measurement-credibility boundaries, complete its design-planning
and self-critique passes, and avoid generic dashboard treatments that imply unsupported results.

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


## Build, Test, and Development Commands

```bash
python3.12 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn gatekeeper.app:app --reload
.venv/bin/pytest
.venv/bin/ruff check .
```

The first two commands create the environment and install development dependencies. Uvicorn runs the local API; pytest runs the strict test suite; Ruff checks imports, style, modernization, and common defects.

### Strict Architectural Boundaries

1. **Single-Process control plane:** Keep the Gatekeeper control plane, API, proxy, evaluation logic, and frontend delivery in the existing FastAPI application. Do not introduce worker queues, message brokers, microservices, or distributed execution frameworks. The evaluated application and customer-side runner remain outside Gatekeeper as defined in the architecture.
2. **SQLite Only:** Use embedded SQLite via standard Python library / minimal ORM. Do NOT suggest PostgreSQL, Migration engines (Alembic) unless required, or multi-database abstractions.
3. **Simple React Frontend:** Use React with TypeScript (`.tsx`) bundled via Vite. Do NOT introduce complex state management libraries (Redux, Zustand), heavy CSS frameworks (Tailwind, Material UI), or complicated multi-step build pipelines. Keep type definitions simple and co-located in `types.ts`.
4. **Synchronous/Simple Persistence:** Use straightforward synchronous or standard FastAPI `async` handlers with direct SQLite queries/Pydantic validation. Do not over-abstract with repository pattern interfaces or multi-layered DAOs unless files exceed 300 lines.
5. **No External Runner Engines:** Mock or directly invoke scenario runs synchronously in memory/local subprocesses. Do NOT integrate Docker SDKs, Kubernetes jobs, or remote runner orchestration.
6. **Minimal Dependency Footprint:** Lean on Python 3.12 standard libraries (`pathlib`, `json`, `sqlite3`, `dataclasses`, `typing`) and primary declared dependencies (`FastAPI`, `Pydantic`, `Uvicorn`). Reject new third-party package additions for minor utility tasks.

## Codex Collaboration Guidance

- Implement only the current requirement and roadmap stage. Do not add speculative fields, extension points, generic frameworks, or production infrastructure.
- Prefer the smallest clear change within the existing module layout.
- Make reasonable, reversible assumptions instead of asking about hypothetical scale, deployment, queuing, or enterprise requirements.
- New files inside an existing module do not require confirmation when their ownership is clear. Ask before creating a new top-level subsystem or changing an architectural boundary.
- Ask for clarification only when a decision affects measurement credibility, a public API, persisted data, security, destructive behavior, or product scope.
- Briefly explain a non-trivial refactor in commentary, then proceed when it remains within the requested scope.


## Architecture & Delivery Workflow

Follow the agreed delivery stages sequentially and define acceptance criteria before each stage.
Applications and the offline runner remain in the customer environment. The runner receives one
safe scenario assignment at a time and invokes the local application, but never submits final
responses, traces, or final-state evidence. The required proxy is the sole model-facing evidence
source; it correlates observable model and tool behavior with the assignment or online sample.
Keep expected outcomes, required/forbidden behavior, evaluator/scoring configuration, and
holdout status private to Gatekeeper.

Offline evaluation uses controlled scenarios. Passive online evaluation samples proxy evidence
asynchronously and must never delay, alter, block, or otherwise intervene in a user response.
Human-reviewed, redacted online failures may be promoted only into a new versioned offline dataset
release with provenance. Do not introduce multi-agent orchestration, controlled replay,
in-workflow approvals, a CLI product, automatic regression-case creation, LLM-as-a-judge,
guardrails, production-response intervention, or release gating without a separate scope decision.

## Measurement Credibility Rules

- Treat workflow outcome as the primary measure; prompts, models, tools, state, and trajectory are diagnostic evidence.
- Freeze each evaluation's candidate, immutable dataset release, versioned evaluator/scoring configuration, thresholds, severity weights, and repeated-run policy.
- Never infer a definitive result from one non-deterministic run. Aggregate per-scenario attempts and retain stability, flakiness, and attempt/scenario counts.
- Compare candidates only under aligned frozen datasets, evaluator/scoring configuration, and repeated-run policy; classify results as regressions, improvements, or stable.
- Preserve provenance, machine-readable reasons, evidence references, and versioned thresholds and severity weights. Keep workflow, evaluator, infrastructure, and insufficient-evidence failures distinct.
- Keep holdouts reviewed and immutable. Never expose oracles, expected outcomes, or holdout status to the evaluated workflow.
- Label proxy evidence precisely: `tool_requested` and `tool_result_reported` are observations; `tool_execution_verified` requires an authoritative external source. An unverifiable result is insufficient evidence, not proof of execution.

## Coding, Testing & Review Conventions

Use four-space indentation, complete type annotations, `snake_case` functions/modules, `PascalCase` classes, `UPPER_SNAKE_CASE` constants, and a 100-character line limit. Add concise one-line comments where they clarify non-obvious intent. Test serialization, invalid input, cross-field invariants, evidence chains, and measurement boundaries. Run pytest and Ruff before submission. Use focused, imperative commits such as `Add paired comparison contracts`. Pull requests must describe behavior and credibility impact, link issues, and list verification commands.
