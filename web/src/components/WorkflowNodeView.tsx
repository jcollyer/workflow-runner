import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { TriangleAlert } from 'lucide-react'
import { defaultNodeName, describeTransform, type WorkflowNode } from '@wand/shared'
import type { FlowNode } from './flowTypes.ts'
import { NodeTypeIcon, StatusIcon } from './icons.tsx'
import { NODE_STATUS_LABELS, nodeDuration } from './runLabels.ts'

const ICON_SIZE = 14

function description(node: WorkflowNode): string {
  switch (node.type) {
    case 'input':
      return node.config.text.trim() === '' ? 'Empty text' : node.config.text
    case 'transform':
      return describeTransform(node.config)
    case 'output':
      return 'Shows the result after a run'
  }
}

// Inverse-colour header (icon + name) over a body (description, or status while a run is
// presented). During a run the header takes the status colour and the status icon, and the
// description becomes the colour-coded status text (DECISIONS #28).
function WorkflowNodeViewImpl({ data, selected }: NodeProps<FlowNode>) {
  const { node, issues, run } = data
  const name = node.name.trim()
  const duration = run ? nodeDuration(run) : null
  const classes = [
    'wf-node',
    selected && 'is-selected',
    run ? `run--${run.status} status--${run.status}` : issues.length > 0 && 'has-issues',
  ]

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {node.type !== 'input' && <Handle type="target" position={Position.Left} />}

      <div className="wf-node__header">
        {run ? <StatusIcon status={run.status} size={ICON_SIZE} /> : <NodeTypeIcon type={node.type} size={ICON_SIZE} />}
        <span className={name ? 'wf-node__title' : 'wf-node__title is-placeholder'}>
          {name || `Untitled ${defaultNodeName(node.type).toLowerCase()}`}
        </span>
      </div>

      <div className="wf-node__body">
        {run ? (
          <div className="wf-node__subtitle wf-node__status">
            {NODE_STATUS_LABELS[run.status]}
            {duration && <span className="wf-node__duration"> · {duration}</span>}
          </div>
        ) : (
          <div className="wf-node__subtitle">{description(node)}</div>
        )}

        {run?.status === 'succeeded' && run.output !== undefined && (
          <div className={node.type === 'output' ? 'wf-node__output is-result' : 'wf-node__output'} title={run.output}>
            {run.output === '' ? <em>(empty text)</em> : run.output}
          </div>
        )}
        {run?.error && run.status !== 'cancelled' && <div className="wf-node__error">{run.error}</div>}

        {!run && issues.length > 0 && (
          <div className="wf-node__issue" title={issues.map((i) => i.message).join('\n')}>
            <TriangleAlert size={12} aria-hidden="true" /> {issues[0].message}
            {issues.length > 1 && ` (+${issues.length - 1})`}
          </div>
        )}
      </div>

      {node.type !== 'output' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

export const WorkflowNodeView = memo(WorkflowNodeViewImpl)
