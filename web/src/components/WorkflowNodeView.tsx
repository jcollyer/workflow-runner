import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { defaultNodeName, describeTransform, type NodeRunState, type WorkflowNode } from '@wand/shared'
import { TYPE_LABELS, type FlowNode } from './flowTypes.ts'
import { NODE_STATUS_LABELS, nodeDuration } from './runLabels.ts'

function subtitle(node: WorkflowNode): string {
  switch (node.type) {
    case 'input':
      return node.config.text.trim() === '' ? 'Empty text' : node.config.text
    case 'transform':
      return describeTransform(node.config)
    case 'output':
      return 'Shows the result after a run'
  }
}

function RunStatus({ node, run }: { node: WorkflowNode; run: NodeRunState }) {
  const duration = nodeDuration(run)
  return (
    <>
      <div className={`wf-node__status status--${run.status}`}>
        <span className="status-dot" aria-hidden="true" />
        {NODE_STATUS_LABELS[run.status]}
        {duration && <span className="wf-node__duration">{duration}</span>}
      </div>
      {run.status === 'succeeded' && run.output !== undefined && (
        <div className={node.type === 'output' ? 'wf-node__output is-result' : 'wf-node__output'} title={run.output}>
          {run.output === '' ? <em>(empty text)</em> : run.output}
        </div>
      )}
      {run.error && run.status !== 'cancelled' && <div className="wf-node__error">{run.error}</div>}
    </>
  )
}

function WorkflowNodeViewImpl({ data, selected }: NodeProps<FlowNode>) {
  const { node, issues, run } = data
  const name = node.name.trim()
  const classes = [
    'wf-node',
    `wf-node--${node.type}`,
    selected && 'is-selected',
    run ? `run--${run.status}` : issues.length > 0 && 'has-issues',
  ]

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {node.type !== 'input' && <Handle type="target" position={Position.Left} />}
      <div className="wf-node__kicker">{TYPE_LABELS[node.type]}</div>
      <div className={name ? 'wf-node__title' : 'wf-node__title is-placeholder'}>{name || `Untitled ${defaultNodeName(node.type).toLowerCase()}`}</div>
      <div className="wf-node__subtitle">{subtitle(node)}</div>
      {run ? (
        <RunStatus node={node} run={run} />
      ) : (
        issues.length > 0 && (
          <div className="wf-node__issue" title={issues.map((i) => i.message).join('\n')}>
            <span aria-hidden="true">⚠</span> {issues[0].message}
            {issues.length > 1 && ` (+${issues.length - 1})`}
          </div>
        )
      )}
      {node.type !== 'output' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

export const WorkflowNodeView = memo(WorkflowNodeViewImpl)
