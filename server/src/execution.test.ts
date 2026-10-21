import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RunEvent, Workflow, WorkflowNode } from '@wand/shared'
import { RunExecution } from './execution.ts'

const at = { x: 0, y: 0 }
const nodes = {
  in: { id: 'in', name: 'In', type: 'input', position: at, config: { text: 'Hello' } },
  up: { id: 'up', name: 'Up', type: 'transform', position: at, config: { operation: 'uppercase' } },
  low: { id: 'low', name: 'Low', type: 'transform', position: at, config: { operation: 'lowercase' } },
  a: { id: 'a', name: 'A', type: 'output', position: at, config: {} },
  b: { id: 'b', name: 'B', type: 'output', position: at, config: {} },
} satisfies Record<string, WorkflowNode>

const edge = (source: string, target: string) => ({ id: `${source}->${target}`, source, target })

/** in → up → a */
const linear: Workflow = { name: 'linear', nodes: [nodes.in, nodes.up, nodes.a], edges: [edge('in', 'up'), edge('up', 'a')] }

/** in → up → a, in → low → b */
const fanOut: Workflow = {
  name: 'fan-out',
  nodes: Object.values(nodes),
  edges: [edge('in', 'up'), edge('up', 'a'), edge('in', 'low'), edge('low', 'b')],
}

function setup(workflow: Workflow, { durations = {}, failing = [] }: { durations?: Record<string, number>; failing?: string[] } = {}) {
  const events: RunEvent[] = []
  const run = new RunExecution('run_1', 'wf_1', workflow, {
    durationMs: (node) => durations[node.id] ?? 1000,
    shouldFail: (node) => failing.includes(node.id),
    now: () => Date.now(),
  })
  run.subscribe((event) => events.push(event))
  run.start()
  const status = (id: string) => run.snapshot.nodes[id].status
  return { run, events, status }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RunExecution', () => {
  test('starts a node only after its dependency succeeds, and passes text along', () => {
    const { run, events, status } = setup(linear)
    expect([status('in'), status('up'), status('a')]).toEqual(['running', 'queued', 'queued'])

    vi.advanceTimersByTime(1000)
    expect([status('in'), status('up'), status('a')]).toEqual(['succeeded', 'running', 'queued'])

    vi.advanceTimersByTime(2000)
    expect(run.snapshot.status).toBe('succeeded')
    expect(run.snapshot.nodes.a.output).toBe('HELLO')
    expect(events.map((e) => (e.type === 'snapshot' ? 0 : e.seq))).toEqual(events.map((_, i) => i + 1))
  })

  test('runs independent eligible nodes concurrently', () => {
    const { status } = setup(fanOut, { durations: { in: 100 } })
    vi.advanceTimersByTime(100)
    expect([status('up'), status('low')]).toEqual(['running', 'running'])
  })

  test('a failure skips descendants, independent branches continue, and the run fails only once settled', () => {
    const { run, status } = setup(fanOut, { durations: { in: 100, up: 500, low: 2000, b: 2000 }, failing: ['up'] })

    vi.advanceTimersByTime(600)
    expect([status('up'), status('a'), status('low')]).toEqual(['failed', 'skipped', 'running'])
    expect(run.snapshot.nodes.a.error).toBe('Skipped: Up failed')
    expect(run.snapshot.status).toBe('running')

    vi.advanceTimersByTime(1500)
    expect([status('low'), status('b')]).toEqual(['succeeded', 'running'])
    expect(run.snapshot.status).toBe('running')

    vi.advanceTimersByTime(2000)
    expect(status('b')).toBe('succeeded')
    expect(run.snapshot.nodes.b.output).toBe('hello')
    expect(run.snapshot.status).toBe('failed')
  })

  test.each([
    ['Input', 'in', { up: 'skipped', a: 'skipped' }],
    ['Output', 'a', { up: 'succeeded', a: 'failed' }],
  ])('any node can fail, including %s', (_label, failing, expected) => {
    const { run, status } = setup(linear, { failing: [failing] })
    vi.runAllTimers()
    expect({ up: status('up'), a: status('a') }).toEqual(expected)
    expect(run.snapshot.status).toBe('failed')
  })

  test('cancel aborts running work and queued nodes, keeps settled states, and ignores late completions', () => {
    const { run, events, status } = setup(linear)
    vi.advanceTimersByTime(1000)
    expect([status('in'), status('up')]).toEqual(['succeeded', 'running'])

    run.cancel()
    expect([status('in'), status('up'), status('a')]).toEqual(['succeeded', 'cancelled', 'cancelled'])
    expect(run.snapshot.status).toBe('cancelled')

    const settled = run.snapshot
    const eventCount = events.length
    vi.advanceTimersByTime(10_000)
    expect(run.snapshot).toBe(settled)
    expect(events).toHaveLength(eventCount)
  })

  test('cancelling a terminal run does not change its result', () => {
    const { run, events } = setup(linear, { failing: ['a'] })
    vi.runAllTimers()
    const settled = run.snapshot
    const eventCount = events.length

    run.cancel()
    expect(run.snapshot).toBe(settled)
    expect(run.snapshot.status).toBe('failed')
    expect(events).toHaveLength(eventCount)
  })
})
