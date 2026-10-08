# Gatekeeper frontend

The React frontend manages existing control-plane records. Evaluation execution, evidence,
reports, comparisons, and online evaluation remain outside this delivery stage.

## Structure

- `src/App.tsx` declares routes only.
- `src/pages/` owns route behavior and creation state, grouped by record type.
- `src/components/` owns shared presentation. Each styled component imports its matching CSS file
  from `src/styles/`.
  `RecordTable` handles table layout; its typed column definitions describe each record type.
  `RecordForm` owns submission feedback and actions; `RecordDetails` owns inspection framing.
- `src/hooks/useLoad.ts` handles route-scoped reads. `Workspace` keys its outlet by pathname so
  changing a project or record remounts the reader and discards stale responses.
- `src/utils/format.ts` owns pure formatting and JSON parsing helpers.
- `src/styles/` owns component styles; `src/styles.css` contains theme tokens, document defaults,
  and shared interaction primitives.
- `src/api.ts` and `src/types.ts` own API requests and boundary types.

Use existing theme tokens and component styles when extending a screen. Keep actual record
counts distinct from outcomes, and retain the frozen-input and unavailable-results explanations.

## Visual direction

The Stitch reference sets the carbon surfaces, amber actions, cyan integrity references, and
24px workspace grid. JetBrains Mono is the interface font; Space Mono is used for headings and
counts. Both load from Google Fonts with local monospace fallbacks. The interface uses plain CSS
and local SVG icons, with no Tailwind runtime or icon-font dependency.

The overview uses actual project inventory and frozen evaluations. The mockup's example scores,
release gates, infrastructure status, and unsupported navigation are intentionally omitted.
Search filters the current ledger (the five recent records on the overview) through the `q`
query parameter. Counts always describe the entire inventory, not the search results.

Evaluation creation opens in a native dialog from the overview or evaluation list. Direct links
still show the complete form as a page. The shared form, input fields, source assembly, tables,
and detail frames serve both layouts. Source digests can be expanded before creation.

## Verification

Run `npm test` and `npm run build` from this directory. The build type-checks the frontend and
updates the tracked `src/gatekeeper/frontend_dist` assets served by FastAPI.

Run `npm run dev` for Vite, with the API on `127.0.0.1:8000`. Vite forwards `/v1` requests there.
