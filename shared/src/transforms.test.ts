import { describe, expect, test } from 'vitest'
import { applyTransform } from './transforms.ts'

describe('applyTransform', () => {
  test('uppercase and lowercase', () => {
    expect(applyTransform({ operation: 'uppercase' }, 'Hello, World')).toBe('HELLO, WORLD')
    expect(applyTransform({ operation: 'lowercase' }, 'Hello, World')).toBe('hello, world')
  })

  test('normalize trims ends and collapses whitespace runs, including newlines', () => {
    expect(applyTransform({ operation: 'normalize' }, '  hello \n\t  world  ')).toBe('hello world')
    expect(applyTransform({ operation: 'normalize' }, ' \n ')).toBe('')
  })

  describe('replace', () => {
    const replace = (find: string, replaceWith: string, text: string) =>
      applyTransform({ operation: 'replace', find, replaceWith }, text)

    test('replaces every occurrence, case-sensitively', () => {
      expect(replace('cat', 'dog', 'cat Cat cat')).toBe('dog Cat dog')
    })

    test('treats find and replacement literally', () => {
      expect(replace('.', '!', 'a.b.c')).toBe('a!b!c')
      expect(replace('b', '$&$&', 'abc')).toBe('a$&$&c')
    })

    test('an empty replacement deletes matches', () => {
      expect(replace(' ', '', 'a b c')).toBe('abc')
    })

    test('an empty find is a no-op', () => {
      expect(replace('', 'x', 'abc')).toBe('abc')
    })
  })
})
