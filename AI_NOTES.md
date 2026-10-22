# AI Notes

Agent: Claude Code (Claude Opus 5.5). Entries are recorded as they happen; nothing here is reconstructed after the fact.

## 1. Key prompts

### Prompt 1 — Kickoff: constraints, working agreement, scope (planning)
Attached the assessment PDF and two UI sketches ([edit mode with Transform Settings panel](docs/sketches/edit-mode.png); [run mode with Run details panel](docs/sketches/run-mode.png) — also shown in the README). Lightly edited:

> We are building a take-home assessment: a small workflow editor with simulated execution and live progress. The total time budget is 4–6 hours, including verification and documentation.
>
> Stack: React + TypeScript, Vite · React Flow · Express + TypeScript · Zod for shared runtime schemas · Native fetch for HTTP commands · Native EventSource for SSE · Vitest · No database, authentication, or deployment.
>
> Work incrementally. Before each milestone, briefly explain your approach and any important trade-off. Afterward, summarize what changed, what you verified, and remaining limitations. Do not implement the whole app in one pass. Complete only the milestone I request.
>
> Maintain README.md […], a concise chronological DECISIONS.md […], and AI_NOTES.md with consequential prompts, actual corrections I make, and decisions I explicitly own. Never invent prompts, agent mistakes, test results, or human decisions. Leave a clearly marked placeholder when my input is needed. After a milestone is verified, propose a descriptive commit message and show a short diff summary. Wait for my review before committing. Do not backfill artificial commit history or claim unfinished behavior works.
>
> I am thinking for the text transformation node, we add regular transforms node, uppercase, lowercase, etc. Also a normalize node that trims whitespace. Also a node that replaces text (define input/output string).
>
> First, propose the smallest implementation plan and directory structure. Identify scope risks and anything ambiguous. Do not write implementation code yet.

### Prompt 2 — Execution semantics and API contract (planning)
Answered the agent's open questions. Lightly edited:

> Here is my failure behavior:
> - Each node simulates work for a random 0.5–3 seconds and has approximately a 10% failure probability.
> - Start a node only after all its dependencies succeed.
> - Independent eligible nodes run concurrently.
> - A failed node causes its descendants to be skipped; independent branches continue.
> - A run becomes failed only after all remaining work settles.
> - Cancellation stops scheduling and aborts simulated work. Unfinished nodes become cancelled; existing terminal node states remain unchanged.
> - Late completions must not overwrite cancelled states.
> - Cancelling an already terminal run does not change its result.
>
> For what "edit persist" means, I like your suggestion. For the transform, yes let's do one with a dropdown. When a run ends, yes keep the status until next update.
>
> Can you explain why I need a run state store? Can I omit that for simplicity?
>
> I was thinking this for the API contract:
> - POST /workflows: validate and accept a graph snapshot.
> - POST /workflows/:id/runs: start execution and return a run ID.
> - GET /runs/:id: return the latest snapshot.
> - GET /runs/:id/events: SSE subscription.
> - POST /runs/:id/cancel: cancel and return the current snapshot.

### Prompt 3 — Validation rules and run-time editing lock (after M0)
Confirmed the agent's proposed validation rules and extended them. Lightly edited:

> Your validation rules look good. I would also include:
> - Output is a terminal step.
> - Nodes have editable names and positions.
> - No self-connections, duplicate source/target pairs, cycles, edges into Input, edges out of Output, or references to missing nodes.
> - Require at least one Input-to-Output path.
>
> Further state requirements I would like to define include:
> - Lock graph and configuration editing while starting or running.
> - Allow pan, zoom, and inspection during execution.
> - Clear old execution presentation on the first edit after a terminal run.

### Prompt 4 — Editing behaviour for the canvas (M2)
Responded to the agent's M2 plan. Lightly edited:

> The editing state sounds good, except for the first-time visitor default to a more simple input → transform → output example default. Let's also make sure:
> - Apply config edits immediately to workflow state; allow temporary invalid field values and show useful validation feedback.
> - Delete a node and its connected edges.

### Prompt 5 — First polish direction (after M5)
Lightly edited:

> For the first round of polish, I would like to make the configuration and running UIs look less like they were made by AI. I'm not trying to hide the AI assistance, I just prefer a less boilerplate look. Let's keep things minimal: remove the colour-coded left tabs for nodes, replacing them with icons from `lucide-react` — input: new document; transform: lightning; output: export document; play; stop; delete: trash; Operation dropdown: up/down caret; during a run — queued: clock, running: animated spinner, complete: checkmark, failed: error sign.

## 2. Where the agent was wrong or mediocre

### Run/Cancel race: over-engineered fix replaced with a layout change (M5)
- **What the agent produced:** having surfaced that a late click on Cancel could land on Run (both shared one button position) and start a new run, the agent implemented a timed "settle hold": extra component state plus a `useEffect` timer that kept the button disabled for one second after every run and showed the outcome.
- **What I changed:** rejected it and asked for Cancel to sit next to Run, with both enabled or disabled by the rules we already had (DECISIONS #24).
- **Why:** in my words at the time — "I don't like the amount of complexity we are adding to resolve the Run/Cancel race issue, especially using another useEffect seems like a trade off i would rather not make." Fixed positions remove the race structurally instead of papering over it with timing.

### First icon pass: node design reworked (polish)
- **What the agent produced:** following my icon list, it put a small (16 px) type icon inline beside each node's name with the description underneath, kept hint text under each palette entry, gave no visual cue on the icon for the selected node, and showed run status as an extra icon-and-label row added beneath the description.
- **What I changed:** node icons about twice the size (32 px) on the left, spanning both lines of text, with name and description on the right; removed the palette hint text; the selected node's icon is highlighted while configuring; during a run the type icon is *replaced* by the status icon (clock, spinner, check, alert) and the description line is *replaced* by colour-coded status text, rather than adding another row (DECISIONS #27).
- **Why:** the goal I'd set was a minimal, less boilerplate look (prompt 5).
- **Then:** after seeing my own 32 px layout in the browser, I iterated again to an inverse-colour header (small icon + name) over a light body, dark gray when unselected (DECISIONS #28).

### Spinner kept spinning after a run finished (polish)
- **What the agent produced:** the status-icon component spun whenever its status was `running`. Run details reuses it for the per-status counts, so the "Running" row's spinner kept animating after the run had settled, next to a count of 0. The agent's own browser checks had looked at node and header icons, not that row.
- **What I found:** while testing live — "after a run finishes the 'Running' icon continues to spin."
- **Fix:** the icon takes an optional `spinning` flag (defaulting to `status === 'running'`), and the Running count only spins while its count is above zero. Verified in the browser: three spinners mid-run (header, node, count row), none after the run succeeds.

## 3. What I kept myself

Decisions made by Jeremy rather than delegated (details in [DECISIONS.md](DECISIONS.md)):

- **Execution semantics** — failure propagation, concurrency, and cancellation rules (DECISIONS #2); later confirmed that any node type can fail, not only Transforms. The agent had proposed only "continue independent branches, skip descendants, run ends failed"; Jeremy specified the full rule set, including cancellation and late-completion handling.
- **API contract** — route shapes, and cancel returning the current snapshot (the agent had proposed a bare 202) (DECISIONS #6).
- **State model** — questioned whether a run-state store was needed; went without a store library after the agent's explanation. Run state stays a plain reducer, separate from the graph (DECISIONS #4).
- **Node model** — one Transform node with an operation dropdown (DECISIONS #1).
- **Validation rules** — confirmed the agent's proposal and added missing-node references, an Input-to-Output path requirement, and editable names/positions (DECISIONS #10).
- **Run-time interaction model** — editing lock during starting/running, inspection allowed, presentation cleared on first edit (DECISIONS #11). Accepted the agent's gap-filling defaults but added a visible **Pending** status while a run is starting, rather than only disabling Cancel (DECISIONS #12).
- **Editing UX** — config edits apply immediately with invalid values kept and flagged, and node deletion removes connected edges (DECISIONS #15). Replaced the agent's proposed five-node first-visit example with a single Input → Transform → Output (DECISIONS #16).
- **Where to draw the polish line** — deferred visual polish until execution works end to end, to do it by hand (DECISIONS #18).
- **Run/Cancel race** — chose separate, fixed Run and Cancel buttons over the agent's timed hold (DECISIONS #24; see section 2).
- **Visual direction** — set the minimal, icon-based look and chose the icons (DECISIONS #26).

My reasoning for keeping these decisions to myself was keeping the scope of this project in line with the mental modal i had. With a workflow builder, the possibilities are essentially endless. I wanted to be able to clearly defend design decisions, and making them up front felt like the correct approach.
