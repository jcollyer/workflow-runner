import { useEffect, useState, type Dispatch } from 'react'
import { defaultNodeName, type Workflow, type WorkflowNode } from '@wand/shared'
import type { EditorAction, Selection } from '../state/editor.ts'
import { countStatuses, isRunSettled, type RunState } from '../state/run.ts'
import type { WorkflowIssues } from '../state/useEditor.ts'
import { NodeSettingsPanel } from './NodeSettingsPanel.tsx'
import { CONNECTION_LABELS, NODE_STATUS_LABELS, formatDuration } from './runLabels.ts'

interface SidePanelProps {
  workflow: Workflow
  selection: Selection
  issues: WorkflowIssues
  dispatch: Dispatch<EditorAction>
  run: RunState
  locked: boolean
}

const label = (node: WorkflowNode | undefined) => (node ? node.name.trim() || defaultNodeName(node.type) : 'Unknown')

export function SidePanel({ workflow, selection, issues, dispatch, run, locked }: SidePanelProps) {
  const runNodes = run.phase === 'active' ? run.snapshot?.nodes : undefined

  if (selection?.kind === 'node') {
    const node = workflow.nodes.find((n) => n.id === selection.id)
    if (node) {
      return (
        <NodeSettingsPanel
          key={node.id}
          node={node}
          issues={issues.byNode.get(node.id) ?? []}
          dispatch={dispatch}
          locked={locked}
          run={runNodes?.[node.id]}
        />
      )
    }
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
          {!locked && (
            <footer className="panel__footer">
              <button type="button" className="danger-link" onClick={() => dispatch({ type: 'removeEdge', id: edge.id })}>
                Delete connection
              </button>
            </footer>
          )}
        </aside>
      )
    }
  }

  if (run.phase === 'active') return <RunDetailsPanel run={run} />
  return <WorkflowPanel workflow={workflow} issues={issues} dispatch={dispatch} />
}

/** Re-renders every second while `active`, for live elapsed time. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

const COUNTED_STATUSES = ['succeeded', 'running', 'queued', 'failed', 'skipped', 'cancelled'] as const

function RunDetailsPanel({ run }: { run: Extract<RunState, { phase: 'active' }> }) {
  const settled = isRunSettled(run)
  const now = useNow(!settled && run.snapshot !== null)
  const { snapshot } = run
  const counts = snapshot ? countStatuses(snapshot) : null
  const connection = settled ? 'closed' : run.connection

  return (
    <aside className="panel" aria-label="Run details">
      <header className="panel__header">
        <h2 className="panel__title">Run details</h2>
      </header>
      <div className="panel__body">
        <p className={`connection connection--${connection}`}>
          <span className="status-dot" aria-hidden="true" /> {CONNECTION_LABELS[connection]}
        </p>

        {run.connection === 'lost' && !settled && (
          <p className="callout callout--warning">
            {snapshot
              ? 'Lost connection to this run. The results shown may be incomplete.'
              : 'This run is no longer available (the server may have restarted). Edit or run the workflow to continue.'}
          </p>
        )}

        <dl className="details">
          <dt>Run ID</dt>
          <dd className="details__mono">{run.runId}</dd>
          {snapshot && (
            <>
              <dt>Started</dt>
              <dd>{new Date(snapshot.startedAt).toLocaleString()}</dd>
              <dt>Elapsed</dt>
              {/* Whole seconds while live (the clock ticks once a second); exact once finished. */}
              <dd>
                {snapshot.finishedAt !== undefined
                  ? formatDuration(snapshot.finishedAt - snapshot.startedAt)
                  : `${Math.max(0, Math.floor((now - snapshot.startedAt) / 1000))}s`}
              </dd>
            </>
          )}
        </dl>

        {counts && (
          <dl className="details details--counts">
            <div className="details__row">
              <dt>Total nodes</dt>
              <dd>{counts.total}</dd>
            </div>
            {COUNTED_STATUSES.map((status) => (
              <div key={status} className={`details__row status--${status}`}>
                <dt>{NODE_STATUS_LABELS[status]}</dt>
                <dd>{counts[status]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <footer className="panel__footer muted">
        {settled
          ? 'Results stay on the canvas until you next edit the workflow.'
          : 'ⓘ Editing is locked during execution. You can still pan, zoom and inspect nodes.'}
      </footer>
    </aside>
  )
}

function WorkflowPanel({ workflow, issues, dispatch }: Pick<SidePanelProps, 'workflow' | 'issues' | 'dispatch'>) {
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
