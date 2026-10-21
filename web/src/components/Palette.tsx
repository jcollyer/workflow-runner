import { NodeType } from '@wand/shared'
import { TYPE_LABELS } from './flowTypes.ts'

const HINTS: Record<NodeType, string> = {
  input: 'Text to process',
  transform: 'Change the text',
  output: 'Collect a result',
}

export function Palette({ onAdd, disabled }: { onAdd: (type: NodeType) => void; disabled: boolean }) {
  return (
    <nav className="palette" aria-label="Add nodes">
      <h2 className="palette__heading">Add node</h2>
      {NodeType.options.map((type) => (
        <button
          key={type}
          type="button"
          className={`palette__item palette__item--${type}`}
          disabled={disabled}
          onClick={() => onAdd(type)}
        >
          <span className="palette__label">{TYPE_LABELS[type]}</span>
          <span className="palette__hint">{HINTS[type]}</span>
        </button>
      ))}
      {disabled && <p className="palette__locked">Editing is locked while the workflow runs.</p>}
    </nav>
  )
}
