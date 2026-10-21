import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  ApiError,
  CreateWorkflowResponse,
  HealthResponse,
  RunEvent,
  RunSnapshot,
  StartRunResponse,
  type Workflow,
} from '@wand/shared'
import { createApp, type AppOptions } from './app.ts'

const servers: Server[] = []

async function serve(options: AppOptions) {
  const server = createApp(options).listen(0)
  servers.push(server)
  await new Promise((resolve) => server.once('listening', resolve))
  return `http://localhost:${(server.address() as AddressInfo).port}`
}

afterAll(() => {
  for (const server of servers) {
    server.closeAllConnections()
    server.close()
  }
})

const workflow: Workflow = {
  name: 'Test',
  nodes: [
    { id: 'in', name: 'In', type: 'input', position: { x: 0, y: 0 }, config: { text: 'Hello' } },
    { id: 'up', name: 'Up', type: 'transform', position: { x: 0, y: 0 }, config: { operation: 'uppercase' } },
    { id: 'out', name: 'Out', type: 'output', position: { x: 0, y: 0 }, config: {} },
  ],
  edges: [
    { id: 'e1', source: 'in', target: 'up' },
    { id: 'e2', source: 'up', target: 'out' },
  ],
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {}),
  })

async function startRun(baseUrl: string): Promise<string> {
  const accepted = await post(`${baseUrl}/api/workflows`, workflow)
  expect(accepted.status).toBe(201)
  const { workflowId } = CreateWorkflowResponse.parse(await accepted.json())
  const started = await post(`${baseUrl}/api/workflows/${workflowId}/runs`)
  expect(started.status).toBe(202)
  return StartRunResponse.parse(await started.json()).runId
}

/** Reads an SSE stream to completion (the server ends it once the run is terminal). */
async function readEvents(url: string): Promise<RunEvent[]> {
  const text = await (await fetch(url)).text()
  return text
    .split('\n\n')
    .flatMap((block) => block.split('\n').filter((line) => line.startsWith('data: ')))
    .map((line) => RunEvent.parse(JSON.parse(line.slice('data: '.length))))
}

describe('fast, always-succeeding runs', () => {
  let baseUrl: string
  beforeAll(async () => {
    baseUrl = await serve({ execution: { durationMs: () => 20, shouldFail: () => false } })
  })

  test('GET /api/health matches the shared schema', async () => {
    const res = await fetch(`${baseUrl}/api/health`)
    expect(HealthResponse.safeParse(await res.json()).success).toBe(true)
  })

  test('POST /api/workflows rejects a malformed shape with 400', async () => {
    const res = await post(`${baseUrl}/api/workflows`, { name: 'x', nodes: 'nope', edges: [] })
    expect(res.status).toBe(400)
    expect(ApiError.parse(await res.json()).error).toBe('bad_request')
  })

  test('POST /api/workflows rejects invalid JSON with a JSON 400', async () => {
    const res = await post(`${baseUrl}/api/workflows`, '{not json')
    expect(res.status).toBe(400)
    expect(ApiError.parse(await res.json()).error).toBe('bad_request')
  })

  test('POST /api/workflows rejects a rule-breaking graph with 422 and node-level issues', async () => {
    const res = await post(`${baseUrl}/api/workflows`, { ...workflow, edges: [workflow.edges[0]] })
    expect(res.status).toBe(422)
    const body = ApiError.parse(await res.json())
    expect(body.error).toBe('invalid_workflow')
    expect(body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'no_incoming', nodeId: 'out' })]))
  })

  test('streams a snapshot first, then ordered deltas, and ends after the run settles', async () => {
    const runId = await startRun(baseUrl)
    const events = await readEvents(`${baseUrl}/api/runs/${runId}/events`)

    expect(events[0].type).toBe('snapshot')
    const deltas = events.slice(1).map((e) => (e.type === 'snapshot' ? -1 : e.seq))
    expect(deltas).toEqual([...deltas].sort((x, y) => x - y))
    expect(events.at(-1)).toMatchObject({ type: 'run', status: 'succeeded' })

    const snapshot = RunSnapshot.parse(await (await fetch(`${baseUrl}/api/runs/${runId}`)).json())
    expect(snapshot.status).toBe('succeeded')
    expect(snapshot.nodes.out.output).toBe('HELLO')
  })

  test('returns JSON 404s for unknown workflows, runs and routes', async () => {
    for (const res of [
      await post(`${baseUrl}/api/workflows/wf_missing/runs`),
      await fetch(`${baseUrl}/api/runs/run_missing`),
      await fetch(`${baseUrl}/api/runs/run_missing/events`),
      await post(`${baseUrl}/api/runs/run_missing/cancel`),
      await fetch(`${baseUrl}/api/nope`),
    ]) {
      expect(res.status).toBe(404)
      expect(ApiError.parse(await res.json()).error).toBe('not_found')
    }
  })
})

describe('slow runs', () => {
  let baseUrl: string
  beforeAll(async () => {
    baseUrl = await serve({ execution: { durationMs: () => 60_000, shouldFail: () => false } })
  })

  test('cancel returns the current snapshot with unfinished nodes cancelled; repeating it changes nothing', async () => {
    const runId = await startRun(baseUrl)
    const first = await post(`${baseUrl}/api/runs/${runId}/cancel`)
    expect(first.status).toBe(200)
    const snapshot = RunSnapshot.parse(await first.json())
    expect(snapshot.status).toBe('cancelled')
    expect(Object.values(snapshot.nodes).map((n) => n.status)).toEqual(['cancelled', 'cancelled', 'cancelled'])

    const second = RunSnapshot.parse(await (await post(`${baseUrl}/api/runs/${runId}/cancel`)).json())
    expect(second).toEqual(snapshot)
  })

  test('subscribing to a terminal run sends its snapshot and ends the stream', async () => {
    const runId = await startRun(baseUrl)
    await post(`${baseUrl}/api/runs/${runId}/cancel`)
    const events = await readEvents(`${baseUrl}/api/runs/${runId}/events`)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'snapshot', snapshot: { status: 'cancelled' } })
  })

  test('a live subscriber receives cancellation as it happens', async () => {
    const runId = await startRun(baseUrl)
    const streamed = readEvents(`${baseUrl}/api/runs/${runId}/events`)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await post(`${baseUrl}/api/runs/${runId}/cancel`)
    const events = await streamed
    expect(events[0].type).toBe('snapshot')
    expect(events.at(-1)).toMatchObject({ type: 'run', status: 'cancelled' })
  })
})
