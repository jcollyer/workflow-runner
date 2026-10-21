import { describe, expect, test } from 'vitest'
import { Workflow } from './workflow.ts'

const valid = {
  name: 'Text processing',
  nodes: [
    { id: 'in', name: 'Input', type: 'input', position: { x: 0, y: 0 }, config: { text: 'hi' } },
    { id: 't1', name: 'Swap', type: 'transform', position: { x: 200, y: 0 }, config: { operation: 'replace', find: 'a', replaceWith: 'b' } },
    { id: 'out', name: 'Output', type: 'output', position: { x: 400, y: 0 }, config: {} },
  ],
  edges: [
    { id: 'e1', source: 'in', target: 't1' },
    { id: 'e2', source: 't1', target: 'out' },
  ],
}

const withNode = (index: number, patch: object) => ({
  ...valid,
  nodes: valid.nodes.map((node, i) => (i === index ? { ...node, ...patch } : node)),
})

describe('Workflow schema', () => {
  test('parses a well-formed workflow', () => {
    expect(Workflow.safeParse(valid).success).toBe(true)
  })

  // Drafts must survive a localStorage round trip; these are rule issues, not shape errors (DECISIONS #13).
  test('accepts draft states: empty name and empty Replace find', () => {
    const draft = withNode(1, { name: '', config: { operation: 'replace', find: '', replaceWith: '' } })
    expect(Workflow.safeParse(draft).success).toBe(true)
  })

  test.each([
    ['an unknown node type', withNode(0, { type: 'llm' })],
    ['Replace without find', withNode(1, { config: { operation: 'replace', replaceWith: 'b' } })],
    ['an unknown operation', withNode(1, { config: { operation: 'reverse' } })],
    ['a Transform carrying Input config', withNode(1, { config: { text: 'hi' } })],
    ['a name over 60 characters', withNode(0, { name: 'x'.repeat(61) })],
  ])('rejects %s', (_label, candidate) => {
    expect(Workflow.safeParse(candidate).success).toBe(false)
  })
})
