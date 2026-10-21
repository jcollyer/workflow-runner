import { Workflow } from '@wand/shared'

const STORAGE_KEY = 'wand.workflow.v1'

/** Returns the stored workflow, or null if missing, unparseable, or no longer matching the schema. */
export function parseStoredWorkflow(raw: string | null): Workflow | null {
  if (raw === null) return null
  try {
    const result = Workflow.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function loadWorkflow(): Workflow | null {
  try {
    return parseStoredWorkflow(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

/** Returns false when storage is unavailable (private mode, quota, blocked). */
export function saveWorkflow(workflow: Workflow): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflow))
    return true
  } catch {
    return false
  }
}
