import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import type { Quiz } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState, StaleBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { QuizCard } from '@/components/QuizCard'
import { SkeletonList } from '@/components/Skeleton'
import { useSession } from '@/context/useSession'
import { getStreak } from '@/lib/streak'
import { usePolling } from '@/hooks/usePolling'

type Filter = 'ALL' | 'OPEN' | 'LIVE' | 'VALIDATING' | 'SETTLED'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'OPEN', label: 'Open' },
  { id: 'LIVE', label: 'Live' },
  { id: 'VALIDATING', label: 'Validating' },
  { id: 'SETTLED', label: 'Settled' },
]

const EMPTY_TITLES: Record<Filter, string> = {
  ALL: 'No Qests yet',
  OPEN: 'Nothing open to join right now',
  LIVE: 'No live Qests right now',
  VALIDATING: 'Nothing in validation right now',
  SETTLED: 'No settled Qests yet',
}

/** Sort: joinable first (OPEN, then LIVE), then by soonest start, rest after */
function sortQuizzes(quizzes: Quiz[]): Quiz[] {
  const weight = (q: Quiz) => {
    if (q.status === 'OPEN') return 0
    if (q.status === 'LIVE') return 1
    if (q.status === 'VALIDATING' || q.status === 'ENDED' || q.status === 'FINALIZED') return 2
    return 3
  }
  return [...quizzes].sort((a, b) => {
    const w = weight(a) - weight(b)
    if (w !== 0) return w
    const at = a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY
    const bt = b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY
    return at - bt
  })
}

const MODE_LABEL: Record<string, string> = {
  commitment: 'Commitment mode',
  practice: 'Practice mode',
  demo: 'Demo mode',
}

export function HomeScreen() {
  const { user, mode } = useSession()
  const [filter, setFilter] = useState<Filter>('ALL')
  const streak = getStreak()

  const { data: quizzes, error, refresh } = usePolling<Quiz[]>(() => api.listQuizzes(), {
    intervalMs: 6000,
  })

  const filtered = useMemo(() => {
    const list = quizzes ?? []
    const sorted = sortQuizzes(list)
    if (filter === 'ALL') return sorted
    if (filter === 'VALIDATING') {
      return sorted.filter((q) => q.status === 'VALIDATING' || q.status === 'ENDED' || q.status === 'FINALIZED')
    }
    return sorted.filter((q) => q.status === filter)
  }, [quizzes, filter])

  return (
    <AppShell>
      <div className="screen">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="w-fit rounded-pill bg-paper-deep px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
              {MODE_LABEL[mode] ?? 'Demo mode'}
            </p>
            <h1 className="mt-1.5 truncate font-display text-[1.7rem] font-extrabold tracking-tight text-ink">
              {greeting()}, {user?.displayName.split(' ')[0]}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {streak > 0 && (
              <span
                className="flex min-h-11 items-center gap-1 rounded-pill border-2 border-ink bg-volt px-3 font-display text-sm font-extrabold tabular-nums text-ink"
                title="Daily study streak"
              >
                <Icon name="flame" size={16} weight="fill" />
                {streak}
              </span>
            )}
            <Link
              to="/profile"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-pill border-2 border-ink bg-volt font-display text-base font-extrabold text-ink transition-colors hover:bg-volt-deep"
              aria-label="Your profile"
            >
              {user?.displayName.charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>

        <section className="shrink-0 rounded-card border-2 border-ink bg-ink p-[clamp(0.875rem,2.6svh,1.25rem)] text-paper shadow-press">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card border-2 border-ink bg-volt text-ink" aria-hidden>
              <Icon name="lock" size={22} weight="fill" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold tracking-tight text-paper">
                Which Qest will you enter?
              </h2>
              <p className="mt-1 max-w-[34ch] text-sm leading-relaxed text-paper/70">
                Pick a challenge, trust your prep, and make every answer count.
              </p>
            </div>
          </div>
        </section>

        <div
          className="no-scrollbar -mx-5 flex shrink-0 gap-2 overflow-x-auto px-5"
          role="group"
          aria-label="Filter Qests by status"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`min-h-10 shrink-0 cursor-pointer rounded-pill border-2 px-4 py-1.5 font-display text-[13px] font-bold tracking-tight transition-colors ${
                filter === f.id
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-surface text-ink-soft hover:border-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="screen-scroll">
          {error && !quizzes ? (
            <ErrorState
              title="Can't reach the Qests"
              description="The list didn't load — your Qests are safe."
              hint="Check your connection"
              onRetry={() => void refresh()}
            />
          ) : filtered.length === 0 ? (
            quizzes === null ? (
              <SkeletonList count={3} className="h-32" />
            ) : (
              <EmptyState
                icon={<Icon name="podium" size={26} weight="duotone" />}
                title={EMPTY_TITLES[filter]}
                description="Be the first — turn your study material into a Qest."
                action={
                  <Link to="/create">
                    <Button size="sm">Create a Qest</Button>
                  </Link>
                }
              />
            )
          ) : (
            <>
              {error && quizzes && <StaleBanner />}
              {filtered.map((quiz) => (
                <QuizCard key={quiz.id} quiz={quiz} />
              ))}
            </>
          )}
        </div>

        <div className="screen-footer">
          <Link
            to="/create"
            className="press flex min-h-12 items-center justify-center gap-2 rounded-pill border-2 border-ink bg-volt px-5 font-display text-sm font-extrabold tracking-tight text-ink shadow-press hover:bg-volt-deep"
          >
            <Icon name="plus" size={17} weight="bold" />
            Create a Qest
          </Link>
        </div>
      </div>
    </AppShell>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
