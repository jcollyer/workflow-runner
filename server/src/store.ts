import { randomUUID } from 'node:crypto'
import type { Workflow } from '@wand/shared'
import { RunExecution, type ExecutionOptions } from './execution.ts'

const shortId = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 10)}`

/** In-memory only (no database by design). Nothing is evicted; see README limitations. */
export class Store {
  private readonly workflows = new Map<string, Workflow>()
  private readonly runs = new Map<string, RunExecution>()
  private readonly executionOptions: Required<ExecutionOptions>

  constructor(executionOptions: Required<ExecutionOptions>) {
    this.executionOptions = executionOptions
  }

  /** Stores an immutable copy so a later edit can never change an accepted workflow. */
  addWorkflow(workflow: Workflow): string {
    const id = shortId('wf')
    this.workflows.set(id, structuredClone(workflow))
    return id
  }

  startRun(workflowId: string): RunExecution | undefined {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) return undefined
    const run = new RunExecution(shortId('run'), workflowId, workflow, this.executionOptions)
    this.runs.set(run.snapshot.runId, run)
    run.start()
    return run
  }

  getRun(runId: string): RunExecution | undefined {
    return this.runs.get(runId)
  }
}
