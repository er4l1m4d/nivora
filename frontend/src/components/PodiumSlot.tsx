import type { ResultRow } from '@/api/types'
import { Icon } from './Icon'

interface PodiumSlotProps {
  /** 1, 2 or 3 — determines podium height and medal */
  place: 1 | 2 | 3
  row: ResultRow | null
}

const MEDALS: Record<1 | 2 | 3, { label: string; block: string; iconBox: string; delay: string }> = {
  1: { label: '1st', block: 'bg-volt', iconBox: 'border-ink bg-volt text-ink', delay: '200ms' },
  2: { label: '2nd', block: 'bg-ink', iconBox: 'border-ink bg-ink text-volt', delay: '100ms' },
  3: { label: '3rd', block: 'bg-paper-deep', iconBox: 'border-line bg-surface text-ink-soft', delay: '0ms' },
}

const HEIGHTS: Record<1 | 2 | 3, string> = {
  1: 'h-[clamp(3rem,9svh,6rem)]',
  2: 'h-[clamp(2.25rem,6.5svh,4rem)]',
  3: 'h-[clamp(1.75rem,5svh,3rem)]',
}

export function PodiumSlot({ place, row }: PodiumSlotProps) {
  const medal = MEDALS[place]
  const displayPlace = place === 1 ? 'order-2' : place === 2 ? 'order-1' : 'order-3'

  return (
    <div className={`flex flex-1 flex-col items-center justify-end gap-2 ${displayPlace}`}>
      <div className="text-center animate-rise" style={{ animationDelay: medal.delay }} aria-label={`${medal.label} place`}>
        <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-pill border-2 ${medal.iconBox}`} aria-hidden>
          <Icon name="trophy" size={19} weight="bold" />
        </div>
        {row ? (
          <>
            <p className="mt-1 max-w-24 truncate font-display text-sm font-extrabold text-ink">
              {row.displayName}
            </p>
            <p className="text-xs font-semibold text-ink-soft">
              {row.correctAnswers}/{row.totalQuestions}
            </p>
            <p className="font-display text-sm font-extrabold text-success">
              +{(row.payout - row.entryAmount).toFixed(2)} NIM
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs font-semibold text-ink-muted">Unclaimed</p>
        )}
      </div>
      <div
        className={`w-full max-w-28 rounded-t-card border-2 border-b-0 border-ink ${HEIGHTS[place]} ${medal.block} animate-rise`}
        style={{ animationDelay: medal.delay }}
        aria-hidden
      />
    </div>
  )
}
