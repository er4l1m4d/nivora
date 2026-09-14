import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { Icon, type IconName } from '@/components/Icon'
import { StepDots } from '@/components/StepDots'
import { useSession } from '@/context/useSession'
import type { QuizMode } from '@/api/types'

const STEPS = ['Intro', 'Lane', 'You'] as const

const MODES: Array<{ id: QuizMode; icon: IconName; title: string; blurb: string }> = [
  {
    id: 'demo',
    icon: 'gamepad',
    title: 'Demo',
    blurb: 'The full flow with play money. No wallet needed.',
  },
  {
    id: 'practice',
    icon: 'book',
    title: 'Practice',
    blurb: 'Study solo with AI-drafted Qests. Free, no stakes.',
  },
  {
    id: 'commitment',
    icon: 'flame',
    title: 'Commitment',
    blurb: 'Lock in NIM, compete live. Top 3 take the pool.',
  },
]

const SUBJECTS = [
  'Anatomy', 'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Economics',
  'Law', 'Medicine', 'Computer Science', 'History', 'Languages', 'Other',
] as const

export function WelcomeScreen() {
  const navigate = useNavigate()
  const { signIn } = useSession()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<QuizMode>('demo')
  const [subjects, setSubjects] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const enter = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Pick a name — at least 2 characters')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (subjects.length) {
        try { localStorage.setItem('qestia.subjects', JSON.stringify(subjects)) } catch { /* non-essential */ }
      }
      await signIn(trimmed, mode)
      navigate('/home', { replace: true })
    } catch {
      setError('Could not start your session. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell hideNav>
      <div className="screen">
        <header className="relative flex shrink-0 items-center justify-center">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="absolute left-0 flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-pill border-2 border-ink bg-surface text-ink transition-colors hover:bg-paper-deep"
              aria-label="Previous step"
            >
              <Icon name="caret-left" size={18} weight="bold" />
            </button>
          )}
          <StepDots steps={STEPS} current={step} />
        </header>

        <div key={step} className="screen-scroll animate-screen-enter">
          {step === 0 && <StepIntro onNext={() => { setMode('demo'); setStep(1) }} />}
          {step === 1 && <StepLane mode={mode} onMode={setMode} onNext={() => setStep(2)} />}
          {step === 2 && (
            <StepYou
              name={name}
              onName={setName}
              subjects={subjects}
              onToggleSubject={(s) =>
                setSubjects((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
              }
              error={error}
              busy={busy}
              onEnter={() => void enter()}
            />
          )}
        </div>
      </div>
    </AppShell>
  )
}

/* ── Step 1 · Value proposition ─────────────────────────────────────── */

function StepIntro({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-[clamp(1rem,3svh,2rem)] flex items-center gap-2" aria-hidden>
        <span className="flex h-9 w-9 items-center justify-center rounded-card border-2 border-ink bg-ink text-volt">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <circle cx="11" cy="10.5" r="6" stroke="currentColor" strokeWidth="2.4" fill="none" />
            <circle cx="11" cy="10.5" r="2.2" fill="currentColor" />
            <path d="M14.5 15.5 19 20.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="font-display text-xl font-extrabold tracking-tight">Qestia</span>
      </div>

      <h1 className="mt-[clamp(1.25rem,4.5svh,2.5rem)] font-display text-[clamp(2rem,7.5svh,2.75rem)] font-extrabold leading-[1.04] tracking-tight text-ink">
        Know it.
        <br />
        <span className="highlight-swipe">Prove it.</span>
      </h1>
      <p className="mt-[clamp(0.75rem,2svh,1rem)] max-w-[32ch] text-[15px] leading-relaxed text-ink-soft">
        Challenge what you've learned. Compete with your class. Earn your Standing.
      </p>

      {/* Mini quiz-card still life — the product in one glance */}
      <div className="mt-[clamp(1rem,3svh,2rem)] rounded-card border-2 border-ink bg-ink p-[clamp(0.75rem,2.2svh,1rem)] shadow-press" aria-hidden>
        <div className="rounded-card border-2 border-ink bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="rounded-pill bg-volt px-2.5 py-1 font-display text-[11px] font-extrabold text-ink">
              50 NIM · LIVE
            </span>
            <span className="font-display text-sm font-extrabold text-ink-muted tabular-nums">2:41</span>
          </div>
          <p className="mt-3 font-display text-base font-extrabold leading-snug text-ink">
            Which structure anchors the heart?
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <span className="flex items-center gap-2 rounded-pill border-2 border-ink bg-volt px-3 py-2 text-xs font-bold text-ink">
              <span className="flex h-5 w-5 items-center justify-center rounded-pill border-2 border-ink bg-ink text-[9px] text-volt">A</span>
              Pericardium
              <Icon name="check" size={13} weight="bold" className="ml-auto" />
            </span>
            <span className="flex items-center gap-2 rounded-pill border-2 border-line px-3 py-2 text-xs font-semibold text-ink-soft">
              <span className="flex h-5 w-5 items-center justify-center rounded-pill border-2 border-line text-[9px]">B</span>
              Septum
            </span>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between px-1">
          <span className="font-display text-[11px] font-bold tracking-wide text-paper/70 uppercase">
            4 challengers locked in
          </span>
          <Icon name="lightning" size={14} weight="fill" className="text-volt" />
        </div>
      </div>

      <div className="mt-auto pt-[clamp(1.25rem,3.5svh,2rem)]">
        <Button size="lg" block onClick={onNext}>
          Try a demo <Icon name="arrow-right" size={18} weight="bold" />
        </Button>
      </div>
    </div>
  )
}

/* ── Step 2 · Choose your lane ──────────────────────────────────────── */

function StepLane({
  mode,
  onMode,
  onNext,
}: {
  mode: QuizMode
  onMode: (m: QuizMode) => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mt-[clamp(1.25rem,4.5svh,2rem)] font-display text-[clamp(1.75rem,6.5svh,2.25rem)] font-extrabold leading-[1.05] tracking-tight text-ink">
        Pick your <span className="highlight">lane</span>
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Three ways in. You can switch any time from your profile.
      </p>

      <div className="mt-[clamp(1rem,3svh,1.5rem)] flex flex-col gap-[clamp(0.5rem,1.4svh,0.75rem)]" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onMode(m.id)}
              className={`press flex min-h-[clamp(4rem,9svh,5rem)] items-center gap-3 rounded-card border-2 p-[clamp(0.625rem,1.8svh,1rem)] text-left transition-colors ${
                active ? 'border-ink bg-volt shadow-press-sm' : 'border-line bg-surface hover:border-ink'
              }`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-card border-2 ${
                  active ? 'border-ink bg-ink text-volt' : 'border-ink bg-surface text-ink'
                }`}
                aria-hidden
              >
                <Icon name={m.icon} size={22} weight={active ? 'fill' : 'regular'} />
              </span>
              <span>
                <span className="block font-display text-lg font-extrabold tracking-tight text-ink">
                  {m.title}
                </span>
                <span className="mt-0.5 block text-sm leading-snug text-ink-soft">{m.blurb}</span>
              </span>
              {active && (
                <Icon name="check-circle" size={22} weight="fill" className="ml-auto shrink-0 text-ink" />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-auto pt-[clamp(1.25rem,3.5svh,2rem)]">
        <Button size="lg" block onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  )
}

/* ── Step 3 · Subject + name ────────────────────────────────────────── */

function StepYou({
  name,
  onName,
  subjects,
  onToggleSubject,
  error,
  busy,
  onEnter,
}: {
  name: string
  onName: (v: string) => void
  subjects: string[]
  onToggleSubject: (s: string) => void
  error: string | null
  busy: boolean
  onEnter: () => void
}) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mt-[clamp(1.25rem,4.5svh,2rem)] font-display text-[clamp(1.75rem,6.5svh,2.25rem)] font-extrabold leading-[1.05] tracking-tight text-ink">
        What are you <span className="highlight">studying</span>?
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        Pick a few so your home feed starts close to home. Skip if you'd rather browse.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUBJECTS.map((s) => {
          const active = subjects.includes(s)
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleSubject(s)}
              className={`min-h-10 cursor-pointer rounded-pill border-2 px-4 text-sm font-semibold transition-colors ${
                active ? 'border-ink bg-volt text-ink' : 'border-line bg-surface text-ink-soft hover:border-ink'
              }`}
            >
              {s}
            </button>
          )
        })}
      </div>

      <div className="mt-7">
        <label htmlFor="displayName" className="font-display text-base font-extrabold tracking-tight text-ink">
          And who's competing?
        </label>
        <input
          id="displayName"
          type="text"
          value={name}
          maxLength={30}
          placeholder="e.g. Ada the Anatomist"
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter()
          }}
          autoComplete="nickname"
          className="mt-2 min-h-13 w-full rounded-card border-2 border-ink bg-surface px-4 text-base font-medium text-ink placeholder:text-ink-muted/70 focus:bg-volt-faint"
        />
        {error && (
          <p className="mt-2 text-sm font-semibold text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-auto pt-[clamp(1.25rem,3.5svh,2rem)]">
        <Button size="lg" block onClick={onEnter} disabled={busy}>
          {busy ? 'Locking in…' : 'Enter Qestia'}
          {!busy && <Icon name="lock" size={18} weight="fill" />}
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-muted">
          Demo and Practice are free. Commitment mode uses real NIM via your Nimiq wallet — link
          one later from your profile.
        </p>
      </div>
    </div>
  )
}
