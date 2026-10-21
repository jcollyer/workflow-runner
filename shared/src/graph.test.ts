import { describe, expect, test } from 'vitest'
import { canConnect, validateWorkflow } from './graph.ts'
import type { TransformConfig, Workflow, WorkflowEdge, WorkflowNode } from './workflow.ts'

const at = { x: 0, y: 0 }
const input = (id: string, name = 'Input'): WorkflowNode => ({ id, name, type: 'input', position: at, config: { text: 'hi' } })
const transform = (id: string, config: TransformConfig = { operation: 'uppercase' }, name = 'Upper'): WorkflowNode => ({
  id,
  name,
  type: 'transform',
  position: at,
  config,
})
const output = (id: string, name = 'Out'): WorkflowNode => ({ id, name, type: 'output', position: at, config: {} })
const edge = (source: string, target: string, id = `${source}->${target}`): WorkflowEdge => ({ id, source, target })
const workflow = (nodes: WorkflowNode[], edges: WorkflowEdge[] = []): Workflow => ({ name: 'Test', nodes, edges })

const codes = (wf: Workflow) => validateWorkflow(wf).map((i) => i.code)

describe('canConnect', () => {
  const nodes = [input('in'), transform('t1'), transform('t2'), transform('t3'), output('out')]

  test('allows Input → Transform → Output and fan-out', () => {
    const graph = { nodes, edges: [edge('in', 't1')] }
    expect(canConnect(graph, 't1', 'out')).toEqual({ ok: true })
    expect(canConnect(graph, 'in', 't2')).toEqual({ ok: true })
  })

  test.each([
    ['missing_node', 'in', 'ghost', []],
    ['self_connection', 't1', 't1', []],
    ['edge_from_output', 'out', 't1', []],
    ['edge_into_input', 't1', 'in', []],
    ['duplicate_connection', 'in', 't1', [edge('in', 't1')]],
    ['multiple_incoming', 't2', 't1', [edge('in', 't1')]],
    ['cycle', 't3', 't1', [edge('t1', 't2'), edge('t2', 't3')]],
  ])('rejects %s', (code, source, target, edges) => {
    expect(canConnect({ nodes, edges }, source, target)).toMatchObject({ ok: false, code })
  })
})

describe('validateWorkflow: structure', () => {
  test('accepts the sketch workflow (one Input fanning out to two branches)', () => {
    const wf = workflow(
      [input('in'), transform('up'), transform('low', { operation: 'lowercase' }, 'Lower'), output('a'), output('b')],
      [edge('in', 'up'), edge('in', 'low'), edge('up', 'a'), edge('low', 'b')],
    )
    expect(validateWorkflow(wf)).toEqual([])
  })

  test('reports duplicate node and edge IDs', () => {
    const wf = workflow([input('in'), output('out'), output('out')], [edge('in', 'out', 'e1'), edge('in', 'out', 'e1')])
    expect(codes(wf)).toEqual(expect.arrayContaining(['duplicate_node_id', 'duplicate_edge_id']))
  })

  test('reports edges referencing missing nodes', () => {
    const wf = workflow([input('in')], [edge('in', 'ghost', 'e1')])
    expect(validateWorkflow(wf)).toEqual([expect.objectContaining({ code: 'missing_node', edgeId: 'e1' })])
  })

  test('reports the second of two conflicting edges', () => {
    const wf = workflow([input('in'), transform('t1'), output('out')], [edge('in', 'out', 'first'), edge('t1', 'out', 'second')])
    expect(validateWorkflow(wf)).toEqual([expect.objectContaining({ code: 'multiple_incoming', edgeId: 'second' })])
  })

  test.each([
    ['self_connection', [edge('t1', 't1')]],
    ['edge_from_output', [edge('out', 't1')]],
    ['edge_into_input', [edge('t1', 'in')]],
    ['duplicate_connection', [edge('in', 't1', 'a'), edge('in', 't1', 'b')]],
  ])('reports %s', (code, edges) => {
    expect(codes(workflow([input('in'), transform('t1'), output('out')], edges))).toContain(code)
  })

  test('reports the edge that closes a cycle, once', () => {
    const wf = workflow([input('in'), transform('t1'), transform('t2'), output('out')], [edge('t1', 't2'), edge('t2', 't1')])
    expect(validateWorkflow(wf)).toEqual([expect.objectContaining({ code: 'cycle', edgeId: 't2->t1' })])
  })

  test('skips run-readiness checks when the structure is invalid', () => {
    const wf = workflow([input('in', ''), transform('t1')], [edge('t1', 't1')])
    expect(codes(wf)).toEqual(['self_connection'])
  })
})

describe('validateWorkflow: run readiness', () => {
  test('an empty workflow has no Input-to-Output path', () => {
    expect(codes(workflow([]))).toEqual(['no_output_path'])
  })

  test('an unconnected Output has no input and leaves no path', () => {
    expect(validateWorkflow(workflow([input('in'), output('out', 'Result')]))).toEqual([
      expect.objectContaining({ code: 'no_incoming', nodeId: 'out', message: 'Result has no input.' }),
      expect.objectContaining({ code: 'no_output_path' }),
    ])
  })

  test('a Transform without input is reported even when another path exists', () => {
    const wf = workflow([input('in'), transform('t1'), output('out')], [edge('in', 'out')])
    expect(validateWorkflow(wf)).toEqual([expect.objectContaining({ code: 'no_incoming', nodeId: 't1' })])
  })

  test('allows dead ends: an unconnected Input and a Transform with nothing downstream', () => {
    const wf = workflow([input('in'), input('spare'), transform('t1'), output('out')], [edge('in', 'out'), edge('in', 't1')])
    expect(validateWorkflow(wf)).toEqual([])
  })

  test('requires a name, falling back to the type name in the message', () => {
    const wf = workflow([input('in'), transform('t1', { operation: 'uppercase' }, '   '), output('out')], [edge('in', 't1'), edge('t1', 'out')])
    expect(validateWorkflow(wf)).toEqual([
      expect.objectContaining({ code: 'empty_name', nodeId: 't1', message: 'Transform needs a name.' }),
    ])
  })

  test('requires Replace to have text to find', () => {
    const replace: TransformConfig = { operation: 'replace', find: '', replaceWith: 'x' }
    const wf = workflow([input('in'), transform('t1', replace, 'Swap'), output('out')], [edge('in', 't1'), edge('t1', 'out')])
    expect(validateWorkflow(wf)).toEqual([expect.objectContaining({ code: 'empty_find', nodeId: 't1' })])
  })
})
