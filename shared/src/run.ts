import { z } from 'zod'

// Execution state as streamed over SSE (DECISIONS #2, #7). Timestamps are epoch ms.

export const NodeRunStatus = z.enum(['queued', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'])
export type NodeRunStatus = z.infer<typeof NodeRunStatus>

export const RunStatus = z.enum(['running', 'succeeded', 'failed', 'cancelled'])
export type RunStatus = z.infer<typeof RunStatus>

export function isTerminalNodeStatus(status: NodeRunStatus): boolean {
  return status !== 'queued' && status !== 'running'
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return status !== 'running'
}

export const NodeRunState = z.object({
  status: NodeRunStatus,
  startedAt: z.number().optional(),
  finishedAt: z.number().optional(),
  /** Text produced by the node, present once it has succeeded. */
  output: z.string().optional(),
  /** Why the node failed, was skipped, or was cancelled. */
  error: z.string().optional(),
})
export type NodeRunState = z.infer<typeof NodeRunState>

export const RunSnapshot = z.object({
  runId: z.string(),
  workflowId: z.string(),
  status: RunStatus,
  startedAt: z.number(),
  finishedAt: z.number().optional(),
  /** Sequence number of the last event reflected in this snapshot. */
  seq: z.number().int().nonnegative(),
  nodes: z.record(z.string(), NodeRunState),
})
export type RunSnapshot = z.infer<typeof RunSnapshot>

const seq = z.number().int().positive()

/**
 * Every SSE connection starts with a `snapshot`; `node` and `run` deltas follow with
 * strictly increasing `seq`. Clients ignore deltas with `seq` ≤ the snapshot's.
 */
export const RunEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), snapshot: RunSnapshot }),
  z.object({ type: z.literal('node'), seq, nodeId: z.string(), state: NodeRunState }),
  z.object({ type: z.literal('run'), seq, status: RunStatus, finishedAt: z.number().optional() }),
])
export type RunEvent = z.infer<typeof RunEvent>
