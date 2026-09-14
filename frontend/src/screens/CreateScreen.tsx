import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api'
import { friendlyError } from '@/api/errors'
import type { OptionKey } from '@/api/types'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/Button'
import { ErrorBanner } from '@/components/ErrorState'
import { Icon } from '@/components/Icon'
import { StepDots } from '@/components/StepDots'
import { useSession } from '@/context/useSession'
import {
  blankDraft,
  canGenerate,
  generateDraftQuestions,
  toDraftQuestion,
  type DraftQuestion,
} from '@/lib/generator'

type Step = 'upload' | 'generating' | 'review'

const QUESTION_COUNTS = [5, 10, 15, 20] as const
const DURATIONS_MIN = [1, 3, 5, 10, 15] as const
const STAKES = [10, 25, 50, 100, 250] as const
const START_DELAYS_MIN = [0, 15, 30, 60] as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function CreateScreen() {
  const navigate = useNavigate()
  const { user, mode } = useSession()

  const [step, setStep] = useState<Step>('upload')
  const [genMessage, setGenMessage] = useState('')
  const [genNote, setGenNote] = useState<string | null>(null)
  const [extractNote, setExtractNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // draft settings
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [material, setMaterial] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [questionCount, setQuestionCount] = useState<number>(10)
  const [durationMin, setDurationMin] = useState<number>(5)
  const [stake, setStake] = useState<number>(25)
  const [startDelay, setStartDelay] = useState<number>(mode === 'practice' ? 0 : 30)

  const [drafts, setDrafts] = useState<DraftQuestion[]>([])
  const [publishing, setPublishing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    setError(null)
    setExtractNote(null)
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (isPdf) {
      try {
        const res = await api.uploadMaterial(file)
        setMaterial(res.text)
        setFileName(file.name)
        setExtractNote(
          res.truncated
            ? `Extracted ${res.pages} pages — text truncated to ${res.chars} chars`
            : `Extracted ${res.pages} pages from ${file.name}`,
        )
      } catch (e) {
        setError(friendlyError(e))
      }
      return
    }
    const text = await file.text()
    setMaterial(text)
    setFileName(file.name)
  }

  const generate = async () => {
    if (title.trim().length < 3) {
      setError('Give your Qest a title (3+ characters)')
      return
    }
    if (!canGenerate(material)) {
      setError('Paste at least a couple of paragraphs of study material — the AI needs something to work with.')
      return
    }
    setError(null)
    setGenNote(null)
    setStep('generating')
    setGenMessage('Reading your material…')
    await sleep(700)
    setGenMessage('Drafting questions…')
    let generated: DraftQuestion[] = []
    try {
      const res = await api.generateQuestions({ material, numQuestions: questionCount })
      generated = res.questions.map(toDraftQuestion)
    } catch {
      // Backend AI unavailable (disabled, timeout, or network) — fall back locally.
      setGenNote('AI unavailable — drafted from your text directly.')
      generated = generateDraftQuestions(material, questionCount)
    }
    if (generated.length === 0) {
      setError('Could not find enough substance in that material. Try richer text.')
      setStep('upload')
      return
    }
    setGenMessage('Polishing the wording…')
    await sleep(600)
    setDrafts(generated)
    setStep('review')
  }

  const publish = async () => {
    if (!user) return
    if (drafts.length === 0) {
      setError('Add at least one question')
      return
    }
    const anyBlank = drafts.some(
      (d) =>
        d.questionText.trim() === '' ||
        d.options.some((o) => o.text.trim() === ''),
    )
    if (anyBlank) {
      setError('Every question needs text and all four options filled')
      return
    }
    setPublishing(true)
    setError(null)
    try {
      const { quizId } = await api.createQuiz({
        creatorId: user.id,
        title: title.trim(),
        description: description.trim() || undefined,
        currency: 'NIM',
        entryAmount: stake,
        minParticipants: mode === 'practice' ? 1 : 3,
        durationSeconds: durationMin * 60,
        startsAt: new Date(Date.now() + startDelay * 60_000).toISOString(),
      })
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i]
        await api.addQuestion(quizId, {
          position: i + 1,
          questionText: d.questionText.trim(),
          optionA: d.options[0].text.trim(),
          optionB: d.options[1].text.trim(),
          optionC: d.options[2].text.trim(),
          optionD: d.options[3].text.trim(),
          correctOption: d.correctOption,
        })
      }
      await api.publishQuiz(quizId)
      await api.openQuiz(quizId)
      navigate(`/quiz/${quizId}`)
    } catch (err) {
      setError(friendlyError(err, 'Publishing failed — try again'))
      setPublishing(false)
    }
  }

  // ---------- editors ----------
  const updateDraft = (id: string, patch: Partial<DraftQuestion>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }

  const updateOption = (id: string, key: OptionKey, text: string) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, options: d.options.map((o) => (o.key === key ? { ...o, text } : o)) }
          : d,
      ),
    )
  }

  const removeDraft = (id: string) => setDrafts((prev) => prev.filter((d) => d.id !== id))

  const moveDraft = (index: number, dir: -1 | 1) => {
    setDrafts((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <AppShell>
      <div className="screen">
        <header className="shrink-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
            Create a <span className="highlight">Qest</span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Your material in, a challenge out. You play blind — same as everyone.
          </p>
        </header>

        {step !== 'generating' && (
          <StepDots
            steps={['Upload', 'Generate', 'Review']}
            current={step === 'upload' ? 0 : 2}
          />
        )}

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <div className="screen-scroll">

        {step === 'upload' && (
          <section className="flex flex-col gap-4">
            <div className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
              <label htmlFor="quizTitle" className="text-xs font-semibold text-ink-muted">
                Title
              </label>
              <input
                id="quizTitle"
                type="text"
                value={title}
                maxLength={80}
                placeholder="e.g. Cell Biology Final"
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-card border-2 border-ink bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-ink-muted/70 focus:bg-volt-faint"
              />

              <label htmlFor="quizDesc" className="mt-4 block text-xs font-semibold text-ink-muted">
                Description <span className="font-normal">(optional)</span>
              </label>
              <input
                id="quizDesc"
                type="text"
                value={description}
                maxLength={200}
                placeholder="What is this Qest about?"
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 min-h-12 w-full rounded-card border-2 border-ink bg-surface px-4 py-3 text-base font-medium text-ink placeholder:text-ink-muted/70 focus:bg-volt-faint"
              />
            </div>

            <div className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card border-2 border-ink bg-volt text-ink" aria-hidden>
                  <Icon name="note" size={20} weight="fill" />
                </span>
                <div>
                  <p className="font-display text-sm font-extrabold tracking-tight text-ink">Study material</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                    Use notes your group can fairly be tested on.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="mt-2 w-full cursor-pointer rounded-card border-2 border-dashed border-ink bg-volt-faint px-4 py-8 text-center transition-colors hover:bg-volt"
              >
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-card border-2 border-ink bg-surface text-ink" aria-hidden>
                  <Icon name="file" size={20} />
                </span>
                <span className="mt-1 block text-sm font-bold text-ink">
                  {fileName ?? 'Upload notes or paste below'}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  .txt, .md or .pdf
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".txt,.md,.pdf,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void onFile(f)
                }}
              />
              <textarea
                value={material}
                onChange={(e) => {
                  setMaterial(e.target.value)
                  if (fileName) setFileName(null)
                }}
                rows={6}
                placeholder="Paste your study material here — lecture notes, textbook paragraphs, summary sheets…"
                className="mt-3 min-h-36 w-full resize-y rounded-card border-2 border-ink bg-surface px-4 py-3 text-base leading-relaxed text-ink placeholder:text-ink-muted/70 focus:bg-volt-faint"
                aria-label="Study material"
              />
              {extractNote && (
                <p
                  className={
                    'mt-2 rounded-pill border px-3 py-1 text-xs font-medium ' +
                    (extractNote.includes('truncated')
                      ? 'border-amber-soft bg-amber-soft/40 text-ink-soft'
                      : 'border-success-soft bg-success-soft/30 text-ink-soft')
                  }
                >
                  {extractNote}
                </p>
              )}
              <p className="mt-1 text-right text-xs text-ink-muted tabular-nums">
                {material.trim().length} characters
              </p>
            </div>

            <div className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
              <p className="font-display text-base font-extrabold tracking-tight text-ink">Settings</p>
              <ChoiceRow
                label="Questions"
                options={QUESTION_COUNTS}
                value={questionCount}
                onChange={setQuestionCount}
                format={(v) => `${v}`}
              />
              <ChoiceRow
                label="Time limit"
                options={DURATIONS_MIN}
                value={durationMin}
                onChange={setDurationMin}
                format={(v) => `${v} min`}
              />
              <ChoiceRow
                label="Stake"
                options={STAKES}
                value={stake}
                onChange={setStake}
                format={(v) => `${v} NIM`}
                accent
              />
              <ChoiceRow
                label="Starts in"
                options={START_DELAYS_MIN}
                value={startDelay}
                onChange={setStartDelay}
                format={(v) => (v === 0 ? 'Now' : `${v} min`)}
                last
              />
            </div>

            </section>
        )}

        {step === 'generating' && (
          <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-card border-2 border-ink bg-surface p-8 shadow-card">
            <div className="h-14 w-14 animate-spin rounded-pill border-4 border-paper-deep border-t-ink" />
            <p className="font-display text-base font-extrabold tracking-tight text-ink">{genMessage}</p>
            <p className="text-xs text-ink-muted">This usually takes a few seconds</p>
            {genNote && (
              <p className="mt-2 rounded-pill border border-amber-soft bg-amber-soft/40 px-3 py-1 text-xs font-medium text-ink-soft">
                {genNote}
              </p>
            )}
          </section>
        )}

        {step === 'review' && (
          <section className="flex flex-col gap-4">
            <div className="rounded-card border-2 border-ink bg-volt px-4 py-3 shadow-card">
              <p className="font-display text-sm font-extrabold tracking-tight text-ink tabular-nums">
                {drafts.length} question{drafts.length === 1 ? '' : 's'} drafted
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                Check every question — you can edit, reorder, delete or add. Once someone
                commits, the Qest locks.
              </p>
            </div>

            {drafts.map((d, i) => (
              <QuestionEditor
                key={d.id}
                index={i}
                total={drafts.length}
                draft={d}
                onUpdate={(patch) => updateDraft(d.id, patch)}
                onUpdateOption={(key, text) => updateOption(d.id, key, text)}
                onRemove={() => removeDraft(d.id)}
                onMove={(dir) => moveDraft(i, dir)}
              />
            ))}

            <Button variant="secondary" onClick={() => setDrafts((prev) => [...prev, blankDraft()])}>
              <Icon name="plus" size={16} weight="bold" />
              Add question
            </Button>
          </section>
        )}
        </div>

        {step !== 'generating' && (
          <div className="screen-footer">
            {step === 'upload' ? (
              <Button size="lg" onClick={() => void generate()}>
                Generate questions
              </Button>
            ) : (
              <>
                <Button size="lg" onClick={() => void publish()} disabled={publishing}>
                  {publishing
                    ? 'Publishing…'
                    : startDelay === 0
                      ? 'Publish — starts immediately'
                      : `Publish — opens in ${startDelay} min`}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStep('upload')} disabled={publishing}>
                  Back to material
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function ChoiceRow({
  label,
  options,
  value,
  onChange,
  format,
  last = false,
  accent = false,
}: {
  label: string
  options: readonly number[]
  value: number
  onChange: (v: number) => void
  format: (v: number) => string
  last?: boolean
  /** the money choice gets the highlighter */
  accent?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${last ? '' : 'border-b border-line'}`}>
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex flex-wrap justify-end gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={value === o}
            className={`min-h-11 cursor-pointer rounded-pill border-2 px-3 py-1.5 font-display text-xs font-bold tabular-nums tracking-tight transition-colors ${
              value === o
                ? accent
                  ? 'border-ink bg-volt text-ink'
                  : 'border-ink bg-ink text-paper'
                : 'border-line bg-surface text-ink-soft hover:border-ink'
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  )
}

function QuestionEditor({
  index,
  total,
  draft,
  onUpdate,
  onUpdateOption,
  onRemove,
  onMove,
}: {
  index: number
  total: number
  draft: DraftQuestion
  onUpdate: (patch: Partial<DraftQuestion>) => void
  onUpdateOption: (key: OptionKey, text: string) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  return (
    <article className="rounded-card border-2 border-ink bg-surface p-5 shadow-card">
      <header className="flex items-center justify-between">
        <span className="font-display text-xs font-bold text-ink-muted tabular-nums">
          Question {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <Icon name="arrow-up" size={16} weight="bold" />
          </IconBtn>
          <IconBtn label="Move down" disabled={index === total - 1} onClick={() => onMove(1)}>
            <Icon name="arrow-down" size={16} weight="bold" />
          </IconBtn>
          <IconBtn label="Delete question" danger onClick={onRemove}>
            <Icon name="trash" size={16} weight="bold" />
          </IconBtn>
        </div>
      </header>

      <textarea
        value={draft.questionText}
        rows={3}
        onChange={(e) => onUpdate({ questionText: e.target.value })}
        placeholder="Question text"
        aria-label={`Question ${index + 1} text`}
        className="mt-3 min-h-24 w-full resize-y rounded-card border-2 border-ink bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink focus:bg-volt-faint"
      />

      <div className="mt-3 flex flex-col gap-2">
        {draft.options.map((o) => (
          <div key={o.key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdate({ correctOption: o.key })}
              aria-pressed={draft.correctOption === o.key}
              aria-label={`Mark option ${o.key} as correct`}
              className={`flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border-2 font-display text-xs font-extrabold transition-colors ${
                draft.correctOption === o.key
                  ? 'border-ink bg-success text-white'
                  : 'border-line bg-paper-deep text-ink-soft hover:border-ink'
              }`}
            >
              {draft.correctOption === o.key ? <Icon name="check" size={15} weight="bold" /> : o.key}
            </button>
            <input
              type="text"
              value={o.text}
              placeholder={`Option ${o.key}`}
              onChange={(e) => onUpdateOption(o.key, e.target.value)}
              aria-label={`Option ${o.key} for question ${index + 1}`}
              className="min-h-11 w-full rounded-card border-2 border-ink bg-surface px-3.5 py-2 text-base text-ink focus:bg-volt-faint"
            />
          </div>
        ))}
      </div>

      {draft.explanation && (
        <p className="mt-3 rounded-card border-l-4 border-volt bg-paper-deep px-3.5 py-2 text-xs leading-relaxed text-ink">
          <span className="font-bold">Why: </span>
          {draft.explanation}
        </p>
      )}
    </article>
  )
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-pill text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? 'bg-danger-soft text-danger hover:bg-danger hover:text-white' : 'bg-paper-deep text-ink-soft hover:bg-ink hover:text-paper'
      }`}
    >
      {children}
    </button>
  )
}
