import {
  applyRunEvent,
  isTerminalNodeStatus,
  isTerminalRunStatus,
  type NodeRunStatus,
  type RunEvent,
  type RunSnapshot,
  type ValidationIssue,
} from '@wand/shared'

// Run state is server-owned and ephemeral, kept apart from the workflow document
// (DECISIONS #4). Pure reducer; side effects live in useRun.

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed' | 'lost'

export interface StartError {
  message: string
  issues: ValidationIssue[]
}

export type RunState =
  | { phase: 'idle'; startError?: StartError }
  /** Run requested; no run ID yet (DECISIONS #12: Pending, Cancel disabled). */
  | { phase: 'starting' }
  | {
      phase: 'active'
      runId: string
      /** Null until the first SSE snapshot arrives. */
      snapshot: RunSnapshot | null
      connection: ConnectionStatus
      cancelling: boolean
      /** Why the last cancel request failed; cleared on the next attempt. */
      cancelError?: string
    }

export type RunAction =
  | { type: 'startRequested' }
  | { type: 'startFailed'; error: StartError }
  /** A run ID is known: just started, or re-attached after a reload. */
  | { type: 'attached'; runId: string }
  | { type: 'event'; event: RunEvent }
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'cancelRequested' }
  | { type: 'cancelSettled'; snapshot: RunSnapshot }
  | { type: 'cancelFailed'; message: string }
  | { type: 'clear' }

export const initialRunState: RunState = { phase: 'idle' }

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'startRequested':
      return { phase: 'starting' }

    case 'startFailed':
      return { phase: 'idle', startError: action.error }

    case 'attached':
      return { phase: 'active', runId: action.runId, snapshot: null, connection: 'connecting', cancelling: false }

    case 'event': {
      if (state.phase !== 'active') return state
      const { event } = action
      if (state.snapshot === null) {
        // Deltas are meaningless before the first snapshot; every connection starts with one.
        return event.type === 'snapshot' ? { ...state, snapshot: event.snapshot } : state
      }
      return { ...state, snapshot: applyRunEvent(state.snapshot, event) }
    }

    case 'connection':
      return state.phase === 'active' ? { ...state, connection: action.status } : state

    case 'cancelRequested':
      return state.phase === 'active' ? { ...state, cancelling: true, cancelError: undefined } : state

    case 'cancelSettled': {
      if (state.phase !== 'active') return state
      // The cancel response is authoritative, but never let it roll state backwards.
      const newer = !state.snapshot || action.snapshot.seq >= state.snapshot.seq
      return { ...state, cancelling: false, snapshot: newer ? action.snapshot : state.snapshot }
    }

    case 'cancelFailed':
      return state.phase === 'active' ? { ...state, cancelling: false, cancelError: action.message } : state

    case 'clear':
      return initialRunState
  }
}

/** The run has reached a terminal status. */
export function isRunSettled(state: RunState): boolean {
  return state.phase === 'active' && state.snapshot !== null && isTerminalRunStatus(state.snapshot.status)
}

/**
 * Graph and config editing is locked while starting or running (DECISIONS #11). A lost
 * stream unlocks, so a vanished run (e.g. server restart) can never leave the editor stuck.
 */
export function isEditingLocked(state: RunState): boolean {
  if (state.phase === 'starting') return true
  return state.phase === 'active' && !isRunSettled(state) && state.connection !== 'lost'
}

/** Waiting for the run to be accepted or for its first snapshot. */
export function isPending(state: RunState): boolean {
  return state.phase === 'starting' || (state.phase === 'active' && state.snapshot === null && state.connection !== 'lost')
}

export function isTerminalEvent(event: RunEvent): boolean {
  if (event.type === 'snapshot') return isTerminalRunStatus(event.snapshot.status)
  return event.type === 'run' && isTerminalRunStatus(event.status)
}

export type StatusCounts = Record<NodeRunStatus, number> & { total: number; settled: number }

export function countStatuses(snapshot: RunSnapshot): StatusCounts {
  const counts: StatusCounts = { queued: 0, running: 0, succeeded: 0, failed: 0, skipped: 0, cancelled: 0, total: 0, settled: 0 }
  for (const node of Object.values(snapshot.nodes)) {
    counts[node.status] += 1
    counts.total += 1
    if (isTerminalNodeStatus(node.status)) counts.settled += 1
  }
  return counts
}
