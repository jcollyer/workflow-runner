import { Ban, Check, CircleAlert, Clock, FileOutput, FilePlus, LoaderCircle, SkipForward, Zap, type LucideIcon } from 'lucide-react'
import type { NodeRunStatus, NodeType } from '@wand/shared'
import { TYPE_LABELS } from './flowTypes.ts'

const TYPE_ICONS: Record<NodeType, LucideIcon> = {
  input: FilePlus,
  transform: Zap,
  output: FileOutput,
}

const STATUS_ICONS: Record<NodeRunStatus, LucideIcon> = {
  queued: Clock,
  running: LoaderCircle,
  succeeded: Check,
  failed: CircleAlert,
  skipped: SkipForward,
  cancelled: Ban,
}

export function NodeTypeIcon({ type, size = 16 }: { type: NodeType; size?: number }) {
  const Icon = TYPE_ICONS[type]
  return <Icon size={size} aria-label={TYPE_LABELS[type]} className="type-icon" />
}

/**
 * Decorative: always rendered next to the status label. Running spins (disabled for reduced
 * motion) unless `spinning` says otherwise, e.g. a "Running: 0" count after a run settles.
 */
export function StatusIcon({
  status,
  size = 14,
  spinning = status === 'running',
}: {
  status: NodeRunStatus
  size?: number
  spinning?: boolean
}) {
  const Icon = STATUS_ICONS[status]
  return <Icon size={size} aria-hidden="true" className={spinning ? 'status-icon spin' : 'status-icon'} />
}
