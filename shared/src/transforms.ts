import type { TransformConfig } from './workflow.ts'

/** Pure text operations behind the Transform node. Total: never throws. */
export function applyTransform(config: TransformConfig, text: string): string {
  switch (config.operation) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'normalize':
      // Trim the ends and collapse every whitespace run (including newlines) to one space.
      return text.trim().replace(/\s+/g, ' ')
    case 'replace':
      // Literal, case-sensitive, all occurrences. split/join avoids String.replace's
      // `$&`-style substitution patterns in the replacement. An empty `find` is a
      // validation issue; here it is a no-op rather than inserting between every char.
      return config.find === '' ? text : text.split(config.find).join(config.replaceWith)
  }
}

const DESCRIPTIONS: Record<TransformConfig['operation'], string> = {
  uppercase: 'Convert to uppercase',
  lowercase: 'Convert to lowercase',
  normalize: 'Trim and collapse whitespace',
  replace: 'Replace text',
}

export function describeTransform(config: TransformConfig): string {
  return DESCRIPTIONS[config.operation]
}
