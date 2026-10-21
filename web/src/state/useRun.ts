import { useCallback, useEffect, useReducer } from 'react'
import { RunEvent, type Workflow } from '@wand/shared'
import { ApiRequestError, cancelRun, createWorkflow, runEventsUrl, startRun } from '../api/client.ts'
import { initialRunState, isRunSettled, isTerminalEvent, runReducer, type RunState } from './run.ts'

// Remembers the in-flight run for this tab, so a reload re-attaches to it. Because every
// SSE connection starts with a snapshot, re-attaching is the same path as a first connect.
const ACTIVE_RUN_KEY = 'wand.activeRun'

function readActiveRun(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_RUN_KEY)
  } catch {
    return null
  }
}

function writeActiveRun(runId: string | null) {
  try {
    if (runId) sessionStorage.setItem(ACTIVE_RUN_KEY, runId)
    else sessionStorage.removeItem(ACTIVE_RUN_KEY)
  } catch {
    // Storage unavailable: the run still works, it just won't survive a reload.
  }
}

function initRun(): RunState {
  const runId = readActiveRun()
  return runId ? runReducer(initialRunState, { type: 'attached', runId }) : initialRunState
}

export function useRun() {
  const [state, dispatch] = useReducer(runReducer, undefined, initRun)
  const runId = state.phase === 'active' ? state.runId : null
  const settled = isRunSettled(state)
  const lost = state.phase === 'active' && state.connection === 'lost'

  // One EventSource per run. EventSource reconnects by itself after network blips; each
  // reconnect starts with a fresh snapshot. The server ends the stream once the run
  // settles, so we close on the terminal event, or EventSource would reconnect forever.
  useEffect(() => {
    if (!runId) return
    const source = new EventSource(runEventsUrl(runId))
    source.onopen = () => dispatch({ type: 'connection', status: 'open' })
    source.onmessage = (message: MessageEvent<string>) => {
      let event: RunEvent
      try {
        event = RunEvent.parse(JSON.parse(message.data))
      } catch {
        return // Ignore malformed frames rather than tearing down the run view.
      }
      dispatch({ type: 'event', event })
      if (isTerminalEvent(event)) {
        source.close()
        dispatch({ type: 'connection', status: 'closed' })
      }
    }
    source.onerror = () => {
      // CONNECTING: the browser is retrying. CLOSED: it gave up (e.g. 404 after a server restart).
      dispatch({ type: 'connection', status: source.readyState === EventSource.CLOSED ? 'lost' : 'reconnecting' })
    }
    return () => source.close()
  }, [runId])

  useEffect(() => {
    writeActiveRun(runId && !settled && !lost ? runId : null)
  }, [runId, settled, lost])

  const start = useCallback(async (workflow: Workflow) => {
    dispatch({ type: 'startRequested' })
    try {
      const { workflowId } = await createWorkflow(workflow)
      const { runId } = await startRun(workflowId)
      dispatch({ type: 'attached', runId })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start the run.'
      const issues = error instanceof ApiRequestError ? error.issues : []
      dispatch({ type: 'startFailed', error: { message, issues } })
    }
  }, [])

  const cancel = useCallback(async () => {
    if (!runId) return
    dispatch({ type: 'cancelRequested' })
    try {
      dispatch({ type: 'cancelSettled', snapshot: await cancelRun(runId) })
    } catch (error) {
      // The stream remains the source of truth; surface the failure and re-enable the button.
      const message = error instanceof Error ? error.message : 'Could not cancel the run.'
      dispatch({ type: 'cancelFailed', message })
    }
  }, [runId])

  const clear = useCallback(() => dispatch({ type: 'clear' }), [])

  return { state, start, cancel, clear }
}
