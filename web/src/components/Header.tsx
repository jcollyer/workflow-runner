import type { SaveStatus } from '../state/useEditor.ts'

export function Header({ workflowName, saveStatus }: { workflowName: string; saveStatus: SaveStatus }) {
  return (
    <header className="header">
      <span className="header__product">Workflow Studio</span>
      <span className="header__divider" aria-hidden="true" />
      <h1 className="header__workflow">{workflowName}</h1>
      <span className="header__divider" aria-hidden="true" />
      {saveStatus === 'saved' ? (
        <span className="pill">
          <span className="pill__dot" aria-hidden="true" /> Saved locally
        </span>
      ) : (
        <span className="pill pill--warning" title="Browser storage is unavailable; changes will be lost on reload.">
          <span className="pill__dot" aria-hidden="true" /> Not saved
        </span>
      )}
    </header>
  )
}
