import type { Participant, ParticipantStatus } from '@/api/types'

const STATUS_DOTS: Record<ParticipantStatus, string> = {
  PENDING: 'bg-amber',
  JOINED: 'bg-ink-muted',
  ACTIVE: 'bg-danger',
  COMPLETED: 'bg-success',
  TIMED_OUT: 'bg-amber',
  FORFEITED: 'bg-ink-muted',
  DISQUALIFIED: 'bg-ink-muted',
}

interface ParticipantRowProps {
  participant: Participant
  isCreator?: boolean
  away?: boolean
}

export function ParticipantRow({ participant, isCreator, away }: ParticipantRowProps) {
  const dotClass = away ? 'bg-amber' : STATUS_DOTS[participant.status]
  const statusLabel = away
    ? 'away'
    : participant.status.toLowerCase().replace('_', ' ')
  return (
    <li className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-pill ${dotClass}`}
        title={statusLabel}
        aria-hidden
      />
      <span className="truncate font-display text-sm font-bold text-ink">
        {participant.displayName}
      </span>
      {isCreator && (
        <span className="rounded-pill border border-ink bg-volt px-2 py-0.5 text-[10px] font-bold tracking-wide text-ink uppercase">
          Host
        </span>
      )}
      <span className="ml-auto text-xs font-semibold text-ink-muted capitalize">
        {statusLabel}
      </span>
      {participant.rank && (
        <span className="font-display text-xs font-extrabold text-ink-soft">#{participant.rank}</span>
      )}
    </li>
  )
}
