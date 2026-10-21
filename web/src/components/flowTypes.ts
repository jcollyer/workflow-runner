import type { Node } from '@xyflow/react'
import type { NodeType, ValidationIssue, WorkflowNode } from '@wand/shared'

/**
 * React Flow node built from a WorkflowNode at render time; the workflow document stays the source of truth.
 * All nodes share one React Flow type: `input`/`output` would collide with React Flow's built-in node
 * types and pick up their default styles. The domain type lives in `data.node.type`.
 */
export type NodeData = { node: WorkflowNode; issues: ValidationIssue[] }
export type FlowNode = Node<NodeData, 'workflow'>

export const TYPE_LABELS: Record<NodeType, string> = {
  input: 'Input',
  transform: 'Transform',
  output: 'Output',
}
