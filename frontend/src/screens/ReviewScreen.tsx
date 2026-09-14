import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api'
import type { ReviewQuestion } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState, StaleBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { OptionButton } from '@/components/OptionButton'
import { SkeletonList } from '@/components/Skeleton'
import { useSession } from '@/context/useSession'
import { usePolling } from '@/hooks/usePolling'

export function ReviewScreen() {
  const { quizId } = useParams<{ quizId: string }>()
  const { user } = useSession()

  const { data: review, error, refresh } = usePolling<ReviewQuestion[]>(
    () => (quizId && user ? api.getReview(quizId, user.id) : Promise.reject(new Error('no session'))),
    { intervalMs: 8000 },
  )

  if (error && !review) {
    // 409 = answers sealed until validation ends; anything else = transient
    const locked = error instanceof ApiError && error.status === 409
    return (
      <AppShell>
        {locked ? (
          <EmptyState
            icon={<Icon name="lock" size={28} weight="duotone" />}
            title="Review unlocks when the Qest ends"
            description="Answers stay sealed until everyone finishes and results are validated."
            action={
              <Link to={quizId ? `/quiz/${quizId}` : '/home'}>
                <Button size="sm">Back to the Qest</Button>
              </Link>
            }
          />
        ) : (
          <ErrorState
            title="Review didn't load"
            description={
              user
                ? "Either you didn't take part in this Qest, or the page just couldn't reach it."
                : 'Your session expired — sign in again to see your review.'
            }
            hint="Check your connection"
            onRetry={() => void refresh()}
            action={
              <Link to={quizId ? `/quiz/${quizId}/results` : '/home'}>
                <Button variant="ghost" size="sm">Back to results</Button>
              </Link>
            }
          />
        )}
      </AppShell>
    )
  }

  if (!review) {
    return (
      <AppShell>
        <SkeletonList count={3} className="h-44" />
      </AppShell>
    )
  }

  const answered = review.filter((q) => q.myAnswer !== null)
  const correctCount = review.filter((q) => q.wasCorrect === true).length
  const pct = review.length > 0 ? Math.round((correctCount / review.length) * 100) : 0

  return (
    <AppShell>
      <div className="screen">
        {error && review && <StaleBanner />}

        <header className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
              Rev<span className="highlight">iew</span>
            </h1>
            <p className="mt-0.5 text-sm font-semibold text-ink-soft tabular-nums">
              {correctCount}/{review.length} correct · {pct}%
            </p>
          </div>
          <Link
            to={quizId ? `/quiz/${quizId}/results` : '/home'}
            className="inline-flex min-h-11 items-center gap-1 px-1 font-display text-sm font-bold text-ink transition-colors hover:text-ink-soft"
          >
            Results <Icon name="arrow-right" size={15} weight="bold" />
          </Link>
        </header>

        {answered.length === 0 && (
          <p className="shrink-0 rounded-card border border-amber/30 bg-amber-soft px-4 py-3 text-sm font-semibold text-ink" role="status">
            You didn't answer any questions in this Qest — here's what was asked.
          </p>
        )}

        <div className="screen-scroll">
          {review.map((q, i) => (
            <ReviewCard key={q.id} question={q} index={i + 1} />
          ))}
        </div>

        <div className="screen-footer">
          <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
            Back
          </Button>
        </div>
      </div>
    </AppShell>
  )
}

function ReviewCard({ question: q, index }: { question: ReviewQuestion; index: number }) {
  return (
    <article className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
      <header className="flex items-center justify-between">
        <span className="font-display text-xs font-bold text-ink-muted tabular-nums">
          Question {index}
        </span>
        {q.wasCorrect !== null && (
          <span
            className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11px] font-bold ${
              q.wasCorrect ? 'border-success/40 bg-success-soft text-success' : 'border-danger/40 bg-danger-soft text-danger'
            }`}
          >
            <Icon name={q.wasCorrect ? 'check' : 'x'} size={11} weight="bold" />
            {q.wasCorrect ? 'Correct' : 'Missed'}
          </span>
        )}
      </header>

      <h2 className="mt-3 font-display text-base leading-snug font-extrabold tracking-tight text-ink">
        {q.questionText}
      </h2>

      <div className="mt-4 flex flex-col gap-2">
        {q.options.map((opt) => {
          let reveal: 'correct' | 'wrong' | 'missed' | undefined
          if (opt.key === q.correctOption) {
            reveal = 'correct'
          } else if (q.myAnswer === opt.key) {
            reveal = 'wrong'
          } else {
            reveal = 'missed'
          }
          return (
            <OptionButton
              key={opt.key}
              optionKey={opt.key}
              text={opt.text}
              selected={q.myAnswer === opt.key}
              reveal={reveal}
              disabled
              onSelect={() => {}}
            />
          )
        })}
      </div>

      {q.myAnswer && q.myAnswer !== q.correctOption && (
        <p className="mt-3 text-xs font-semibold text-danger">
          You picked {q.myAnswer} — the answer was {q.correctOption}.
        </p>
      )}

      {q.explanation && (
        <div className="mt-3 rounded-card border-l-4 border-volt bg-paper-deep px-4 py-3">
          <p className="font-display text-[11px] font-extrabold tracking-tight text-ink-soft">Why</p>
          <p className="mt-1 text-xs leading-relaxed text-ink">{q.explanation}</p>
        </div>
      )}
    </article>
  )
}
