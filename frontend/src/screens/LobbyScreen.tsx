import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import type { Participant, Quiz } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { ErrorState, StaleBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { MeterBar } from '@/components/MeterBar'
import { ParticipantRow } from '@/components/ParticipantRow'
import { useSession } from '@/context/useSession'
import { usePolling } from '@/hooks/usePolling'

interface LobbyData {
  quiz: Quiz
  participants: Participant[]
}

export function LobbyScreen() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const { user } = useSession()

  const { data, error, refresh } = usePolling<LobbyData>(
    async () => {
      if (!quizId) throw new Error('no id')
      const quiz = await api.getQuiz(quizId)
      const participants = await api.getParticipants(quizId)
      return { quiz, participants }
    },
    { intervalMs: 4000 },
  )

  // countdown ring: fix the total window once when the screen opens
  const [now, setNow] = useState(() => Date.now())
  const [openedAt] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const quiz = data?.quiz
  const participants = useMemo(() => data?.participants ?? [], [data])
  const confirmed = participants.filter((p) => p.status !== 'PENDING').length
  const minRequired = quiz?.minParticipants ?? 3
  const isCreator = quiz?.creatorId === user?.id

  if (!quiz) {
    if (error) {
      return (
        <AppShell>
          <ErrorState
            title="The lobby didn't load"
            description="The room is out there — this page just couldn't reach it."
            hint="Check your connection"
            onRetry={() => void refresh()}
          />
        </AppShell>
      )
    }
    return (
      <AppShell>
        <div className="flex flex-col gap-3" role="status" aria-label="Loading lobby">
          <div className="h-40 animate-pulse rounded-card border border-line bg-paper-deep" />
          <div className="h-64 animate-pulse rounded-card border border-line bg-paper-deep" />
        </div>
      </AppShell>
    )
  }

  const isLive = quiz.status === 'LIVE'
  const startsAtMs = quiz.startsAt ? Date.parse(quiz.startsAt) : null
  const totalWindow = startsAtMs !== null ? Math.max(1, startsAtMs - openedAt) : 1
  const remainingMs = startsAtMs ? Math.max(0, startsAtMs - now) : 0
  const ringFraction = Math.min(1, remainingMs / totalWindow)

  const minutes = Math.floor(remainingMs / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1000)
  const countdownText = `${minutes}:${seconds.toString().padStart(2, '0')}`

  const readyToStart = confirmed >= minRequired
  const roomClosed = ['VALIDATING', 'ENDED', 'FINALIZED', 'SETTLED'].includes(quiz.status)

  return (
    <AppShell>
      <div className="screen">
        {error && data && <StaleBanner />}

        <header className="shrink-0 text-center">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">{quiz.title}</h1>
          <p className="mt-1 text-sm font-semibold text-ink-soft tabular-nums">
            {quiz.entryAmount} NIM stake · {quiz.questionCount} questions ·{' '}
            {Math.round(quiz.durationSeconds / 60)} min
          </p>
        </header>

        <section aria-live="polite" className="flex shrink-0 flex-col items-center gap-3 rounded-card border-2 border-ink bg-surface p-6 shadow-card">
          {roomClosed ? (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-card border-2 border-ink bg-volt text-ink" aria-hidden>
                <Icon name="podium" size={26} weight="duotone" />
              </span>
              <p className="font-display text-base font-extrabold tracking-tight text-ink">This room has closed</p>
              <Button variant="secondary" onClick={() => navigate(`/quiz/${quizId}/results`)}>
                See results
              </Button>
            </>
          ) : isLive ? (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-card border-2 border-ink bg-ink text-volt animate-pop-in" aria-hidden>
                <Icon name="lightning" size={26} weight="fill" />
              </span>
              <p className="font-display text-xl font-extrabold tracking-tight text-ink">
                Room is <span className="highlight-swipe">live</span>
              </p>
              <Button size="lg" onClick={() => navigate(`/quiz/${quizId}/play`)}>
                Enter Qest
              </Button>
            </>
          ) : (
            <>
              <CountdownRing fraction={ringFraction} label={countdownText} />
              <p className="text-xs font-semibold text-ink-muted">
                {remainingMs > 0 ? 'Room opens in' : 'Waiting to start…'}
              </p>
            </>
          )}
        </section>

        <div className="screen-scroll">
          <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
            <MeterBar
            value={confirmed}
            target={minRequired}
            max={Math.max(minRequired, confirmed + 2)}
            label="Confirmed commitments"
          />
          {readyToStart ? (
            <p className="mt-3 rounded-card border border-success/30 bg-success-soft px-4 py-2.5 text-xs font-bold text-success">
              All set — enough players are in. This Qest is happening.
            </p>
          ) : (
            <p className="mt-3 rounded-card border border-amber/30 bg-amber-soft px-4 py-2.5 text-xs leading-relaxed text-ink">
              Needs {minRequired - confirmed} more{' '}
              {minRequired - confirmed === 1 ? 'challenger' : 'challengers'}. If the room opens with
              fewer than {minRequired}, everyone is auto-refunded in full.
            </p>
          )}
        </section>

        <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
            In the room <span className="tabular-nums">({confirmed})</span>
          </h2>
          {participants.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">
              Nobody has committed yet — you're early. Share the Qest to fill the room.
            </p>
          ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {participants.map((p) => {
                  const away =
                    isLive &&
                    p.status === 'ACTIVE' &&
                    p.lastSeenAt != null &&
                    now - Date.parse(p.lastSeenAt) > 20_000
                  return (
                    <ParticipantRow
                      key={p.id}
                      participant={p}
                      isCreator={p.displayName === user?.displayName && isCreator}
                      away={away}
                    />
                  )
                })}
              </ul>
          )}
        </section>

        {isCreator && (
          <p className="rounded-card border border-amber/30 bg-amber-soft px-4 py-3 text-xs font-semibold leading-relaxed text-ink">
            You're hosting this one — you play blind, same as everyone else. The questions
            lock the moment the room opens.
          </p>
        )}

        {!isLive && !roomClosed && (
          <p className="text-center text-[11px] leading-relaxed text-ink-muted">
            Keep this page open — the room opens automatically when the countdown ends.
          </p>
        )}
        </div>
      </div>
    </AppShell>
  )
}

function CountdownRing({ fraction, label }: { fraction: number; label: string }) {
  const R = 44
  const C = 2 * Math.PI * R
  return (
    <div className="relative h-28 w-28" role="timer" aria-label={`${label} until start`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth="9" className="stroke-paper-deep" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className="stroke-ink transition-[stroke-dashoffset] duration-1000"
          style={{ strokeDasharray: C, strokeDashoffset: C * (1 - fraction) }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-xl font-extrabold tabular-nums text-ink">
        {label}
      </span>
    </div>
  )
}
