import express, { type ErrorRequestHandler, type Response } from 'express'
import { z } from 'zod'
import {
  Workflow,
  isTerminalRunStatus,
  validateWorkflow,
  type ApiError,
  type CreateWorkflowResponse,
  type HealthResponse,
  type RunEvent,
  type StartRunResponse,
} from '@wand/shared'
import { defaultExecutionOptions, type ExecutionOptions } from './execution.ts'
import { Store } from './store.ts'

const HEARTBEAT_MS = 15_000

function sendError(res: Response, status: number, body: ApiError) {
  res.status(status).json(body)
}

function notFound(res: Response, what: 'Workflow' | 'Run') {
  sendError(res, 404, { error: 'not_found', message: `${what} not found.` })
}

export interface AppOptions {
  execution?: ExecutionOptions
}

export function createApp(options: AppOptions = {}) {
  const store = new Store({ ...defaultExecutionOptions(), ...options.execution })
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = { ok: true, service: 'wand-server' }
    res.json(body)
  })

  // Validate + accept. Shape errors → 400; well-formed but rule-breaking → 422 with issues (DECISIONS #13).
  app.post('/api/workflows', (req, res) => {
    const parsed = Workflow.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, 400, { error: 'bad_request', message: z.prettifyError(parsed.error) })
    }
    const issues = validateWorkflow(parsed.data)
    if (issues.length > 0) {
      return sendError(res, 422, { error: 'invalid_workflow', message: 'Workflow cannot run yet.', issues })
    }
    const body: CreateWorkflowResponse = { workflowId: store.addWorkflow(parsed.data) }
    res.status(201).json(body)
  })

  app.post('/api/workflows/:id/runs', (req, res) => {
    const run = store.startRun(req.params.id)
    if (!run) return notFound(res, 'Workflow')
    const body: StartRunResponse = { runId: run.snapshot.runId }
    res.status(202).json(body)
  })

  app.get('/api/runs/:id', (req, res) => {
    const run = store.getRun(req.params.id)
    if (!run) return notFound(res, 'Run')
    res.json(run.snapshot)
  })

  // Cancelling a terminal run is a no-op; either way the response is the current snapshot.
  app.post('/api/runs/:id/cancel', (req, res) => {
    const run = store.getRun(req.params.id)
    if (!run) return notFound(res, 'Run')
    run.cancel()
    res.json(run.snapshot)
  })

  // SSE: a full snapshot on every (re)connect, then deltas. The stream ends once the run
  // is terminal; clients must close their EventSource then, or it will reconnect.
  app.get('/api/runs/:id/events', (req, res) => {
    const run = store.getRun(req.params.id)
    if (!run) return notFound(res, 'Run')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    const send = (event: RunEvent) => {
      const id = event.type === 'snapshot' ? event.snapshot.seq : event.seq
      res.write(`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`)
    }

    send({ type: 'snapshot', snapshot: run.snapshot })
    if (isTerminalRunStatus(run.snapshot.status)) {
      res.end()
      return
    }

    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
    const cleanup = () => {
      clearInterval(heartbeat)
      unsubscribe()
    }
    const unsubscribe = run.subscribe((event) => {
      send(event)
      if (event.type === 'run' && isTerminalRunStatus(event.status)) {
        cleanup()
        res.end()
      }
    })
    req.on('close', cleanup)
  })

  app.use('/api', (_req, res) => {
    sendError(res, 404, { error: 'not_found', message: 'No such endpoint.' })
  })

  // Malformed JSON, oversized bodies, etc. from express.json() arrive here as 4xx errors.
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status = typeof err?.status === 'number' ? err.status : 500
    if (status >= 400 && status < 500) {
      return sendError(res, status, { error: 'bad_request', message: err.message ?? 'Bad request.' })
    }
    console.error(err)
    sendError(res, 500, { error: 'internal', message: 'Unexpected server error.' })
  }
  app.use(errorHandler)

  return app
}
