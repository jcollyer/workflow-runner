import type { Dispatch } from 'react'
import { ChevronsUpDown, Trash, X } from 'lucide-react'
import {
  LIMITS,
  TransformOperation,
  describeTransform,
  type IssueCode,
  type NodeRunState,
  type TransformConfig,
  type ValidationIssue,
  type WorkflowNode,
} from '@wand/shared'
import { OPERATION_LABELS, configForOperation, type EditorAction } from '../state/editor.ts'
import { Field } from './Field.tsx'
import { TYPE_LABELS } from './flowTypes.ts'
import { NodeTypeIcon, StatusIcon } from './icons.tsx'
import { NODE_STATUS_LABELS, nodeDuration } from './runLabels.ts'

interface NodeSettingsPanelProps {
  node: WorkflowNode
  issues: ValidationIssue[]
  dispatch: Dispatch<EditorAction>
  /** Read-only while a run is starting or running; inspection stays available (DECISIONS #11). */
  locked: boolean
  run?: NodeRunState
}

// Every field writes straight to the workflow on change; invalid values are kept and
// flagged inline rather than blocked (DECISIONS #13).
export function NodeSettingsPanel({ node, issues, dispatch, locked, run }: NodeSettingsPanelProps) {
  const has = (code: IssueCode) => issues.some((issue) => issue.code === code)

  return (
    <aside className="panel" aria-label={`${TYPE_LABELS[node.type]} settings`}>
      <header className="panel__header">
        <h2 className="panel__title">
          <NodeTypeIcon type={node.type} />
          {TYPE_LABELS[node.type]} settings
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close settings"
          onClick={() => dispatch({ type: 'select', selection: null })}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="panel__body">
        {locked && <p className="callout callout--info">Editing is locked during execution.</p>}
        {run && <NodeRunSection run={run} />}

        <fieldset className="panel__fieldset" disabled={locked}>
          {has('no_incoming') && (
            <p className="callout callout--warning">
              Not connected. Drag from another node’s right handle to this node’s left handle.
            </p>
          )}

          <Field label="Name" error={has('empty_name') ? 'A name is required to run.' : undefined}>
            {(control) => (
              <input
                {...control}
                type="text"
                value={node.name}
                maxLength={LIMITS.nameLength}
                onChange={(e) => dispatch({ type: 'renameNode', id: node.id, name: e.target.value })}
              />
            )}
          </Field>

          {node.type === 'input' && (
            <Field label="Text" hint={`${node.config.text.length.toLocaleString()} / ${LIMITS.textLength.toLocaleString()} characters`}>
              {(control) => (
                <textarea
                  {...control}
                  rows={6}
                  value={node.config.text}
                  maxLength={LIMITS.textLength}
                  placeholder="Text to send through the workflow"
                  onChange={(e) => dispatch({ type: 'setInputText', id: node.id, text: e.target.value })}
                />
              )}
            </Field>
          )}

          {node.type === 'transform' && (
            <>
              <Field label="Operation" hint={describeTransform(node.config)}>
                {(control) => (
                  <div className="select">
                    <select
                      {...control}
                      value={node.config.operation}
                      onChange={(e) =>
                        dispatch({
                          type: 'setTransformConfig',
                          id: node.id,
                          config: configForOperation(TransformOperation.parse(e.target.value), node.config),
                        })
                      }
                    >
                      {TransformOperation.options.map((operation) => (
                        <option key={operation} value={operation}>
                          {OPERATION_LABELS[operation]}
                        </option>
                      ))}
                    </select>
                    <ChevronsUpDown size={14} aria-hidden="true" className="select__icon" />
                  </div>
                )}
              </Field>

              {node.config.operation === 'replace' && (
                <ReplaceFields node={node} config={node.config} findMissing={has('empty_find')} dispatch={dispatch} />
              )}
            </>
          )}

          {node.type === 'output' && (
            <p className="muted">This node shows the text it receives once the workflow runs.</p>
          )}
        </fieldset>
      </div>

      {!locked && (
        <footer className="panel__footer">
          <button type="button" className="danger-link" onClick={() => dispatch({ type: 'removeNode', id: node.id })}>
            <Trash size={14} aria-hidden="true" />
            Delete node
          </button>
        </footer>
      )}
    </aside>
  )
}

function NodeRunSection({ run }: { run: NodeRunState }) {
  const duration = nodeDuration(run)
  return (
    <section className="run-section" aria-label="Run result">
      <div className={`run-section__status status--${run.status}`}>
        <StatusIcon status={run.status} size={16} />
        {NODE_STATUS_LABELS[run.status]}
        {duration && <span className="muted"> · {duration}</span>}
      </div>
      {run.output !== undefined && (
        <>
          <h3 className="panel__subtitle">Output</h3>
          <pre className="run-section__output">{run.output === '' ? '(empty text)' : run.output}</pre>
        </>
      )}
      {run.error && <p className="run-section__error">{run.error}</p>}
    </section>
  )
}

type ReplaceConfig = Extract<TransformConfig, { operation: 'replace' }>

function ReplaceFields({
  node,
  config,
  findMissing,
  dispatch,
}: {
  node: WorkflowNode
  config: ReplaceConfig
  findMissing: boolean
  dispatch: Dispatch<EditorAction>
}) {
  const update = (patch: Partial<Omit<ReplaceConfig, 'operation'>>) =>
    dispatch({ type: 'setTransformConfig', id: node.id, config: { ...config, ...patch } })

  return (
    <>
      <Field
        label="Find"
        error={findMissing ? 'Enter the text to find.' : undefined}
        hint="Exact text, case-sensitive. Every match is replaced."
      >
        {(control) => (
          <input
            {...control}
            type="text"
            value={config.find}
            maxLength={LIMITS.textLength}
            onChange={(e) => update({ find: e.target.value })}
          />
        )}
      </Field>
      <Field label="Replace with" hint="Leave empty to delete matches.">
        {(control) => (
          <input
            {...control}
            type="text"
            value={config.replaceWith}
            maxLength={LIMITS.textLength}
            onChange={(e) => update({ replaceWith: e.target.value })}
          />
        )}
      </Field>
    </>
  )
}
