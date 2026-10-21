import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { defaultNodeName, describeTransform, type WorkflowNode } from '@wand/shared'
import { TYPE_LABELS, type FlowNode } from './flowTypes.ts'

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

function WorkflowNodeViewImpl({ data, selected }: NodeProps<FlowNode>) {
  const { node, issues } = data
  const name = node.name.trim()
  const classes = ['wf-node', `wf-node--${node.type}`, selected && 'is-selected', issues.length > 0 && 'has-issues']

  return (
    <div className={classes.filter(Boolean).join(' ')}>
      {node.type !== 'input' && <Handle type="target" position={Position.Left} />}
      <div className="wf-node__kicker">{TYPE_LABELS[node.type]}</div>
      <div className={name ? 'wf-node__title' : 'wf-node__title is-placeholder'}>{name || `Untitled ${defaultNodeName(node.type).toLowerCase()}`}</div>
      <div className="wf-node__subtitle">{subtitle(node)}</div>
      {issues.length > 0 && (
        <div className="wf-node__issue" title={issues.map((i) => i.message).join('\n')}>
          <span aria-hidden="true">⚠</span> {issues[0].message}
          {issues.length > 1 && ` (+${issues.length - 1})`}
        </div>
      )}
      {node.type !== 'output' && <Handle type="source" position={Position.Right} />}
    </div>
  )
}

export const WorkflowNodeView = memo(WorkflowNodeViewImpl)
