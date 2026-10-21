import type { NodeRunState, NodeRunStatus, RunStatus } from '@wand/shared'
import type { ConnectionStatus } from '../state/run.ts'

export const NODE_STATUS_LABELS: Record<NodeRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
}

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  reconnecting: 'Reconnecting…',
  closed: 'Finished',
  lost: 'Disconnected',
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
}

/** Duration of a node's simulated work, once it has both timestamps. */
export function nodeDuration(run: NodeRunState): string | null {
  return run.startedAt !== undefined && run.finishedAt !== undefined ? formatDuration(run.finishedAt - run.startedAt) : null
}
