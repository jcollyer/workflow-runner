import { z } from 'zod'

// Shape only. Schemas accept anything the editor can legitimately hold (including
// empty names and an empty Replace `find`) so drafts always round-trip through
// localStorage. What is needed to *run* is decided by the rules in graph.ts.

export const LIMITS = {
  nodes: 200,
  edges: 400,
  nameLength: 60,
  textLength: 10_000,
} as const

export const NodeType = z.enum(['input', 'transform', 'output'])
export type NodeType = z.infer<typeof NodeType>

export const TransformOperation = z.enum(['uppercase', 'lowercase', 'normalize', 'replace'])
export type TransformOperation = z.infer<typeof TransformOperation>

export const InputConfig = z.object({
  text: z.string().max(LIMITS.textLength),
})
export type InputConfig = z.infer<typeof InputConfig>

export const TransformConfig = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('uppercase') }),
  z.object({ operation: z.literal('lowercase') }),
  z.object({ operation: z.literal('normalize') }),
  z.object({
    operation: z.literal('replace'),
    find: z.string().max(LIMITS.textLength),
    replaceWith: z.string().max(LIMITS.textLength),
  }),
])
export type TransformConfig = z.infer<typeof TransformConfig>

export const OutputConfig = z.object({})
export type OutputConfig = z.infer<typeof OutputConfig>

const nodeBase = {
  id: z.string().min(1),
  name: z.string().max(LIMITS.nameLength),
  position: z.object({ x: z.number(), y: z.number() }),
}

export const InputNode = z.object({ ...nodeBase, type: z.literal('input'), config: InputConfig })
export const TransformNode = z.object({ ...nodeBase, type: z.literal('transform'), config: TransformConfig })
export const OutputNode = z.object({ ...nodeBase, type: z.literal('output'), config: OutputConfig })

export const WorkflowNode = z.discriminatedUnion('type', [InputNode, TransformNode, OutputNode])
export type WorkflowNode = z.infer<typeof WorkflowNode>

// Each node has a single input and a single output port, so edges carry no handle IDs.
export const WorkflowEdge = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
})
export type WorkflowEdge = z.infer<typeof WorkflowEdge>

export const Workflow = z.object({
  name: z.string().max(LIMITS.nameLength),
  nodes: z.array(WorkflowNode).max(LIMITS.nodes),
  edges: z.array(WorkflowEdge).max(LIMITS.edges),
})
export type Workflow = z.infer<typeof Workflow>
