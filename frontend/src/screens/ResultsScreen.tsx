import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api'
import type { Quiz, QuizResults, ResultRow, QuizStatus } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState, StaleBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { PodiumSlot } from '@/components/PodiumSlot'
import { Skeleton } from '@/components/Skeleton'
import { StatusPill } from '@/components/StatusPill'
import { useSession } from '@/context/useSession'
import { usePolling } from '@/hooks/usePolling'

interface ResultsData {
  quiz: Quiz
  results: QuizResults | null
}

const STEPPER: ReadonlyArray<{ status: QuizStatus; label: string; hint: string }> = [
  { status: 'VALIDATING', label: 'Validating', hint: 'Dispute window — results can still change' },
  { status: 'FINALIZED', label: 'Finalized', hint: 'Scores are locked in' },
  { status: 'SETTLED', label: 'Settled', hint: 'Payouts are on their way' },
]

const PAYOUT_LABELS: Record<ResultRow['payoutKind'], string> = {
  winner: 'Winner',
  consolation: '80% back',
  refund: '50% back',
  bonus: 'Bonus',
  none: '—',
}

export function ResultsScreen() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const { user } = useSession()

  const { data, error, refresh } = usePolling<ResultsData>(
    async () => {
      if (!quizId) throw new Error('Missing quiz id')
      const quiz = await api.getQuiz(quizId)
      const results = await api.getResults(quizId).catch(() => null)
      return { quiz, results }
    },
    { intervalMs: 5000 },
  )

  if (error && !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <AppShell>
        {notFound ? (
          <EmptyState
            icon={<Icon name="alert" size={28} weight="duotone" />}
            title="Qest not found"
            description="It may have been removed."
            action={
              <Link to="/home">
                <Button size="sm">Back to Home</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState
            title="Results didn't load"
            description="The Qest exists — this page just couldn't reach it."
            hint="Check your connection"
            onRetry={() => void refresh()}
            action={
              <Link to="/home">
                <Button variant="ghost" size="sm">Back to Home</Button>
              </Link>
            }
          />
        )}
      </AppShell>
    )
  }

  const quiz = data?.quiz
  if (!quiz) {
    return (
      <AppShell>
        <div className="flex flex-col gap-3" role="status" aria-label="Loading results">
          <Skeleton className="h-28" />
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      </AppShell>
    )
  }

  const results = data?.results ?? null
  const rows = results?.rows ?? []
  const podium = rows.slice(0, 3)
  const myRow = rows.find((r) => r.displayName === user?.displayName)

  return (
    <AppShell>
      <div className="screen">
        {error && data && (
          <div className="shrink-0">
            <StaleBanner />
          </div>
        )}

        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{quiz.title}</h1>
            <p className="mt-0.5 text-xs font-semibold text-ink-soft tabular-nums">
              {quiz.entryAmount} NIM stake · {quiz.questionCount} questions
            </p>
          </div>
          <StatusPill status={quiz.status} />
        </header>

        <div className="shrink-0">
          <StatusStepper current={quiz.status} />
        </div>

        {results === null ? (
          <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-card border-2 border-ink bg-surface p-8 text-center shadow-card">
            <div className="flex h-12 w-12 items-center justify-center rounded-pill bg-volt-faint text-ink" aria-hidden>
              <Icon name="refresh" size={22} className="animate-spin" />
            </div>
            <h2 className="font-display text-lg font-extrabold tracking-tight text-ink">
              {quiz.status === 'LIVE' ? 'Still in play…' : 'Calculating results…'}
            </h2>
            <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
              Results unlock the moment everyone finishes or the clock runs out. This page
              updates automatically.
            </p>
          </section>
        ) : (
          <>
            {myRow && (
              <section
                className={`shrink-0 rounded-card border-2 p-[clamp(0.625rem,2.2svh,1.25rem)] text-center ${
                  myRow.payoutKind === 'winner'
                    ? 'border-ink bg-volt shadow-press-sm'
                    : 'border-ink bg-surface shadow-card'
                }`}
                aria-label="Your result"
              >
                <p className="font-display text-sm font-bold text-ink-soft">
                  {myRow.rank >= 98
                    ? "You didn't finish"
                    : `You finished ${ordinal(myRow.rank)}`}
                </p>
                <p className="mt-1 font-display text-[clamp(1.6rem,6svh,2.25rem)] font-extrabold tracking-tight tabular-nums text-ink">
                  {myRow.correctAnswers}/{myRow.totalQuestions}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink-soft">
                  {myRow.payout >= myRow.entryAmount ? (
                    <>
                      <span className="font-display font-extrabold text-success">
                        {myRow.payout.toFixed(2)} NIM back
                      </span>
                      {myRow.payout > myRow.entryAmount && (
                        <span className="font-display font-extrabold text-success">
                          {' '}
                          (+{(myRow.payout - myRow.entryAmount).toFixed(2)} won)
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="font-display font-extrabold text-danger">
                      {myRow.payout.toFixed(2)} NIM back (−
                      {(myRow.entryAmount - myRow.payout).toFixed(2)})
                    </span>
                  )}
                </p>
              </section>
            )}

            <section className="shrink-0 rounded-card border-2 border-ink bg-surface p-[clamp(0.625rem,2.2svh,1.25rem)] shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
                  The podium
                </h2>
                <span className="rounded-pill border border-ink bg-volt px-3 py-1 font-display text-xs font-extrabold tabular-nums text-ink">
                  {results.prizePool.toFixed(2)} NIM pot
                </span>
              </div>
              <div className="mt-[clamp(0.5rem,1.8svh,1rem)] flex items-end gap-2">
                <PodiumSlot place={2} row={podium[1] ?? null} />
                <PodiumSlot place={1} row={podium[0] ?? null} />
                <PodiumSlot place={3} row={podium[2] ?? null} />
              </div>
              <p className="mt-[clamp(0.375rem,1.2svh,0.75rem)] text-center text-[11px] text-ink-muted">
                Top 3 split the pot 50 / 30 / 10 — ties share a rank's cut
              </p>
            </section>

            <section className="flex min-h-0 flex-1 flex-col rounded-card border-2 border-ink bg-surface p-[clamp(0.625rem,2.2svh,1.25rem)] shadow-card">
              <h2 className="shrink-0 font-display text-base font-extrabold tracking-tight text-ink">
                Standing
              </h2>
              <ol className="screen-scroll mt-[clamp(0.375rem,1.2svh,0.75rem)]">
                {rows.map((row) => {
                  const isMe = row.displayName === user?.displayName
                  const tied = rows.filter((r) => r.rank === row.rank).length > 1
                  return (
                    <li
                      key={row.participantId}
                      className={`flex items-center gap-3 rounded-card px-4 py-3 ${
                        isMe ? 'border-2 border-ink bg-volt-faint' : 'border border-line bg-paper'
                      }`}
                    >
                      <span className="w-8 font-display text-sm font-extrabold tabular-nums text-ink-muted">
                        {row.rank <= 3 ? <Icon name="trophy" size={18} weight="fill" className="text-ink" /> : row.rank >= 98 ? '—' : `#${row.rank}`}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-bold text-ink">
                          {row.displayName}
                          {isMe && <span className="ml-1.5 text-[11px] font-semibold text-ink-soft">(you)</span>}
                        </span>
                        <span className="text-xs text-ink-soft tabular-nums">
                          {row.correctAnswers}/{row.totalQuestions} correct
                          {tied && <span className="ml-1.5 font-bold text-amber">· tied</span>}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-display text-sm font-extrabold tabular-nums text-ink">
                          {row.payout.toFixed(2)}
                        </span>
                        <span className="text-[10px] font-bold text-ink-muted">
                          {PAYOUT_LABELS[row.payoutKind]}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          </>
        )}

        <div className="screen-footer">
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              variant={results ? 'primary' : 'secondary'}
              disabled={results === null}
              onClick={() => navigate(quizId ? `/quiz/${quizId}/review` : '/home')}
            >
              Review your answers
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/home')}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function StatusStepper({ current }: { current: QuizStatus }) {
  const activeIdx = STEPPER.findIndex((s) => s.status === current)
  return (
    <ol className="flex items-center justify-between rounded-card border-2 border-ink bg-surface px-5 py-4 shadow-card">
      {STEPPER.map((step, i) => {
        const state = activeIdx === -1 ? 'todo' : i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'todo'
        return (
          <li key={step.status} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-pill border-2 font-display text-xs font-extrabold ${
                  state === 'done'
                    ? 'border-ink bg-ink text-paper'
                    : state === 'active'
                      ? 'border-ink bg-volt text-ink'
                      : 'border-line bg-paper text-ink-muted'
                }`}
              >
                {state === 'done' ? <Icon name="check" size={14} weight="bold" /> : i + 1}
              </span>
              <span
                className={`text-xs font-bold ${state === 'active' ? 'text-ink' : 'text-ink-muted'}`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPPER.length - 1 && (
              <span className="mx-2 h-0.5 flex-1 rounded-full bg-line" aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0])
}
