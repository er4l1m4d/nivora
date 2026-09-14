import type { OptionKey } from '@/api/types'

export interface DraftOption {
  key: OptionKey
  text: string
}

export interface DraftQuestion {
  id: string
  questionText: string
  options: DraftOption[]
  correctOption: OptionKey
  explanation: string | null
}

const OPTION_KEYS: OptionKey[] = ['A', 'B', 'C', 'D']

function uid(): string {
  return crypto.randomUUID()
}

function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const MIN_MATERIAL_CHARS = 120

export function canGenerate(material: string): boolean {
  return material.trim().length >= MIN_MATERIAL_CHARS
}

/**
 * Local fallback engine: turns pasted study material into cloze-style draft
 * questions. The backend `/api/generate` (Track A) is the primary path; this
 * runs only when the API is unavailable, so the demo never dead-ends.
 */
export function generateDraftQuestions(material: string, count: number): DraftQuestion[] {
  const sentences = material
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').length >= 6)

  const vocabulary = [
    ...new Set(
      material
        .split(/\W+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 6),
    ),
  ]

  const questions: DraftQuestion[] = []
  const usedAnswers = new Set<string>()

  for (const sentence of sentences) {
    if (questions.length >= count) break

    const answer = sentence
      .split(/\W+/)
      .find((w) => w.length >= 6 && !usedAnswers.has(w.toLowerCase()))
    if (!answer) continue

    const blanked = sentence.replace(new RegExp(`\\b${escapeRegex(answer)}\\b`), '______')
    if (!blanked.includes('______')) continue

    const distractorPool = vocabulary.filter((w) => w.toLowerCase() !== answer.toLowerCase())
    if (distractorPool.length < 3) continue

    const distractors = shuffle(distractorPool).slice(0, 3)
    const allOptions = shuffle([answer, ...distractors])

    questions.push({
      id: uid(),
      questionText: blanked,
      options: allOptions.map((text, i) => ({ key: OPTION_KEYS[i], text })),
      correctOption: OPTION_KEYS[allOptions.indexOf(answer)],
      explanation: sentence,
    })

    usedAnswers.add(answer.toLowerCase())
  }

  return questions
}

export function blankDraft(): DraftQuestion {
  return {
    id: uid(),
    questionText: '',
    options: OPTION_KEYS.map((key) => ({ key, text: '' })),
    correctOption: 'A',
    explanation: null,
  }
}

/** Map a backend `AiDraftQuestion` (text/options[]/correctIndex) into the editor shape. */
export function toDraftQuestion(ai: {
  text: string
  options: string[]
  correctIndex: number
  explanation: string | null
}): DraftQuestion {
  const opts = ai.options.slice(0, 4)
  while (opts.length < 4) opts.push('')
  return {
    id: uid(),
    questionText: ai.text,
    options: opts.map((text, i) => ({ key: OPTION_KEYS[i], text })),
    correctOption: OPTION_KEYS[Math.min(Math.max(ai.correctIndex, 0), 3)],
    explanation: ai.explanation,
  }
}

export function generateMemoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return `QS-${code}`
}
