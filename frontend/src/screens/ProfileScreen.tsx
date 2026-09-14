import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { friendlyError } from '@/api/errors'
import type { HistoryEntry, QuizMode } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { ErrorBanner, StaleBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { Modal } from '@/components/Modal'
import { SkeletonList } from '@/components/Skeleton'
import { StatusPill } from '@/components/StatusPill'
import { useSession } from '@/context/useSession'
import { getStreak } from '@/lib/streak'
import { usePolling } from '@/hooks/usePolling'
import { getDeviceIdentifier, listWallets } from '@/lib/nimiq'

const MODES: ReadonlyArray<{ id: QuizMode; label: string }> = [
  { id: 'demo', label: 'Demo' },
  { id: 'practice', label: 'Practice' },
  { id: 'commitment', label: 'Commitment' },
]

const SPLIT = [
  { place: '1st', pct: 50 },
  { place: '2nd', pct: 30 },
  { place: '3rd', pct: 10 },
] as const

export function ProfileScreen() {
  const navigate = useNavigate()
  const { user, mode, setMode, signOut } = useSession()
  const [wallet, setWallet] = useState(user?.walletAddress ?? null)
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [showHow, setShowHow] = useState(false)
  const streak = getStreak()

  const { data: history, error: historyError } = usePolling<HistoryEntry[]>(
    () => (user ? api.getMyHistory(user.id) : Promise.resolve([])),
    { intervalMs: 10_000, disabled: !user },
  )

  const stats = useMemo(() => {
    const entries = history ?? []
    const played = entries.length
    const podiums = entries.filter((e) => e.rank !== null && e.rank <= 3).length
    const net = entries.reduce((sum, e) => sum + (e.payout - e.entryAmount), 0)
    return { played, podiums, net }
  }, [history])

  const linkWallet = async () => {
    if (!user) return
    setLinking(true)
    setLinkError(null)
    try {
      const accounts = await listWallets()
      if (accounts.length === 0) {
        setLinkError('No account found in your wallet. Open Qestia inside Nimiq Pay to link one.')
        return
      }
      const deviceId = await getDeviceIdentifier(
        "Confirm it's really you — one Qestia identity per device",
      )
      const res = await api.linkWallet(user.id, accounts[0], deviceId ?? undefined)
      setWallet(res.walletAddress)
    } catch (err) {
      setLinkError(friendlyError(err, 'Could not link the wallet.'))
    } finally {
      setLinking(false)
    }
  }

  if (!user) return null

  return (
    <AppShell>
      <div className="screen">
        <div className="screen-scroll">
        <header className="flex shrink-0 items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-pill border-2 border-ink bg-volt font-display text-2xl font-extrabold text-ink shadow-press-sm"
            aria-hidden
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-extrabold tracking-tight text-ink">
              {user.displayName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-paper-deep px-3 py-1 text-[11px] font-bold text-ink-soft">
                <Icon name="wallet" size={14} />
                {wallet
                  ? `${wallet.slice(0, 10)}…${wallet.slice(-4)}`
                  : 'No wallet — link one below'}
              </span>
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-pill border border-ink bg-volt px-2.5 py-1 font-display text-[11px] font-extrabold tabular-nums text-ink">
                  <Icon name="flame" size={13} weight="fill" />
                  {streak}-day streak
                </span>
              )}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-3">
          <StatCard label="Qests" value={history === null ? '—' : `${stats.played}`} />
          <StatCard label="Podiums" value={history === null ? '—' : `${stats.podiums}`} />
          <StatCard
            label="Net NIM"
            value={
              history === null
                ? '—'
                : `${stats.net >= 0 ? '+' : ''}${stats.net.toFixed(2)}`
            }
            tone={stats.net > 0 ? 'positive' : stats.net < 0 ? 'negative' : 'neutral'}
          />
        </section>

        <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
            Nimiq wallet
          </h2>
          {wallet ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border-2 border-ink bg-volt text-ink" aria-hidden>
                <Icon name="check" size={20} weight="bold" />
              </span>
              <code className="min-w-0 flex-1 truncate rounded-card border border-line bg-paper-deep px-3 py-2.5 text-xs text-ink">
                {wallet}
              </code>
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Link your wallet to send real commitments and receive payouts. On-chain
                verification proves every payment comes from your address.
              </p>
              {linkError && (
                <p className="mt-2 rounded-card border border-danger/40 bg-danger-soft px-3.5 py-2 text-xs font-semibold text-danger" role="alert">
                  {linkError}
                </p>
              )}
              <Button className="mt-3" onClick={() => void linkWallet()} disabled={linking}>
                {linking ? 'Linking…' : 'Link Nimiq wallet'}
              </Button>
            </>
          )}
        </section>

        <section className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
            Mode
          </h2>
          <div className="mt-3 flex gap-2" role="group" aria-label="Session mode">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={`min-h-11 flex-1 cursor-pointer rounded-pill border-2 font-display text-xs font-bold tracking-tight transition-colors ${
                  mode === m.id
                    ? 'border-ink bg-volt text-ink'
                    : 'border-line bg-surface text-ink-soft hover:border-ink'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-muted">
            {mode === 'commitment'
              ? 'Commitments use real NIM once the Nimiq wallet is linked.'
              : mode === 'practice'
                ? 'Free solo practice — no stakes, no payouts.'
                : 'Play money only — everything resets on refresh.'}
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
            How it works
          </h2>
          <button
            type="button"
            onClick={() => setShowHow(true)}
            className="press flex min-h-16 cursor-pointer items-center gap-3 rounded-card border-2 border-ink bg-surface px-4 py-3 text-left shadow-card"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border-2 border-ink bg-volt text-ink" aria-hidden>
              <Icon name="vault" size={20} weight="fill" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-sm font-extrabold tracking-tight text-ink">
                How the money works
              </span>
              <span className="block text-xs text-ink-soft">
                Escrow, the 50 / 30 / 10 split, and the 80% back rule
              </span>
            </span>
            <Icon name="chevron-right" size={16} weight="bold" className="shrink-0 text-ink-muted" />
          </button>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-base font-extrabold tracking-tight text-ink">
            History
          </h2>
          {historyError && !history ? (
            <ErrorBanner>Couldn't load your history — it'll retry automatically.</ErrorBanner>
          ) : history === null ? (
            <SkeletonList count={2} className="h-20" />
          ) : history.length === 0 ? (
            <EmptyState
              icon={<Icon name="podium" size={28} weight="duotone" />}
              title="No Qests yet"
              description="Join or create your first Qest and your results will show up here."
              action={
                <Link to="/home">
                  <Button size="sm">Find a Qest</Button>
                </Link>
              }
            />
          ) : (
            <>
              {historyError && <StaleBanner />}
              <ul className="flex flex-col gap-2.5">
                {history.map((entry) => (
                <li key={entry.quizId}>
                  <Link
                    to={`/quiz/${entry.quizId}/results`}
                    className="block rounded-card border border-line bg-surface p-4 transition-all hover:border-ink hover:shadow-card"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-display text-sm font-bold text-ink">
                        {entry.title}
                      </span>
                      <StatusPill status={entry.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft tabular-nums">
                      <span className="font-bold text-ink">
                        {entry.correctAnswers}/{entry.questionCount}
                      </span>
                      {entry.rank !== null && (
                        <span>
                          {entry.rank <= 3 ? (
                            <Icon name="trophy" className="mr-1 inline-block text-ink" size={14} weight="fill" />
                          ) : entry.rank >= 98 ? (
                            '—'
                          ) : (
                            `#${entry.rank} place`
                          )}
                        </span>
                      )}
                      <span
                        className={`ml-auto font-display font-extrabold ${
                          entry.payout > entry.entryAmount
                            ? 'text-success'
                            : entry.payout < entry.entryAmount
                              ? 'text-danger'
                              : 'text-ink-soft'
                        }`}
                      >
                        {entry.payout > entry.entryAmount ? '+' : ''}
                        {(entry.payout - entry.entryAmount).toFixed(2)} NIM
                      </span>
                    </div>
                  </Link>
                </li>
                ))}
              </ul>
            </>
          )}
        </section>
        </div>

        <div className="screen-footer">
          <Button
            variant="secondary"
            onClick={() => {
              signOut()
              navigate('/')
            }}
          >
            Sign out
          </Button>

          <p className="mt-2 text-center text-[11px] text-ink-muted">
            Qestia · where knowing becomes proving · v0.1
          </p>
        </div>
      </div>

      <Modal open={showHow} onClose={() => setShowHow(false)} title="How the money works">
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Every stake sits in escrow until the Qest settles. No house, no hidden cut.
          </p>

          <div className="rounded-card border-2 border-ink bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Icon name="coins" size={18} weight="fill" className="text-ink" aria-hidden />
              <span className="font-display text-sm font-extrabold tracking-tight text-ink">The pot, split</span>
            </div>
            <div className="mt-3 flex h-7 overflow-hidden rounded-pill border-2 border-ink" aria-hidden>
              <span className="w-[50%] bg-volt" />
              <span className="w-[30%] bg-ink" />
              <span className="w-[10%] bg-paper-deep" />
            </div>
            <dl className="mt-3 flex flex-col gap-1.5">
              {SPLIT.map((s) => (
                <div key={s.place} className="flex items-center justify-between text-sm">
                  <dt className="flex items-center gap-2 font-semibold text-ink-soft">
                    <span
                      className={`h-3 w-3 rounded-pill border border-ink ${s.place === '1st' ? 'bg-volt' : s.place === '2nd' ? 'bg-ink' : 'bg-paper-deep'}`}
                      aria-hidden
                    />
                    {s.place} place
                  </dt>
                  <dd className="font-display font-extrabold tabular-nums text-ink">{s.pct}%</dd>
                </div>
              ))}
            </dl>
          </div>

          <ul className="flex flex-col gap-2.5">
            <li className="flex items-start gap-3 rounded-card border border-line bg-paper px-4 py-3">
              <Icon name="shield" size={20} weight="fill" className="mt-0.5 shrink-0 text-success" aria-hidden />
              <p className="text-sm leading-snug text-ink-soft">
                <strong className="font-semibold text-ink">Show up, finish, get 80% back</strong> —
                even if you don't win. Showing up pays.
              </p>
            </li>
            <li className="flex items-start gap-3 rounded-card border border-line bg-paper px-4 py-3">
              <Icon name="hand-coins" size={20} weight="fill" className="mt-0.5 shrink-0 text-ink" aria-hidden />
              <p className="text-sm leading-snug text-ink-soft">
                <strong className="font-semibold text-ink">Room doesn't fill? Everyone is refunded</strong>{' '}
                in full, automatically.
              </p>
            </li>
            <li className="flex items-start gap-3 rounded-card border border-line bg-paper px-4 py-3">
              <Icon name="clock" size={20} weight="fill" className="mt-0.5 shrink-0 text-ink" aria-hidden />
              <p className="text-sm leading-snug text-ink-soft">
                <strong className="font-semibold text-ink">No-shows forfeit 50%</strong> to the
                pool — locking in means showing up.
              </p>
            </li>
          </ul>
        </div>
      </Modal>
    </AppShell>
  )
}

function StatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative' | 'neutral'
}) {
  const toneClass =
    tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-danger' : 'text-ink'
  return (
    <div className="rounded-card border-2 border-ink bg-surface px-3 py-4 text-center shadow-card">
      <p className={`font-display text-xl font-extrabold tracking-tight tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-ink-muted">{label}</p>
    </div>
  )
}
