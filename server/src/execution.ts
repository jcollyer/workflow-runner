import {
  applyRunEvent,
  applyTransform,
  defaultNodeName,
  isTerminalNodeStatus,
  isTerminalRunStatus,
  type NodeRunState,
  type RunEvent,
  type RunSnapshot,
  type Workflow,
  type WorkflowNode,
} from '@wand/shared'

// Simulated DAG execution (DECISIONS #2). One timer per running node; all state
// changes go through emit(), which numbers the event, folds it into the snapshot
// with the shared applyRunEvent, and fans it out to subscribers.

export interface ExecutionOptions {
  /** How long a node "works" for. Default: uniform 0.5–3 s. */
  durationMs?: (node: WorkflowNode) => number
  /** Whether a node's simulated work fails. Default: ~10% (FAILURE_RATE). */
  shouldFail?: (node: WorkflowNode) => boolean
  now?: () => number
}

export const DEFAULT_FAILURE_RATE = 0.1
const MIN_DURATION_MS = 500
const MAX_DURATION_MS = 3000

export function defaultExecutionOptions(failureRate = DEFAULT_FAILURE_RATE): Required<ExecutionOptions> {
  return {
    durationMs: () => MIN_DURATION_MS + Math.random() * (MAX_DURATION_MS - MIN_DURATION_MS),
    shouldFail: () => Math.random() < failureRate,
    now: Date.now,
  }
}

export type RunListener = (event: RunEvent) => void

const label = (node: WorkflowNode) => node.name.trim() || defaultNodeName(node.type)

export class RunExecution {
  private state: RunSnapshot
  private readonly nodes: Map<string, WorkflowNode>
  private readonly parents = new Map<string, string[]>()
  private readonly children = new Map<string, string[]>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly listeners = new Set<RunListener>()
  private readonly options: Required<ExecutionOptions>

  /** `workflow` must already have passed validateWorkflow. */
  constructor(runId: string, workflowId: string, workflow: Workflow, options: Required<ExecutionOptions>) {
    this.options = options
    this.nodes = new Map(workflow.nodes.map((node) => [node.id, node]))
    for (const node of workflow.nodes) {
      this.parents.set(node.id, [])
      this.children.set(node.id, [])
    }
    for (const edge of workflow.edges) {
      this.parents.get(edge.target)!.push(edge.source)
      this.children.get(edge.source)!.push(edge.target)
    }
    this.state = {
      runId,
      workflowId,
      status: 'running',
      startedAt: options.now(),
      seq: 0,
      nodes: Object.fromEntries(workflow.nodes.map((node) => [node.id, { status: 'queued' }])),
    }
  }

  get snapshot(): RunSnapshot {
    return this.state
  }

  subscribe(listener: RunListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    this.scheduleReadyNodes()
  }

  /** Stops scheduling and aborts in-flight work. No-op on a terminal run. */
  cancel(): void {
    if (isTerminalRunStatus(this.state.status)) return
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    const now = this.options.now()
    for (const [nodeId, nodeState] of Object.entries(this.state.nodes)) {
      if (!isTerminalNodeStatus(nodeState.status)) {
        this.emitNode(nodeId, { ...nodeState, status: 'cancelled', finishedAt: now, error: 'Cancelled' })
      }
    }
    this.emit({ type: 'run', seq: this.nextSeq(), status: 'cancelled', finishedAt: now })
  }

  private scheduleReadyNodes(): void {
    for (const [nodeId, nodeState] of Object.entries(this.state.nodes)) {
      if (nodeState.status !== 'queued') continue
      const ready = this.parents.get(nodeId)!.every((parent) => this.state.nodes[parent].status === 'succeeded')
      if (ready) this.startNode(this.nodes.get(nodeId)!)
    }
  }

  private startNode(node: WorkflowNode): void {
    this.emitNode(node.id, { status: 'running', startedAt: this.options.now() })
    const timer = setTimeout(() => this.finishNode(node), this.options.durationMs(node))
    this.timers.set(node.id, timer)
  }

  private finishNode(node: WorkflowNode): void {
    this.timers.delete(node.id)
    const current = this.state.nodes[node.id]
    // Late completions must not overwrite cancelled (or any other settled) states.
    if (current.status !== 'running' || isTerminalRunStatus(this.state.status)) return

    const finishedAt = this.options.now()
    if (this.options.shouldFail(node)) {
      this.emitNode(node.id, { ...current, status: 'failed', finishedAt, error: 'Simulated failure' })
      this.skipDescendants(node)
    } else {
      this.emitNode(node.id, { ...current, status: 'succeeded', finishedAt, output: this.computeOutput(node) })
    }

    this.scheduleReadyNodes()
    this.finishRunIfSettled()
  }

  private computeOutput(node: WorkflowNode): string {
    if (node.type === 'input') return node.config.text
    // Validation guarantees exactly one incoming edge for Transform and Output.
    const upstream = this.state.nodes[this.parents.get(node.id)![0]].output ?? ''
    return node.type === 'transform' ? applyTransform(node.config, upstream) : upstream
  }

  private skipDescendants(failed: WorkflowNode): void {
    const error = `Skipped: ${label(failed)} failed`
    const stack = [...this.children.get(failed.id)!]
    while (stack.length > 0) {
      const nodeId = stack.pop()!
      if (this.state.nodes[nodeId].status !== 'queued') continue
      this.emitNode(nodeId, { status: 'skipped', finishedAt: this.options.now(), error })
      stack.push(...this.children.get(nodeId)!)
    }
  }

  /** A run settles only once no node is queued or running. */
  private finishRunIfSettled(): void {
    const states = Object.values(this.state.nodes)
    if (states.some((s) => !isTerminalNodeStatus(s.status))) return
    const status = states.some((s) => s.status === 'failed') ? 'failed' : 'succeeded'
    this.emit({ type: 'run', seq: this.nextSeq(), status, finishedAt: this.options.now() })
  }

  private emitNode(nodeId: string, state: NodeRunState): void {
    this.emit({ type: 'node', seq: this.nextSeq(), nodeId, state })
  }

  private nextSeq(): number {
    return this.state.seq + 1
  }

  private emit(event: RunEvent): void {
    this.state = applyRunEvent(this.state, event)
    for (const listener of this.listeners) listener(event)
  }
}
