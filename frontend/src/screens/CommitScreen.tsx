import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api'
import { friendlyError } from '@/api/errors'
import type { AppConfig, JoinResult } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { ErrorBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { MemoCard } from '@/components/MemoCard'
import { useSession } from '@/context/useSession'
import { isWalletAvailable, sendCommitment } from '@/lib/nimiq'

type Stage = 'summary' | 'confirming' | 'send' | 'verifying' | 'confirmed'

export function CommitScreen() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const { user } = useSession()

  const [entry, setEntry] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState<Stage>('summary')
  const [join, setJoin] = useState<JoinResult | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [walletAvailable, setWalletAvailable] = useState<boolean | null>(null)
  const [pastedHash, setPastedHash] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    if (!quizId) return
    let cancelled = false
    // Config failure must never silently downgrade a real-money user to
    // "play money" copy — default to the safe (real) assumption until known.
    void api
      .getConfig()
      .then((c) => {
        if (!cancelled) setConfig(c)
      })
      .catch(() => {
        if (!cancelled)
          setConfig({ paymentsMode: 'real', escrowAddress: null, minParticipantsDefault: 3 })
      })
    void api.getQuiz(quizId).then((quiz) => {
      if (!cancelled) {
        setEntry(quiz.entryAmount)
        setTitle(quiz.title)
      }
    }).catch(() => {
      if (!cancelled) setError('Qest not found')
    })
    return () => {
      cancelled = true
    }
  }, [quizId])

  // wallet availability probe (non-blocking; null = still checking)
  useEffect(() => {
    void isWalletAvailable().then(setWalletAvailable)
  }, [])

  const confirm = useCallback(async () => {
    if (!quizId || !user) return
    setStage('confirming')
    setError(null)
    try {
      const result = await api.joinQuiz(quizId, user.id)
      setJoin(result)
      if (result.status === 'JOINED') {
        setStage('confirmed') // mock mode: instantly confirmed
      } else {
        setStage('send')
      }
    } catch (err) {
      setError(friendlyError(err, 'Commitment failed — try again'))
      setStage('summary')
    }
  }, [quizId, user])

  const submitTxRef = useCallback(async (txRef: string) => {
    if (!quizId || !join) return
    setStage('verifying')
    setError(null)
    setDetail(null)
    try {
      const res = await api.verifyCommitment(quizId, join.participantId, txRef)
      if (res.verified) {
        setStage('confirmed')
      } else {
        setDetail(res.detail)
        setStage('send')
      }
    } catch (err) {
      setError(friendlyError(err, "Couldn't verify that transaction — try again"))
      setStage('send')
    }
  }, [quizId, join])

  const payFromWallet = useCallback(async () => {
    if (!join || !join.escrowAddress || !entry) return
    setDetail(null)
    setError(null)
    try {
      const res = await sendCommitment(join.escrowAddress, entry, join.memoCode ?? '')
      if ('txRef' in res) {
        await submitTxRef(res.txRef)
      } else {
        setError(res.error)
      }
    } catch (err) {
      setError(friendlyError(err, "Couldn't open the wallet payment — try again"))
    }
  }, [join, entry, submitTxRef])

  if (error && entry === null) {
    return (
      <AppShell>
        <div className="rounded-card border-2 border-ink bg-surface p-8 text-center shadow-card">
          <Icon name="alert" className="text-danger" size={30} weight="fill" />
          <h1 className="mt-2 font-display text-lg font-extrabold tracking-tight text-ink">Can't commit</h1>
          <p className="mt-1 text-sm text-ink-soft">{error}</p>
          <Button className="mt-4" size="sm" onClick={() => navigate(quizId ? `/quiz/${quizId}` : '/home')}>
            Back
          </Button>
        </div>
      </AppShell>
    )
  }

  if (entry === null) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-card border border-line bg-paper-deep" aria-hidden />
      </AppShell>
    )
  }

  const realMode = config?.paymentsMode === 'real'

  return (
    <AppShell>
      <div className="screen">
        <header className="shrink-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Lock in your <span className="highlight">stake</span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{title}</p>
        </header>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div className="screen-scroll">

        {stage === 'summary' && (
          <>
            <section className="shrink-0 rounded-card border-2 border-ink bg-volt p-[clamp(1rem,3.2svh,1.5rem)] text-center shadow-press-sm">
              <p className="font-display text-sm font-bold text-ink-soft">You're committing</p>
              <p className="mt-2 font-display text-[clamp(2rem,7.5svh,3rem)] font-extrabold tracking-tight tabular-nums text-ink">
                {entry} NIM
              </p>
              {realMode ? (
                <p className="mt-2 text-xs font-semibold text-ink-soft">
                  Real NIM · sent from your Nimiq wallet · feeless
                </p>
              ) : (
                <p className="mt-2 text-xs text-ink-muted">Play money — instantly confirmed</p>
              )}
            </section>

            <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
              <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
                How payouts work
              </h2>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm text-ink">
                <PayoutRow icon="trophy" text="Finish top 3 — get 100% back plus your share of the pool (50 / 30 / 10)" />
                <PayoutRow icon="podium" text="Finish outside the top 3 — get 80% back, 20% feeds the pool" />
                <PayoutRow icon="check" text="Complete the Qest — split a 10% completion bonus with everyone who finished" />
                <PayoutRow icon="clock" text="No-show — 50% back, 50% to the pool. Locking in means showing up" />
              </ul>
              <p className="mt-4 rounded-card border border-amber/30 bg-amber-soft px-3.5 py-2.5 text-xs leading-relaxed text-ink">
                Needs at least 3 confirmed commitments to run — otherwise everyone is
                auto-refunded in full.
              </p>
            </section>

            <Button size="lg" onClick={() => void confirm()}>
              <Icon name="lock" size={18} weight="fill" />
              Commit {entry} NIM
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/quiz/${quizId}`)}>
              Not yet
            </Button>
          </>
        )}

        {stage === 'confirming' && (
          <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-card border-2 border-ink bg-surface p-8 text-center shadow-card" role="status">
            <div className="h-14 w-14 animate-spin rounded-pill border-4 border-paper-deep border-t-ink" />
            <p className="font-display text-base font-extrabold tracking-tight text-ink">
              {realMode ? 'Reserving your spot…' : 'Confirming transaction…'}
            </p>
            <p className="text-xs text-ink-muted">
              {realMode ? 'Generating your commitment code' : 'Demo mode — instantly confirmed'}
            </p>
          </section>
        )}

        {(stage === 'send' || stage === 'verifying') && join && (
          <>
            {detail && (
              <p className="rounded-card border border-amber/30 bg-amber-soft px-4 py-3 text-sm font-semibold text-ink" role="status">
                {detail}
              </p>
            )}
            <MemoCard code={join.memoCode ?? ''} address={join.escrowAddress ?? ''} />

            {stage === 'verifying' ? (
              <section className="flex flex-col items-center gap-3 rounded-card border-2 border-ink bg-surface p-8 text-center shadow-card" role="status">
                <div className="h-12 w-12 animate-spin rounded-pill border-4 border-paper-deep border-t-ink" />
                <p className="font-display text-base font-extrabold tracking-tight text-ink">
                  Verifying on-chain…
                </p>
                <p className="text-xs text-ink-muted">
                  Usually a few seconds. If it doesn't confirm now, come back later —
                  your spot is already reserved.
                </p>
              </section>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={() => void payFromWallet()}
                  disabled={walletAvailable === false}
                >
                  {walletAvailable === false
                    ? 'No wallet — send manually below'
                    : `Send ${entry} NIM from your wallet`}
                </Button>

                {walletAvailable === false && (
                  <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
                    <p className="font-display text-sm font-extrabold text-ink">Sent it manually?</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                      Send exactly {entry} NIM to the escrow address with your memo code above,
                      then paste the transaction hash here to confirm.
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      <input
                        type="text"
                        value={pastedHash}
                        onChange={(e) => setPastedHash(e.target.value)}
                        placeholder="Transaction hash"
                        aria-label="Transaction hash"
                        className="min-h-12 w-full rounded-card border-2 border-ink bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-ink-muted/70 focus:bg-volt-faint"
                      />
                      <Button
                        disabled={pastedHash.trim().length < 8}
                        onClick={() => void submitTxRef(pastedHash.trim())}
                      >
                        Verify transaction
                      </Button>
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}

        {stage === 'confirmed' && (
          <>
            <section
              className="flex flex-col items-center gap-2 rounded-card border-2 border-success bg-success-soft px-6 py-8 text-center"
              role="status"
              aria-live="polite"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-pill border-2 border-ink bg-volt text-ink" aria-hidden>
                <Icon name="check" size={28} weight="bold" />
              </span>
              <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink">You're in</h2>
              <p className="text-sm text-ink-soft">
                {entry} NIM committed and {realMode ? 'confirmed on-chain' : 'confirmed'}.
              </p>
            </section>

            {join?.memoCode && <MemoCard code={join.memoCode} address={join.escrowAddress ?? ''} />}

            <Button size="lg" onClick={() => navigate(`/quiz/${quizId}/lobby`)}>
              Go to the lobby
            </Button>
          </>
        )}
        </div>
      </div>
    </AppShell>
  )
}

function PayoutRow({ icon, text }: { icon: 'trophy' | 'podium' | 'check' | 'clock'; text: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill border border-line bg-paper-deep text-ink" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      <span className="leading-relaxed">{text}</span>
    </li>
  )
}
