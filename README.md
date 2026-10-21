# Workflow Studio

A mini workflow canvas: compose a graph of text-processing steps, run it on a simulated backend, and watch per-node progress stream onto the canvas.

> **Status: M2 (canvas editor) complete.** You can build, edit and validate a workflow in the browser, and it survives a reload. There is **no Run button yet**: the server routes, executor and streaming are **not built**. Sections marked *(planned)* describe the agreed design, not working behavior.

| Milestone | Scope | State |
|---|---|---|
| M0 | Workspaces, Express server, shared package, Vitest, docs | Done |
| M1 | Shared contract: Zod schemas, graph validation, text transforms + tests | Done |
| M2 | Canvas editor: React Flow, palette, connect, settings panel, keyboard, localStorage | Done |
| M3 | BFF: accept workflow, executor, SSE, cancel + executor tests | Not started |
| M4 | Live run UI: node status, header progress, run details, cancel, reconnect | Not started |
| M5 | Empty/error/loading states, final docs, verification | Not started |

## Setup

Requires Node ≥ 22.12 (Vite 8).

```bash
npm install
```

One command per side, in two terminals:

```bash
npm run dev:server   # Express on http://localhost:3001
```

```bash
npm run dev:web      # Vite on http://localhost:5173 (proxies /api → :3001)
```

Other scripts (from the repo root):

```bash
npm test             # Vitest across all workspaces
npm run typecheck    # tsc for shared, server, web
npm run lint         # oxlint
```

Set `PORT` to move the server and `API_TARGET` to point the Vite proxy elsewhere.

## Repository layout

```
shared/   @wand/shared — Zod schemas and pure logic used by both sides (consumed as TS source, no build step)
server/   @wand/server — Express BFF, run with tsx
web/      @wand/web    — React + Vite app
```

## Architecture

### Shared contract
`@wand/shared` is the single source of truth for the API shape. Both sides import the same Zod schemas: the server validates requests with them, the client parses responses with them.

| Module | Contents |
|---|---|
| `workflow.ts` | Node (`input` / `transform` / `output`, discriminated on `type`), edge and workflow schemas; Transform config discriminated on `operation`; size limits |
| `graph.ts` | `canConnect()` for the canvas, `validateWorkflow()` returning `ValidationIssue`s tied to a node or edge |
| `transforms.ts` | `applyTransform()`: uppercase, lowercase, normalize, literal replace |
| `run.ts` | Node/run statuses, `RunSnapshot`, SSE `RunEvent` union |
| `api.ts` | Command response bodies and the `ApiError` body |

**Shape vs rules:** schemas accept anything the editor can legitimately hold (an empty name, an empty Replace `find`) so drafts always survive localStorage. Whether a workflow can *run* is decided by the rule functions, which return issues the UI can pin to a node (DECISIONS #13).

### Canvas state
Two separate pieces of client state:
- **Editor state** *(M2)* — `web/src/state/editor.ts`, a pure reducer holding the `Workflow` document exactly as the shared schema defines it, plus UI-only selection. The document autosaves to localStorage (validated with the schema on load; anything stale or corrupt falls back to the example) and will be sent to the server on Run. React Flow nodes are derived from the document at render time (`components/Canvas.tsx`), and React Flow change events are translated back into reducer actions, so React Flow never holds a second copy of the document.
- **Run state** *(planned, M4)* — per-node status from the server stream. Ephemeral, server-owned, replaced wholesale on each SSE snapshot. Plain `useReducer`, no store library.

```
web/src/
  state/editor.ts        reducer + actions (pure, unit-tested)
  state/storage.ts       localStorage load/save, schema-validated
  state/useEditor.ts     wires reducer + autosave + validateWorkflow
  components/Canvas.tsx  Workflow → React Flow mapping, change translation, connection feedback
  components/…           Header, Palette, WorkflowNodeView, SidePanel, NodeSettingsPanel, Field
```

Editing behaviour: settings apply to the document on every keystroke; invalid values are kept and flagged (inline, as a node badge, and in the workflow panel) rather than blocked. Invalid connections are refused while dragging and explained in a short toast. Deleting a node removes its connected edges.

Keeping them apart means status updates never mark the document dirty or leak into the saved/submitted graph. Known cost: every status event re-renders all nodes; fine at demo scale, and the scale path is a per-node-subscribable external store.

While a run is starting or running, graph and configuration editing is locked; pan, zoom, and inspection stay available. After a run ends, its status overlay stays visible until the first edit (DECISIONS #11).

### Validation
Implemented in `shared/src/graph.ts` *(M1)* and used by the canvas *(M2)*; server enforcement *(planned, M3)*.

- **Structural** (`canConnect` while drawing; `validateWorkflow` on the server): no duplicate node/edge IDs, edges to missing nodes, self-connections, duplicate source/target pairs, edges into Input, edges out of Output, second incoming edge on a Transform/Output, or cycles.
- **Run readiness** (only checked once the structure is valid): every node named, every Transform/Output has an incoming edge, Replace `find` non-empty, at least one Input-to-Output path. Dead ends are allowed.

Full rationale: DECISIONS #10 and #12.

### Streaming *(planned, M3)*
Server-Sent Events. Progress is one-way (server → client) and commands are plain POSTs, so a bidirectional socket buys nothing. Every SSE connection starts with a full run `snapshot`, followed by sequenced deltas; reconnects (EventSource retries automatically) recover by re-snapshotting instead of replaying a log.

### Execution model *(planned, M3)*
In-memory DAG scheduler. Each node simulates 0.5–3 s of work with ~10% failure. Full semantics in [DECISIONS.md](DECISIONS.md) (failure and cancellation entry).

## API contract *(planned, M3)*

All routes are mounted under `/api`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness check *(implemented, M0)* |
| `POST` | `/api/workflows` | Validate and accept a graph snapshot |
| `POST` | `/api/workflows/:id/runs` | Start execution; returns a run ID |
| `GET` | `/api/runs/:id` | Latest run snapshot |
| `GET` | `/api/runs/:id/events` | SSE subscription |
| `POST` | `/api/runs/:id/cancel` | Cancel; returns the current snapshot |

Bodies (Zod schemas in `shared/src`):

| Route | Request | Success | Errors |
|---|---|---|---|
| `POST /api/workflows` | `Workflow` | `201 { workflowId }` | `400 bad_request` (shape), `422 invalid_workflow` + `issues[]` |
| `POST /api/workflows/:id/runs` | — | `202 { runId }` | `404 not_found` |
| `GET /api/runs/:id` | — | `200 RunSnapshot` | `404 not_found` |
| `GET /api/runs/:id/events` | — | `text/event-stream` of `RunEvent` | `404 not_found` |
| `POST /api/runs/:id/cancel` | — | `200 RunSnapshot` (unchanged if already terminal) | `404 not_found` |

Every error body is `ApiError { error, message, issues? }`. Each SSE connection receives a `snapshot` event first, then `node` / `run` deltas with increasing `seq`; clients drop deltas with `seq` ≤ the snapshot's.

## Decisions & cuts

See [DECISIONS.md](DECISIONS.md) for the chronological log.

**Cut so far:**
- Drag-from-palette: clicking a palette entry adds the node at the viewport centre instead.
- Minimap, renaming the workflow, undo/redo, multi-select.

**Cut candidates if time runs short:** page-reload re-attach to a running run.

## Known limitations

- No database: workflows and runs live in server memory and vanish on restart (by design).
- No production build/start script for the server; it runs via `tsx` only.
- New nodes can land on top of existing ones (placed at the viewport centre with a small cascade).
- Every edit re-maps all nodes for React Flow; fine for demo-sized graphs, not tuned for hundreds of nodes (DECISIONS #14).
- localStorage holds one workflow; there is no workflow list.

## Next steps

M3 — BFF: accept workflow, executor, SSE, cancel.
