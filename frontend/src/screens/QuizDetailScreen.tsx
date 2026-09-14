import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api'
import type { Participant, Quiz } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { ErrorState, StaleBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { MeterBar } from '@/components/MeterBar'
import { StatusPill } from '@/components/StatusPill'
import { TimerPill } from '@/components/TimerPill'
import { useSession } from '@/context/useSession'
import { usePolling } from '@/hooks/usePolling'

interface QuizDetailData {
  quiz: Quiz
  participants: Participant[]
}

export function QuizDetailScreen() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const { user } = useSession()

  const { data, error, refresh } = usePolling<QuizDetailData>(
    async () => {
      if (!quizId) throw new Error('Missing quiz id')
      const quiz = await api.getQuiz(quizId)
      const participants = await api.getParticipants(quizId)
      return { quiz, participants }
    },
    { intervalMs: 6000 },
  )

  const quiz = data?.quiz
  const participants = useMemo(() => data?.participants ?? [], [data])
  const confirmed = participants.filter((p) => p.status !== 'PENDING').length
  const joined = useMemo(
    () => participants.some((p) => p.displayName === user?.displayName),
    [participants, user?.displayName],
  )

  if (error && !quiz) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <AppShell>
        {notFound ? (
          <ErrorState
            title="Qest not found"
            description="It may have been removed by its creator."
            action={
              <Button size="sm" onClick={() => navigate('/home')}>
                Back to Home
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="This Qest didn't load"
            description="It's out there — the page just couldn't reach it."
            hint="Check your connection"
            onRetry={() => void refresh()}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/home')}>
                Back to Home
              </Button>
            }
          />
        )}
      </AppShell>
    )
  }

  if (!quiz) {
    return (
      <AppShell>
        <div role="status" aria-label="Loading Qest">
          <div className="h-72 animate-pulse rounded-card border border-line bg-paper-deep" />
        </div>
      </AppShell>
    )
  }

  const isCreator = quiz.creatorId === user?.id
  const minRequired = quiz.minParticipants ?? 3

  return (
    <AppShell>
      <div className="screen">
        {error && data && <StaleBanner />}

        <div className="screen-scroll">
        <Link to="/home" className="inline-flex min-h-11 shrink-0 items-center gap-2 font-display text-sm font-bold text-ink-muted transition-colors hover:text-ink">
          <Icon name="arrow-left" size={17} weight="bold" /> All Qests
        </Link>

        <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{quiz.title}</h1>
            <StatusPill status={quiz.status} />
          </div>
          {quiz.description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{quiz.description}</p>
          )}

          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-card border border-ink bg-volt-faint px-2 py-3">
              <dt className="text-[11px] font-semibold text-ink-muted">Stake</dt>
              <dd className="font-display text-base font-extrabold tabular-nums text-ink">
                {quiz.entryAmount} NIM
              </dd>
            </div>
            <div className="rounded-card border border-ink bg-volt-faint px-2 py-3">
              <dt className="text-[11px] font-semibold text-ink-muted">Questions</dt>
              <dd className="font-display text-base font-extrabold tabular-nums text-ink">
                {quiz.questionCount}
              </dd>
            </div>
            <div className="rounded-card border border-ink bg-volt-faint px-2 py-3">
              <dt className="text-[11px] font-semibold text-ink-muted">Duration</dt>
              <dd className="font-display text-base font-extrabold tabular-nums text-ink">
                {Math.round(quiz.durationSeconds / 60)} min
              </dd>
            </div>
          </dl>

          {quiz.startsAt && isUpcoming(quiz.startsAt) && quiz.status === 'OPEN' && (
            <div className="mt-4 flex items-center justify-between rounded-card border border-amber/30 bg-amber-soft px-4 py-3">
              <span className="text-xs font-bold text-ink">Starts in</span>
              <TimerPill until={new Date(quiz.startsAt)} warnUnderSeconds={60} />
            </div>
          )}
        </section>

        <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
            The pot
          </h2>
          <p className="mt-1 font-display text-3xl font-extrabold tracking-tight tabular-nums text-ink">
            {(quiz.entryAmount * Math.max(confirmed, 1)).toLocaleString()} NIM
            <span className="ml-2 font-body text-xs font-semibold text-ink-muted">
              if {Math.max(confirmed, minRequired)} Challengers commit
            </span>
          </p>
          <div className="mt-3">
            <MeterBar
              value={confirmed}
              target={minRequired}
              max={Math.max(minRequired, confirmed + 2)}
              label="Confirmed commitments"
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
            Needs {minRequired} players to run. Fewer than that and everyone is auto-refunded.
            Top 3 split the pot 50 / 30 / 10; everyone else gets 80% back.
          </p>
        </section>

        {participants.length > 0 && (
          <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
            <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
              Challengers <span className="tabular-nums">({participants.length})</span>
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="rounded-pill border border-ink bg-volt-faint px-3 py-1.5 text-xs font-bold text-ink"
                >
                  {p.displayName}
                </li>
              ))}
            </ul>
          </section>
        )}

        {isCreator && (
          <p className="rounded-card border border-amber/30 bg-amber-soft px-4 py-3 text-xs font-semibold leading-relaxed text-ink">
            You created this Qest — you play blind, same as everyone else. You never see the
            questions before the room opens.
          </p>
        )}

        </div>

        <div className="screen-footer">
          {joined ? (
            <Button size="lg" block onClick={() => navigate(`/quiz/${quizId}/lobby`)}>
              {quiz.status === 'LIVE' ? 'Return to the Qest' : 'Go to lobby'}
            </Button>
          ) : quiz.status === 'OPEN' ? (
            <Button size="lg" block onClick={() => navigate(`/quiz/${quizId}/commit`)}>
              <Icon name="lock" size={18} weight="fill" />
              Commit {quiz.entryAmount} NIM
            </Button>
          ) : quiz.status === 'LIVE' ? (
            <Button size="lg" block disabled>
              Already live — join earlier next time
            </Button>
          ) : quiz.status === 'VALIDATING' || quiz.status === 'ENDED' || quiz.status === 'FINALIZED' || quiz.status === 'SETTLED' ? (
            <Button size="lg" block variant="secondary" onClick={() => navigate(`/quiz/${quizId}/results`)}>
              See results
            </Button>
          ) : (
            <Button size="lg" block disabled>
              Not open for entries
            </Button>
          )}
        </div>
      </div>
    </AppShell>
  )
}

function isUpcoming(iso: string): boolean {
  return Date.parse(iso) > Date.now()
}
