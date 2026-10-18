# Repository Guidelines

## Purpose & Sources of Truth

Gatekeeper is a Python 3.12 FastAPI hosted control plane and frontend for credible evaluation of AI
applications. It is a decision-support system and controlled offline evaluation harness, not a
customer application host, production orchestrator, release gate, or response guard. Before
changing behavior, read `docs/requirements.md`, `docs/roadmap.md`, and the design documents listed
in `docs/README.md`. When implementation convenience conflicts with measurement credibility,
preserve credibility.

## Project Structure & Module Organization

- `src/gatekeeper/app.py`: constructs the app, initializes storage, registers routers, exposes the
  ASGI app. It must not contain contracts, routes, or storage logic.
- `src/gatekeeper/contracts/`: Pydantic API and persisted-boundary models.
- `src/gatekeeper/api/`: HTTP routers and endpoint behavior.
- `src/gatekeeper/persistence/`: SQLite lifecycle, scoping, and database-to-contract mapping.
- `src/gatekeeper/utils/`: reusable pure helpers.
- `src/gatekeeper/frontend_dist/`: generated Vite build served by FastAPI. Never edit manually.
- `frontend/src/`: React frontend (see Frontend Conventions).
- `tests/`: fixtures plus contract, API, and frontend tests, mirroring product boundaries.
- `docs/`: product and architecture decisions.

Import each responsibility from its owning module; do not re-export through `gatekeeper.app`.
Keep transport integrations, normalized evidence, deterministic evaluation, and reporting as
separate components.

## Commands

```bash
# Backend
python3.12 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/uvicorn gatekeeper.app:app --reload
.venv/bin/pytest
.venv/bin/ruff check .

# Frontend (run from frontend/)
npm install
npm run dev
npm run lint
npm run test
npm run build   # regenerates src/gatekeeper/frontend_dist/
```

Run pytest, Ruff, and (for frontend changes) lint, test, and build before submitting.

## Architecture & Delivery Workflow

Follow the phases in `docs/roadmap.md` sequentially and define acceptance criteria before each
phase. Phase 1 (current): developers upload scenario datasets and configure model or agent
candidates; Gatekeeper's backend invokes those targets directly for controlled offline evaluation
and normalizes the observed evidence. Phases 2 and 3 are defined in the roadmap; do not implement
ahead of the current phase.

Keep expected outcomes, required/forbidden behavior, evaluator/scoring configuration, severity,
thresholds, and holdout status private to Gatekeeper. None may enter the model or agent
invocation.

Do not introduce multi-agent orchestration, controlled replay, in-workflow approvals, a CLI
product, automatic regression-case creation, LLM-as-a-judge, guardrails, production-response
intervention, or release gating without a separate scope decision. Online evaluation must never
delay, alter, block, or otherwise intervene in a user response.

## Measurement Credibility

- Keep private evaluation data—including expected outcomes, rules, thresholds, severity, and
  holdout status—out of candidate invocations.
- Do not treat one non-deterministic attempt as a definitive result. Preserve attempt counts,
  stability, flakiness, provenance, and machine-readable failure reasons.
- Compare candidates only when datasets, scoring configuration, thresholds, and repeated-run
  policies are aligned.
- Keep workflow, evaluator, infrastructure, and insufficient-evidence failures distinct. A tool
  request or reported result is not verified execution without authoritative evidence.

## Backend Conventions

Style, naming, import order, and the 100-character limit are enforced by Ruff (configured in
`pyproject.toml`); do not restate or work around them. Use complete type annotations.

Place one concise `#` comment immediately before every module section, class, function, and router
group, stating its purpose. Do not comment internal conditionals, loops, context managers,
exception handlers, or validators; rely on the enclosing unit's comment and clear names.

Test serialization, invalid input, cross-field invariants, evidence chains, and measurement
boundaries. Use focused, imperative commits such as `Add paired comparison contracts`.

## Frontend Conventions

Goal: readability. ESLint enforces TypeScript, React Hooks, and selected layout rules; run
`npm run lint` before submitting. Follow the rules below for what tooling cannot check.

### Structure

- One component per file, filename matches the component name.
- Pages own route behavior and state; components own reusable presentation; hooks own reusable
  React behavior; `styles/` owns CSS; `api.ts` and `types.ts` own backend communication and types.
- Keep components under ~400 lines. Past that, extract a subcomponent or hook.
- No inline styles. Styles live in `styles/`, with class names prefixed by the component name.
- Define component props in a named interface immediately above the component when there are five
  or more fields. Inline object types are acceptable for fewer than five fields. Do not use `any`.
- After defining a block in css, add a new line break before adding another block.

### Comments

Comment the purpose, not the mechanics. Skip anything obvious from the name.

- Every component gets a `//` comment above it describing what it renders.
- Every hook (`useState`, `useEffect`, `useMemo`, custom hooks) gets a `//` comment above it
  explaining why the state or effect exists.
- Separate consecutive hook declarations with a blank line.

### JSX and Objects

- Use early returns for loading, error, and empty states. No nested ternaries in JSX.
- When a tag does not fit within 100 characters, put the opening tag, content, and closing tag on
  separate lines.
- One key-value pair per line in object literals.

### Example

```tsx
// Shows datasets with a search filter.
export function DatasetList({ datasets, onSelect }: DatasetListProps) {
  // Tracks which dataset row is expanded for detail view.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Holds the search text used to filter the list.
  const [query, setQuery] = useState("");

  if (datasets.length === 0) {
    return <EmptyState message="No datasets uploaded yet." />;
  }

  return (
    <section className="dataset-list">
      {/* Search box that filters rows by dataset name. */}
      <input
        className="dataset-list__search"
        value={query}
        onChange={handleQueryChange}
      />

      {/* Table of datasets; clicking a row expands its details. */}
      <table className="dataset-list__table">
        ...
      </table>
    </section>
  );
}
```
