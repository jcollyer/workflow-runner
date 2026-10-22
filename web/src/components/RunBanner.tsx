import { X } from 'lucide-react'
import type { RunState } from '../state/run.ts'

/** Persistent canvas banner for a run that could not start. */
export function RunBanner({ run, onDismiss }: { run: RunState; onDismiss: () => void }) {
  if (run.phase !== 'idle' || !run.startError) return null
  const { message, issues } = run.startError

  return (
    <div className="canvas__banner" role="alert">
      <div>
        <strong>Couldn’t start the run.</strong> {message}
        {issues.length > 0 && (
          <ul>
            {issues.map((issue) => (
              <li key={`${issue.code}-${issue.nodeId ?? issue.edgeId ?? ''}`}>{issue.message}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
