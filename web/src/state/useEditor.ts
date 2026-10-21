import { useEffect, useMemo, useReducer, useState } from 'react'
import { validateWorkflow, type ValidationIssue } from '@wand/shared'
import { editorReducer, exampleWorkflow, type EditorState } from './editor.ts'
import { loadWorkflow, saveWorkflow } from './storage.ts'

export type SaveStatus = 'saved' | 'unavailable'

export interface WorkflowIssues {
  all: ValidationIssue[]
  byNode: ReadonlyMap<string, ValidationIssue[]>
  /** Issues not attached to a node (e.g. no Input-to-Output path). */
  general: ValidationIssue[]
}

function initEditor(): EditorState {
  return { workflow: loadWorkflow() ?? exampleWorkflow(), selection: null }
}

function groupIssues(all: ValidationIssue[]): WorkflowIssues {
  const byNode = new Map<string, ValidationIssue[]>()
  const general: ValidationIssue[] = []
  for (const issue of all) {
    if (issue.nodeId) byNode.set(issue.nodeId, [...(byNode.get(issue.nodeId) ?? []), issue])
    else general.push(issue)
  }
  return { all, byNode, general }
}

export function useEditor() {
  const [state, dispatch] = useReducer(editorReducer, undefined, initEditor)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')

  // Selection changes keep the same workflow object, so they never trigger a save.
  useEffect(() => {
    // Syncing to an external system (localStorage) and surfacing whether the write worked.
    // oxlint-disable-next-line react/set-state-in-effect
    setSaveStatus(saveWorkflow(state.workflow) ? 'saved' : 'unavailable')
  }, [state.workflow])

  const issues = useMemo(() => groupIssues(validateWorkflow(state.workflow)), [state.workflow])

  return { state, dispatch, saveStatus, issues }
}
