# Graph mode (Phase 8)

The `graph` activity-rail mode (label 그래프 / Graph) renders the vault as a
knowledge graph and, with managed writes enabled, lets you edit note frontmatter
under a schema gate. It ships in three layers — 8a (read-only), 8b (managed
writes), 8c (graph-driven authoring) — all landed and default-on.

Spec 정본 (work repo): `_meta/migrations/2607-deep-restructure/specs/maru-vault-graph-spec.md` (DR-020).

## Data model — dual source, graceful degrade

The graph is assembled from two sources by `src/lib/graph/model.ts`:

1. **Live layer** — `VaultEntry.links` extracted from the workspace scan. Any
   frontmatter field containing `[[wikilink]]` is an edge (dynamic relationship
   detection — no hard-coded field list). Always available.
2. **Community overlay** — `<vault>/reports/vault-graph.json`, read by the Rust
   command `vault_graph_read(vault_path) -> Option<VaultGraphFile>`
   (`src-tauri/src/vault_graph.rs`). Tolerant of both `edges` and `links` shapes.
   Supplies community/cluster coloring and precomputed metrics.

If the overlay file is missing or malformed, the model degrades to the live
layer alone — the graph still renders, just without community coloring. The
overlay is produced out-of-band by the `vault-graph` skill
(`skills/lib/build-graph.py`), not by the app.

## Rendering

- `src/components/graph/GraphView.tsx` — mode shell.
- `src/components/graph/GraphCanvas.tsx` — SVG canvas with viewport culling
  (only visible nodes/edges are drawn; benched at 2k synthetic nodes).
- `src/lib/graph/layout.worker.ts` — d3-force layout in a Web Worker (the only
  new frontend dependency introduced by Phase 8).
- `src/components/graph/GraphFilterPanel.tsx` — filter by type/domain, text
  search, hover highlight, click → open the note in the editor.
- `NeighborhoodPane` gains a "그래프에서 보기" (view in graph) button that focuses
  the graph on the active document.

## Managed writes (8b)

Vault write safety is opt-in per workspace via `write_policy: "managed"`
(toggled in the WorkspaceSwitcher). When enabled:

- `vault_guard::validate_managed_write` + `vault_validate_note(content, rel_path)`
  (`src-tauri/src/vault_guard.rs`) enforce the note schema before any write.
- The EditorPane shows a validation strip; OutlinePane renders a frontmatter form
  (description character counter, type/domain selects, topics chips).
- A **snapshot is taken before every managed write.**
- Note **deletion stays MCP-only** — the app never deletes vault notes directly.

This is the only invariant change Phase 8 introduces to the capability model
(see README "Critical invariants" #6).

## Graph-driven authoring (8c)

Pure-frontend features built on the 8a + 8b primitives:

- NewDocumentDialog neighbor panel (suggests links from the graph).
- Unresolved `[[wikilink]]` → CreateNoteDialog (stub-and-open).
- Decision-chain timeline lanes (`src/lib/graph/decisionChains.ts` +
  `src/components/graph/DecisionChainLanes.tsx`).

## Tests

- vitest: `src/lib/graph/model.test.ts`, `decisionChains.test.ts`,
  perf bench `src/lib/graph/perf.bench.ts`.
- e2e: `e2e/graph.spec.ts`. **Scope note** — the enrichment path
  (`vault_graph_read`) is Tauri-only, so the browser-mode e2e suite verifies the
  *degraded* live-layer path; the enriched overlay path is covered by
  vitest + cargo fixtures.

## Deferred

The only remaining Phase 8 item is **Hub graph-metadata sync** — held out of
scope until a Hub consumer exists.
