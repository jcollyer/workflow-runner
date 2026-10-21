import { describe, expect, test } from 'vitest'
import type { RunSnapshot } from '@wand/shared'
import { isContentEdit, isDocumentChange, type EditorAction } from './editor.ts'
import {
  countStatuses,
  initialRunState,
  isEditingLocked,
  isPending,
  isRunSettled,
  runReducer,
  type RunAction,
  type RunState,
} from './run.ts'

const snapshot = (patch: Partial<RunSnapshot> = {}): RunSnapshot => ({
  runId: 'run_1',
  workflowId: 'wf_1',
  status: 'running',
  startedAt: 0,
  seq: 1,
  nodes: { a: { status: 'running' }, b: { status: 'queued' } },
  ...patch,
})

const run = (...actions: RunAction[]) => actions.reduce(runReducer, initialRunState as RunState)
const attached: RunAction = { type: 'attached', runId: 'run_1' }
const snap = (s: RunSnapshot): RunAction => ({ type: 'event', event: { type: 'snapshot', snapshot: s } })

describe('runReducer', () => {
  test('starting is pending and locked; a start failure unlocks and keeps the error', () => {
    const starting = run({ type: 'startRequested' })
    expect([isPending(starting), isEditingLocked(starting)]).toEqual([true, true])

    const failed = run({ type: 'startRequested' }, { type: 'startFailed', error: { message: 'nope', issues: [] } })
    expect(failed).toEqual({ phase: 'idle', startError: { message: 'nope', issues: [] } })
    expect(isEditingLocked(failed)).toBe(false)
  })

  test('stays pending until the first snapshot, ignoring deltas before it', () => {
    const early = run(attached, { type: 'event', event: { type: 'node', seq: 2, nodeId: 'a', state: { status: 'succeeded' } } })
    expect(early.phase === 'active' && early.snapshot).toBeNull()
    expect(isPending(early)).toBe(true)

    const live = run(attached, snap(snapshot()))
    expect(isPending(live)).toBe(false)
    expect(isEditingLocked(live)).toBe(true)
  })

  test('folds deltas and unlocks once the run settles', () => {
    const state = run(
      attached,
      snap(snapshot()),
      { type: 'event', event: { type: 'node', seq: 2, nodeId: 'a', state: { status: 'succeeded' } } },
      { type: 'event', event: { type: 'run', seq: 3, status: 'failed' } },
    )
    expect(state.phase === 'active' && state.snapshot?.nodes.a.status).toBe('succeeded')
    expect(isRunSettled(state)).toBe(true)
    expect(isEditingLocked(state)).toBe(false)
  })

  test('a lost stream unlocks editing so a vanished run cannot leave the editor stuck', () => {
    const state = run(attached, snap(snapshot()), { type: 'connection', status: 'lost' })
    expect(isEditingLocked(state)).toBe(false)
  })

  test('the cancel response never rolls state backwards', () => {
    const ahead = run(attached, snap(snapshot({ seq: 5 })), { type: 'cancelRequested' })
    const stale = runReducer(ahead, { type: 'cancelSettled', snapshot: snapshot({ seq: 4, status: 'cancelled' }) })
    expect(stale.phase === 'active' && [stale.cancelling, stale.snapshot?.seq]).toEqual([false, 5])

    const fresh = runReducer(ahead, { type: 'cancelSettled', snapshot: snapshot({ seq: 7, status: 'cancelled' }) })
    expect(isRunSettled(fresh)).toBe(true)
  })

  test('a failed cancel keeps the run locked, re-enables Cancel, and records why until the next attempt', () => {
    const failed = run(attached, snap(snapshot()), { type: 'cancelRequested' }, { type: 'cancelFailed', message: 'Offline.' })
    expect(failed.phase === 'active' && [failed.cancelling, failed.cancelError]).toEqual([false, 'Offline.'])
    expect(isEditingLocked(failed)).toBe(true)

    const retry = runReducer(failed, { type: 'cancelRequested' })
    expect(retry.phase === 'active' && retry.cancelError).toBeUndefined()
  })

  test('clear returns to idle', () => {
    expect(run(attached, snap(snapshot()), { type: 'clear' })).toEqual(initialRunState)
  })

  test('countStatuses counts settled nodes as completed', () => {
    const counts = countStatuses(
      snapshot({ nodes: { a: { status: 'succeeded' }, b: { status: 'skipped' }, c: { status: 'running' }, d: { status: 'queued' } } }),
    )
    expect(counts).toMatchObject({ total: 4, settled: 2, succeeded: 1, skipped: 1, running: 1, queued: 1 })
  })
})

describe('edit classification (DECISIONS #11, #12)', () => {
  const actions: EditorAction[] = [
    { type: 'addNode', id: 'x', nodeType: 'input', position: { x: 0, y: 0 } },
    { type: 'moveNode', id: 'x', position: { x: 1, y: 1 } },
    { type: 'renameNode', id: 'x', name: 'y' },
    { type: 'select', selection: null },
    { type: 'unselect', kind: 'node', id: 'x' },
    { type: 'removeEdge', id: 'e' },
  ]

  test('content edits clear run presentation; moving and selecting do not', () => {
    expect(actions.filter(isContentEdit).map((a) => a.type)).toEqual(['addNode', 'renameNode', 'removeEdge'])
  })

  test('the editing lock blocks every document change, including moves, but not selection', () => {
    expect(actions.filter(isDocumentChange).map((a) => a.type)).toEqual(['addNode', 'moveNode', 'renameNode', 'removeEdge'])
  })
})
