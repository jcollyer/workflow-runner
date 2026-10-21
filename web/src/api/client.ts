import type { z } from 'zod'
import {
  ApiError,
  CreateWorkflowResponse,
  RunSnapshot,
  StartRunResponse,
  type ValidationIssue,
  type Workflow,
} from '@wand/shared'

// HTTP commands. Every response is parsed with the shared schema, so a contract drift
// fails loudly here instead of surfacing as undefined fields in the UI.

export class ApiRequestError extends Error {
  readonly status: number
  readonly issues: ValidationIssue[]

  constructor(status: number, message: string, issues: ValidationIssue[] = []) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

const UNREACHABLE = 'Could not reach the server. Is it running?'

async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiRequestError(0, UNREACHABLE)
  }

  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const error = ApiError.safeParse(json)
    if (error.success) throw new ApiRequestError(res.status, error.data.message, error.data.issues)
    // The Vite proxy answers 5xx with no JSON body when the server is down.
    throw new ApiRequestError(res.status, res.status >= 500 ? UNREACHABLE : `Request failed (${res.status}).`)
  }
  return schema.parse(json)
}

export const createWorkflow = (workflow: Workflow) => request('/api/workflows', CreateWorkflowResponse, workflow)

export const startRun = (workflowId: string) =>
  request(`/api/workflows/${encodeURIComponent(workflowId)}/runs`, StartRunResponse)

export const cancelRun = (runId: string) => request(`/api/runs/${encodeURIComponent(runId)}/cancel`, RunSnapshot)

export const runEventsUrl = (runId: string) => `/api/runs/${encodeURIComponent(runId)}/events`
