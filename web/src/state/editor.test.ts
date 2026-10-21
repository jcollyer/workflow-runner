import { describe, expect, test } from 'vitest'
import { validateWorkflow } from '@wand/shared'
import { editorReducer, exampleWorkflow, type EditorAction, type EditorState } from './editor.ts'
import { parseStoredWorkflow } from './storage.ts'

const start = (): EditorState => ({ workflow: exampleWorkflow(), selection: null })
const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state)
const node = (state: EditorState, id: string) => state.workflow.nodes.find((n) => n.id === id)

describe('editorReducer', () => {
  test('the first-visit example is a valid, runnable Input → Transform → Output', () => {
    const { nodes, edges } = exampleWorkflow()
    expect(nodes.map((n) => n.type)).toEqual(['input', 'transform', 'output'])
    expect(edges).toHaveLength(2)
    expect(validateWorkflow(exampleWorkflow())).toEqual([])
  })

  test('adding a node selects it', () => {
    const state = run(start(), { type: 'addNode', id: 'n1', nodeType: 'output', position: { x: 5, y: 5 } })
    expect(node(state, 'n1')).toMatchObject({ type: 'output', name: 'Output', position: { x: 5, y: 5 } })
    expect(state.selection).toEqual({ kind: 'node', id: 'n1' })
  })

  test('deleting a node removes its connected edges and clears its selection', () => {
    const state = run(
      start(),
      { type: 'select', selection: { kind: 'node', id: 'transform-1' } },
      { type: 'removeNode', id: 'transform-1' },
    )
    expect(state.workflow.nodes.map((n) => n.id)).toEqual(['input-1', 'output-1'])
    expect(state.workflow.edges).toEqual([])
    expect(state.selection).toBeNull()
  })

  test('deleting a node clears a selected edge that was attached to it', () => {
    const state = run(
      start(),
      { type: 'select', selection: { kind: 'edge', id: 'e-input-1-transform-1' } },
      { type: 'removeNode', id: 'input-1' },
    )
    expect(state.selection).toBeNull()
  })

  // Config edits apply immediately, including temporarily invalid values (DECISIONS #13).
  test('keeps temporarily invalid values in the document', () => {
    const state = run(
      start(),
      { type: 'renameNode', id: 'input-1', name: '' },
      { type: 'setTransformConfig', id: 'transform-1', config: { operation: 'replace', find: '', replaceWith: '' } },
    )
    expect(node(state, 'input-1')?.name).toBe('')
    expect(validateWorkflow(state.workflow).map((i) => i.code)).toEqual(['empty_name', 'empty_find'])
  })

  test('changing operation renames an untouched Transform, but keeps a custom name', () => {
    const lower = { type: 'setTransformConfig', id: 'transform-1', config: { operation: 'lowercase' } } as const
    expect(node(run(start(), lower), 'transform-1')?.name).toBe('Lowercase')

    const custom = run(start(), { type: 'renameNode', id: 'transform-1', name: 'Shout' }, lower)
    expect(node(custom, 'transform-1')?.name).toBe('Shout')
  })

  test('connect rejects edges that break graph rules', () => {
    const before = run(start(), { type: 'addNode', id: 'out-2', nodeType: 'output', position: { x: 0, y: 0 } })
    expect(run(before, { type: 'connect', source: 'output-1', target: 'out-2' })).toBe(before)
    expect(run(before, { type: 'connect', source: 'input-1', target: 'out-2' }).workflow.edges).toHaveLength(3)
  })

  test('unselect only clears a selection that still points at the element', () => {
    const selected = run(start(), { type: 'select', selection: { kind: 'node', id: 'output-1' } })
    expect(run(selected, { type: 'unselect', kind: 'node', id: 'input-1' }).selection).toEqual({ kind: 'node', id: 'output-1' })
    expect(run(selected, { type: 'unselect', kind: 'node', id: 'output-1' }).selection).toBeNull()
  })

  test('selection changes keep the same workflow object (so they never trigger a save)', () => {
    const state = start()
    expect(run(state, { type: 'select', selection: { kind: 'node', id: 'input-1' } }).workflow).toBe(state.workflow)
  })
})

describe('parseStoredWorkflow', () => {
  test('round-trips a saved workflow', () => {
    expect(parseStoredWorkflow(JSON.stringify(exampleWorkflow()))).toEqual(exampleWorkflow())
  })

  test.each([
    ['nothing stored', null],
    ['corrupt JSON', '{nope'],
    ['a stale shape', JSON.stringify({ nodes: [{ id: 'x', kind: 'llm' }] })],
  ])('returns null for %s', (_label, raw) => {
    expect(parseStoredWorkflow(raw)).toBeNull()
  })
})
