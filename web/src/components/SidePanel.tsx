import type { Dispatch } from 'react'
import { defaultNodeName, type Workflow, type WorkflowNode } from '@wand/shared'
import type { EditorAction, Selection } from '../state/editor.ts'
import type { WorkflowIssues } from '../state/useEditor.ts'
import { NodeSettingsPanel } from './NodeSettingsPanel.tsx'

interface SidePanelProps {
  workflow: Workflow
  selection: Selection
  issues: WorkflowIssues
  dispatch: Dispatch<EditorAction>
}

const label = (node: WorkflowNode | undefined) => (node ? node.name.trim() || defaultNodeName(node.type) : 'Unknown')

export function SidePanel({ workflow, selection, issues, dispatch }: SidePanelProps) {
  if (selection?.kind === 'node') {
    const node = workflow.nodes.find((n) => n.id === selection.id)
    if (node) return <NodeSettingsPanel key={node.id} node={node} issues={issues.byNode.get(node.id) ?? []} dispatch={dispatch} />
  }

  if (selection?.kind === 'edge') {
    const edge = workflow.edges.find((e) => e.id === selection.id)
    if (edge) {
      const byId = (id: string) => workflow.nodes.find((n) => n.id === id)
      return (
        <aside className="panel" aria-label="Connection">
          <header className="panel__header">
            <h2 className="panel__title">Connection</h2>
          </header>
          <div className="panel__body">
            <p>
              {label(byId(edge.source))} → {label(byId(edge.target))}
            </p>
          </div>
          <footer className="panel__footer">
            <button type="button" className="danger-link" onClick={() => dispatch({ type: 'removeEdge', id: edge.id })}>
              Delete connection
            </button>
          </footer>
        </aside>
      )
    }
  }

  return <WorkflowPanel workflow={workflow} issues={issues} dispatch={dispatch} />
}

function WorkflowPanel({ workflow, issues, dispatch }: Omit<SidePanelProps, 'selection'>) {
  return (
    <aside className="panel" aria-label="Workflow">
      <header className="panel__header">
        <h2 className="panel__title">Workflow</h2>
      </header>
      <div className="panel__body">
        <p className="muted">
          {workflow.nodes.length} {workflow.nodes.length === 1 ? 'node' : 'nodes'} · {workflow.edges.length}{' '}
          {workflow.edges.length === 1 ? 'connection' : 'connections'}
        </p>

        {issues.all.length === 0 ? (
          <p className="readiness readiness--ready">✓ Ready to run</p>
        ) : (
          <section>
            <h3 className="panel__subtitle">Before this can run</h3>
            <ul className="issue-list">
              {issues.all.map((issue) => (
                <li key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? ''}`}>
                  {issue.nodeId ? (
                    <button
                      type="button"
                      className="issue-list__link"
                      onClick={() => dispatch({ type: 'select', selection: { kind: 'node', id: issue.nodeId! } })}
                    >
                      {issue.message}
                    </button>
                  ) : (
                    issue.message
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="panel__subtitle">Shortcuts</h3>
          <dl className="shortcuts">
            <dt>Click node</dt>
            <dd>Edit settings</dd>
            <dt>Drag handle → handle</dt>
            <dd>Connect</dd>
            <dt>
              <kbd>Delete</kbd> / <kbd>⌫</kbd>
            </dt>
            <dd>Delete selection</dd>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Deselect</dd>
          </dl>
        </section>
      </div>
    </aside>
  )
}
