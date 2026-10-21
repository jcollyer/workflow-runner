# Decisions

Chronological log of consequential choices. **Owner** = who made the call: *human* (Jeremy), *agent* (Claude, accepted by human), or *proposed* (agent suggestion not yet explicitly confirmed).

---

### 1. Single Transform node type with an operation dropdown
**Owner:** human · **When:** planning

One `transform` node whose config is a discriminated union on `operation`: `uppercase`, `lowercase`, `normalize`, `replace { find, replaceWith }`. Matches the sketch; adding an operation is one schema entry plus one pure function.
**Trade-off:** palette shows a generic "Transform" rather than per-operation entries; users pick the operation in the side panel.

### 2. Failure and cancellation semantics
**Owner:** human · **When:** planning

- Each node simulates 0.5–3 s of work with ~10% failure probability.
- A node starts only after **all** its dependencies succeed. Independent eligible nodes run concurrently.
- A failed node causes its descendants to be **skipped**; independent branches continue.
- A run becomes `failed` only after all remaining work settles.
- Cancellation stops scheduling and aborts simulated work. Unfinished nodes become `cancelled`; existing terminal node states remain unchanged.
- Late completions must not overwrite `cancelled` states.
- Cancelling an already-terminal run does not change its result.

Agent-stated assumptions (not contradicted): a run cancelled after a node has failed but while others are still running ends `cancelled`; a node may only transition to `succeeded`/`failed` from `running`.

### 3. "Edits persist" = side-panel edits stick to the node + localStorage autosave
**Owner:** human (accepted agent proposal) · **When:** planning

The server only sees the workflow when the user presses Run. The per-field "SAVED" indicator from the sketch is dropped; the header pill shows local save state instead.
**Trade-off:** no server-side drafts; validation errors from the server surface only on Run.

### 4. Run state is separate from the workflow document; no store library
**Owner:** human · **When:** planning

Run status lives in its own `useReducer`, not in React Flow `node.data`. The agent proposed Zustand for per-node subscriptions; Jeremy asked to omit it for simplicity.
**Trade-off:** every status event re-renders all nodes. Acceptable at demo scale; documented as the first thing to change for large graphs.

### 5. Run status overlay persists until the next edit or next run
**Owner:** human · **When:** planning · *Refined by #11.*

### 6. API contract
**Owner:** human (routes) · agent (`/api` prefix) · **When:** planning

`POST /workflows` (validate + accept), `POST /workflows/:id/runs` (start, returns run ID), `GET /runs/:id` (snapshot), `GET /runs/:id/events` (SSE), `POST /runs/:id/cancel` (cancel, returns current snapshot). Mounted under `/api` so the Vite dev proxy forwards one prefix.

### 7. SSE with snapshot-on-connect
**Owner:** agent · **When:** planning

One-way progress + POST commands fits SSE; native EventSource reconnects automatically. Each connection receives a full snapshot first, then sequenced deltas, so reconnect needs no replay log.
**Trade-off:** each reconnect resends O(nodes) state — negligible here.

### 8. Graph validation rules
**Owner:** proposed · **When:** planning · *Superseded by #10.*

### 9. npm-workspaces monorepo; `shared` consumed as TypeScript source
**Owner:** agent · **When:** M0

`shared/`, `server/`, `web/` as workspaces. `@wand/shared` exports `./src/index.ts` directly — Vite and tsx both compile it, so there is no build step and type changes are instant on both sides. Shared code uses `.ts` import extensions and is type-checked under `nodenext`, the stricter of its two consumers.
**Trade-off:** each consumer re-type-checks shared source under its own compiler settings; shared must stay valid under both bundler and Node resolution.

### 10. Graph validation rules (confirmed)
**Owner:** human (confirmed agent proposal #8, added rules marked ★) · **When:** after M0

Structural — enforced on connect in the canvas *and* re-checked by the server on accept:
- No self-connections, duplicate source/target pairs, or cycles.
- No edges into Input; no edges out of Output. ★ Output is a terminal step.
- Transform and Output accept exactly one incoming edge (no merge semantics); fan-out is allowed.
- ★ No edges referencing missing nodes (server-side; the canvas cannot produce them).

Run readiness — checked when Run is pressed:
- ★ At least one Input-to-Output path.
- Every Transform/Output reachable from an Input.
- Replace `find` is non-empty.

★ Nodes have editable names and positions (both part of the workflow document).

### 11. Editing lock and execution presentation
**Owner:** human · **When:** after M0

- Graph and configuration editing is locked while a run is **starting** or **running**.
- Pan, zoom, and inspection remain available during execution.
- Old execution presentation is cleared on the **first edit** after a terminal run (refines #5).

### 12. Defaults filling gaps in #10 and #11
**Owner:** human (accepted agent proposals; added the Pending message) · **When:** before M1

- Moving a node is **not** an edit for #11; neither are selection, pan, or zoom. Only add, delete, connect, and config/name changes clear run presentation.
- Cancel is disabled while a run is starting (no run ID yet), and the header shows a **Pending** status until the run is accepted.
- Names are trimmed, required to run, ≤ 60 chars, and need not be unique (node ID is identity). New nodes get a default name.
- Dead ends are allowed: a Transform with no downstream node, or an unconnected Input, simply runs.
- Given one incoming edge per Transform/Output and no cycles, "reachable from an Input" reduces to "has an incoming edge", and an Input-to-Output path exists iff some Output has one. Validation checks the reduced form so issues point at a specific node.

### 13. Zod validates shape; graph rules are plain functions
**Owner:** agent (accepted by human) · **When:** M1

Schemas accept anything the editor can legitimately hold — including empty names and an empty Replace `find` — so drafts always round-trip through localStorage. Rules (`canConnect`, `validateWorkflow`) decide what can run and return issues tied to a node or edge. The server maps schema failures to 400 and rule issues to 422.
**Trade-off:** some constraints that read like schema concerns ("name is required") surface as rule issues instead.

### 14. Editor state: Workflow document in a reducer, React Flow nodes derived at render
**Owner:** human (approach) · agent (implementation details) · **When:** M2

The reducer holds the `Workflow` exactly as the schema defines it; React Flow nodes/edges are mapped from it on each change, and React Flow change events are translated back into reducer actions. Selection is UI-only state beside the document: never persisted, and selection changes keep the same `workflow` object so they never trigger a save (and will never count as an edit for #11).
- React Flow drops a node's measured size when the node object changes identity, so the canvas keeps a UI-only map of measured sizes from `dimensions` changes and passes it back.
- All nodes use one React Flow type (`workflow`); naming them `input`/`output` collides with React Flow's built-in node types and their default styles.

**Trade-off:** every change re-maps all nodes and React Flow re-adopts every node object. Negligible at demo scale; at hundreds of nodes, memoise per node so untouched nodes keep identity.

### 15. Config edits apply immediately; feedback instead of blocking
**Owner:** human · **When:** M2

Every settings field dispatches on change; there is no draft copy or Save button. Temporarily invalid values (empty name, empty Replace `find`) are kept and saved, and flagged in three places: inline under the field, as a badge on the node, and in the workflow panel's "Before this can run" list. Length limits are enforced with `maxLength`, so the document always parses.

### 16. First-visit example is a single Input → Transform → Output
**Owner:** human (replaced the agent's proposal of the sketch's five-node graph) · **When:** M2

An empty canvas shows guidance and a "Start from example" button.

### 17. Small editor behaviours
**Owner:** agent · **When:** M2

- Changing a Transform's operation renames it to match, unless the user has given it a custom name.
- Switching away from Replace and back resets `find`/`replaceWith`.
- Escape deselects from anywhere (blurring a focused field); Delete/Backspace delete the selected node or edge but are ignored while typing.
- Single selection only (multi-select and box-select disabled) to keep the side panel unambiguous.
- New nodes appear at the viewport centre, cascading by 24 px; they can land on top of existing nodes.
