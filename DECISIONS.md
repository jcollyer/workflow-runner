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
**Owner:** human · **When:** planning

### 6. API contract
**Owner:** human (routes) · agent (`/api` prefix) · **When:** planning

`POST /workflows` (validate + accept), `POST /workflows/:id/runs` (start, returns run ID), `GET /runs/:id` (snapshot), `GET /runs/:id/events` (SSE), `POST /runs/:id/cancel` (cancel, returns current snapshot). Mounted under `/api` so the Vite dev proxy forwards one prefix.

### 7. SSE with snapshot-on-connect
**Owner:** agent · **When:** planning

One-way progress + POST commands fits SSE; native EventSource reconnects automatically. Each connection receives a full snapshot first, then sequenced deltas, so reconnect needs no replay log.
**Trade-off:** each reconnect resends O(nodes) state — negligible here.

### 8. Graph validation rules
**Owner:** proposed · **When:** planning — *confirm before/during M1*

- Blocked on connect: cycles, edges into Input, edges out of Output, self-loops, duplicate edges.
- Transform and Output accept exactly one incoming edge (no merge semantics); fan-out allowed.
- Checked on Run: ≥1 Input; every Transform/Output reachable from an Input; Replace `find` non-empty.

### 9. npm-workspaces monorepo; `shared` consumed as TypeScript source
**Owner:** agent · **When:** M0

`shared/`, `server/`, `web/` as workspaces. `@wand/shared` exports `./src/index.ts` directly — Vite and tsx both compile it, so there is no build step and type changes are instant on both sides. Shared code uses `.ts` import extensions and is type-checked under `nodenext`, the stricter of its two consumers.
**Trade-off:** each consumer re-type-checks shared source under its own compiler settings; shared must stay valid under both bundler and Node resolution.
