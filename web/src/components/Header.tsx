import { countStatuses, isEditingLocked, isPending, isRunSettled, type RunState } from '../state/run.ts'
import type { SaveStatus } from '../state/useEditor.ts'
import { RUN_STATUS_LABELS } from './runLabels.ts'

interface HeaderProps {
  workflowName: string
  saveStatus: SaveStatus
  run: RunState
  issueCount: number
  onRun: () => void
  onCancel: () => void
}

function StatusPill({ run, saveStatus }: { run: RunState; saveStatus: SaveStatus }) {
  if (isPending(run)) {
    return (
      <span className="pill pill--pending" role="status">
        <span className="pill__dot" aria-hidden="true" /> Pending
      </span>
    )
  }

  if (run.phase === 'active' && run.snapshot) {
    const { settled, total } = countStatuses(run.snapshot)
    const status = run.snapshot.status
    const lost = run.connection === 'lost' && !isRunSettled(run)
    return (
      <span className={`pill pill--run-${lost ? 'lost' : status}`} role="status">
        <span className="pill__dot" aria-hidden="true" />
        {lost ? 'Connection lost' : RUN_STATUS_LABELS[status]}
        <span className="pill__detail">
          {settled} of {total} completed
          {run.connection === 'reconnecting' && ' · reconnecting…'}
        </span>
      </span>
    )
  }

  return saveStatus === 'saved' ? (
    <span className="pill">
      <span className="pill__dot" aria-hidden="true" /> Saved locally
    </span>
  ) : (
    <span className="pill pill--warning" title="Browser storage is unavailable; changes will be lost on reload.">
      <span className="pill__dot" aria-hidden="true" /> Not saved
    </span>
  )
}

export function Header({ workflowName, saveStatus, run, issueCount, onRun, onCancel }: HeaderProps) {
  const inFlight = isEditingLocked(run)
  const cancelling = run.phase === 'active' && run.cancelling

  return (
    <header className="header">
      <span className="header__product">Workflow Studio</span>
      <span className="header__divider" aria-hidden="true" />
      <h1 className="header__workflow">{workflowName}</h1>
      <span className="header__divider" aria-hidden="true" />
      <StatusPill run={run} saveStatus={saveStatus} />

      <div className="header__actions">
        {inFlight ? (
          // No run ID exists while starting, so Cancel stays disabled until the run is accepted (DECISIONS #12).
          <button
            type="button"
            className="button button--danger"
            disabled={run.phase === 'starting' || cancelling}
            onClick={onCancel}
          >
            {cancelling ? 'Cancelling…' : 'Cancel run'}
          </button>
        ) : (
          <button
            type="button"
            className="button"
            disabled={issueCount > 0}
            title={issueCount > 0 ? `Fix ${issueCount} ${issueCount === 1 ? 'issue' : 'issues'} before running` : undefined}
            onClick={onRun}
          >
            Run
          </button>
        )}
      </div>
    </header>
  )
}
