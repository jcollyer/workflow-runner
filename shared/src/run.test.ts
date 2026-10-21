import { describe, expect, test } from 'vitest'
import { applyRunEvent, type RunSnapshot } from './run.ts'

const base: RunSnapshot = {
  runId: 'run_1',
  workflowId: 'wf_1',
  status: 'running',
  startedAt: 1000,
  seq: 2,
  nodes: { a: { status: 'running', startedAt: 1000 }, b: { status: 'queued' } },
}

describe('applyRunEvent', () => {
  test('applies a node delta and advances seq', () => {
    const next = applyRunEvent(base, { type: 'node', seq: 3, nodeId: 'a', state: { status: 'succeeded', output: 'HI' } })
    expect(next.seq).toBe(3)
    expect(next.nodes.a).toEqual({ status: 'succeeded', output: 'HI' })
    expect(next.nodes.b).toBe(base.nodes.b)
  })

  test('applies a run delta', () => {
    expect(applyRunEvent(base, { type: 'run', seq: 3, status: 'failed', finishedAt: 2000 })).toMatchObject({
      seq: 3,
      status: 'failed',
      finishedAt: 2000,
    })
  })

  test('ignores deltas already reflected in the snapshot', () => {
    expect(applyRunEvent(base, { type: 'node', seq: 2, nodeId: 'a', state: { status: 'failed' } })).toBe(base)
    expect(applyRunEvent(base, { type: 'run', seq: 1, status: 'cancelled' })).toBe(base)
  })

  test('a snapshot event replaces state wholesale', () => {
    const fresh: RunSnapshot = { ...base, seq: 9, status: 'succeeded', nodes: {} }
    expect(applyRunEvent(base, { type: 'snapshot', snapshot: fresh })).toBe(fresh)
  })
})
