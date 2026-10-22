import { NodeType } from '@wand/shared'
import { TYPE_LABELS } from './flowTypes.ts'
import { NodeTypeIcon } from './icons.tsx'

export function Palette({ onAdd, disabled }: { onAdd: (type: NodeType) => void; disabled: boolean }) {
  return (
    <nav className="palette" aria-label="Add nodes">
      <h2 className="palette__heading">Add node</h2>
      {NodeType.options.map((type) => (
        <button key={type} type="button" className="palette__item" disabled={disabled} onClick={() => onAdd(type)}>
          <NodeTypeIcon type={type} />
          <span className="palette__label">{TYPE_LABELS[type]}</span>
        </button>
      ))}
      {disabled && <p className="palette__locked">Editing is locked while the workflow runs.</p>}
    </nav>
  )
}
