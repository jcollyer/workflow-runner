import { z } from 'zod'
import { ValidationIssue } from './graph.ts'

// Request/response bodies for the HTTP commands (DECISIONS #6). Request bodies:
//   POST /api/workflows             body: Workflow
//   POST /api/workflows/:id/runs    no body
//   POST /api/runs/:id/cancel       no body
// Run snapshots (GET /api/runs/:id, cancel response) use RunSnapshot from run.ts.

export const CreateWorkflowResponse = z.object({ workflowId: z.string() })
export type CreateWorkflowResponse = z.infer<typeof CreateWorkflowResponse>

export const StartRunResponse = z.object({ runId: z.string() })
export type StartRunResponse = z.infer<typeof StartRunResponse>

/**
 * Error body for every non-2xx response.
 * - 400 `bad_request`: body failed schema validation (malformed shape).
 * - 422 `invalid_workflow`: well-formed but breaks graph rules; see `issues`.
 * - 404 `not_found`: unknown workflow or run ID.
 * - 500 `internal`: unexpected server error.
 */
export const ApiError = z.object({
  error: z.enum(['bad_request', 'invalid_workflow', 'not_found', 'internal']),
  message: z.string(),
  issues: z.array(ValidationIssue).optional(),
})
export type ApiError = z.infer<typeof ApiError>
