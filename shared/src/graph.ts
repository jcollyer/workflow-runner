import { z } from 'zod'
import type { NodeType, Workflow, WorkflowNode } from './workflow.ts'

// Graph rules (DECISIONS #10, #12). Structural rules are enforced on connect in the
// canvas and re-checked by the server; run-readiness rules are checked on Run.

export const IssueCode = z.enum([
  // Structural
  'duplicate_node_id',
  'duplicate_edge_id',
  'missing_node',
  'self_connection',
  'edge_from_output',
  'edge_into_input',
  'duplicate_connection',
  'multiple_incoming',
  'cycle',
  // Run readiness
  'empty_name',
  'no_incoming',
  'empty_find',
  'no_output_path',
])
export type IssueCode = z.infer<typeof IssueCode>

export const ValidationIssue = z.object({
  code: IssueCode,
  message: z.string(),
  nodeId: z.string().optional(),
  edgeId: z.string().optional(),
})
export type ValidationIssue = z.infer<typeof ValidationIssue>

/** The minimum the connection rules need, so the canvas can pass its own node/edge objects. */
export interface GraphLike {
  nodes: ReadonlyArray<{ id: string; type: NodeType }>
  edges: ReadonlyArray<{ source: string; target: string }>
}

export type ConnectionCheck = { ok: true } | { ok: false; code: IssueCode; message: string }

const DEFAULT_NAMES: Record<NodeType, string> = {
  input: 'Input',
  transform: 'Transform',
  output: 'Output',
}

export function defaultNodeName(type: NodeType): string {
  return DEFAULT_NAMES[type]
}

function label(node: WorkflowNode): string {
  return node.name.trim() || defaultNodeName(node.type)
}

function reject(code: IssueCode, message: string): ConnectionCheck {
  return { ok: false, code, message }
}

/** Is `to` reachable from `from` by following edges forward? */
function reaches(edges: GraphLike['edges'], from: string, to: string): boolean {
  const targets = new Map<string, string[]>()
  for (const edge of edges) {
    targets.set(edge.source, [...(targets.get(edge.source) ?? []), edge.target])
  }
  const seen = new Set<string>([from])
  const stack = [from]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === to) return true
    for (const next of targets.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        stack.push(next)
      }
    }
  }
  return false
}

/** Would adding `source → target` keep the graph structurally valid? */
export function canConnect(graph: GraphLike, source: string, target: string): ConnectionCheck {
  const sourceNode = graph.nodes.find((n) => n.id === source)
  const targetNode = graph.nodes.find((n) => n.id === target)
  if (!sourceNode || !targetNode) return reject('missing_node', 'Connection references a node that does not exist.')
  if (source === target) return reject('self_connection', 'A node cannot connect to itself.')
  if (sourceNode.type === 'output') return reject('edge_from_output', 'Output is a terminal step and cannot connect onward.')
  if (targetNode.type === 'input') return reject('edge_into_input', 'Input nodes cannot receive connections.')
  if (graph.edges.some((e) => e.source === source && e.target === target)) {
    return reject('duplicate_connection', 'These nodes are already connected.')
  }
  if (graph.edges.some((e) => e.target === target)) {
    return reject('multiple_incoming', 'This node already has an input.')
  }
  if (reaches(graph.edges, target, source)) return reject('cycle', 'This connection would create a cycle.')
  return { ok: true }
}

/**
 * Full validation of a workflow. Returns structural issues if there are any (run
 * readiness is meaningless on a malformed graph); otherwise run-readiness issues.
 * An empty array means the workflow can run.
 */
export function validateWorkflow(workflow: Workflow): ValidationIssue[] {
  const structural = validateStructure(workflow)
  return structural.length > 0 ? structural : validateRunReadiness(workflow)
}

function validateStructure(workflow: Workflow): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  const nodeIds = new Set<string>()
  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ code: 'duplicate_node_id', message: `Node ID "${node.id}" is used more than once.`, nodeId: node.id })
    }
    nodeIds.add(node.id)
  }

  const edgeIds = new Set<string>()
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push({ code: 'duplicate_edge_id', message: `Edge ID "${edge.id}" is used more than once.`, edgeId: edge.id })
    }
    edgeIds.add(edge.id)
  }

  // Check each edge against the edges accepted before it, so the second of two
  // conflicting edges is the one reported. Cycles are left to the pass below so
  // the edge that closes the loop is reported regardless of edge order.
  const accepted: Workflow['edges'] = []
  for (const edge of workflow.edges) {
    const check = canConnect({ nodes: workflow.nodes, edges: accepted }, edge.source, edge.target)
    if (check.ok || check.code === 'cycle') {
      accepted.push(edge)
    } else {
      issues.push({ code: check.code, message: check.message, edgeId: edge.id })
    }
  }

  issues.push(...findCycleEdges(workflow.nodes, accepted))
  return issues
}

/** Depth-first search; every back edge closes a cycle. */
function findCycleEdges(nodes: Workflow['nodes'], edges: Workflow['edges']): ValidationIssue[] {
  const outgoing = new Map<string, Workflow['edges']>()
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  }

  const issues: ValidationIssue[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (nodeId: string) => {
    state.set(nodeId, 'visiting')
    for (const edge of outgoing.get(nodeId) ?? []) {
      const next = state.get(edge.target)
      if (next === 'visiting') {
        issues.push({ code: 'cycle', message: 'This connection creates a cycle.', edgeId: edge.id })
      } else if (next === undefined) {
        visit(edge.target)
      }
    }
    state.set(nodeId, 'done')
  }
  for (const node of nodes) {
    if (!state.has(node.id)) visit(node.id)
  }
  return issues
}

// Assumes a structurally valid graph: one incoming edge per Transform/Output and no
// cycles, so "has an incoming edge" is equivalent to "reachable from an Input"
// (DECISIONS #12).
function validateRunReadiness(workflow: Workflow): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const hasIncoming = new Set(workflow.edges.map((e) => e.target))

  for (const node of workflow.nodes) {
    if (node.name.trim() === '') {
      issues.push({ code: 'empty_name', message: `${label(node)} needs a name.`, nodeId: node.id })
    }
    if (node.type !== 'input' && !hasIncoming.has(node.id)) {
      issues.push({ code: 'no_incoming', message: `${label(node)} has no input.`, nodeId: node.id })
    }
    if (node.type === 'transform' && node.config.operation === 'replace' && node.config.find === '') {
      issues.push({ code: 'empty_find', message: `${label(node)} needs text to find.`, nodeId: node.id })
    }
  }

  if (!workflow.nodes.some((n) => n.type === 'output' && hasIncoming.has(n.id))) {
    issues.push({ code: 'no_output_path', message: 'Connect an Input to an Output to run this workflow.' })
  }
  return issues
}
