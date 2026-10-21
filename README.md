# Workflow Studio

A mini workflow canvas: compose a graph of text-processing steps, run it on a simulated backend, and watch per-node progress stream onto the canvas.

> **Status: M0 (scaffold) complete.** The monorepo, server, shared package and test runner are wired end to end via a health check. The canvas, executor and streaming are **not built yet** — sections below marked *(planned)* describe the agreed design, not working behavior.

| Milestone | Scope | State |
|---|---|---|
| M0 | Workspaces, Express server, shared package, Vitest, docs | Done |
| M1 | Shared contract: Zod schemas, graph validation, text transforms + tests | Not started |
| M2 | Canvas editor: React Flow, palette, connect, settings panel, keyboard, localStorage | Not started |
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
`@wand/shared` is the single source of truth for the API shape. Both sides import the same Zod schemas: the server validates requests with them, the client parses responses with them. Graph validation rules *(planned, M1)* live here too, so the canvas can block invalid connections as you draw and the server re-checks authoritatively on accept.

### Canvas state *(planned, M2/M4)*
Two separate pieces of client state:
- **Workflow document** — nodes, edges, selection. The user's work; autosaved to localStorage; sent to the server on Run.
- **Run state** — per-node status from the server stream. Ephemeral, server-owned, replaced wholesale on each SSE snapshot. Plain `useReducer`, no store library.

Keeping them apart means status updates never mark the document dirty or leak into the saved/submitted graph. Known cost: every status event re-renders all nodes; fine at demo scale, and the scale path is a per-node-subscribable external store.

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

Request/response bodies will be defined as Zod schemas in `shared/` in M1 and documented here.

## Decisions & cuts

See [DECISIONS.md](DECISIONS.md) for the chronological log.

**Cut so far:** none yet.

**Cut candidates if time runs short (in order):** drag-from-palette (click-to-add instead), page-reload re-attach to a running run, minimap, renaming the workflow, undo.

## Known limitations

- No database: workflows and runs live in server memory and vanish on restart (by design).
- No production build/start script for the server; it runs via `tsx` only.

## Next steps

M1 — shared contract.
