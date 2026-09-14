import { describe, expect, it } from 'vitest'
import { firstUnansweredIndex } from './resume'
import type { PlayerQuestion } from '@/api/types'

const q = (id: string): PlayerQuestion => ({
  id,
  position: Number(id),
  questionText: `Q ${id}`,
  options: [
    { key: 'A', text: 'a' },
    { key: 'B', text: 'b' },
  ],
})

describe('firstUnansweredIndex', () => {
  const questions = [q('1'), q('2'), q('3')]

  it('starts at 0 when nothing answered', () => {
    expect(firstUnansweredIndex(questions, [])).toBe(0)
  })

  it('resumes at the first gap', () => {
    expect(firstUnansweredIndex(questions, ['1'])).toBe(1)
    expect(firstUnansweredIndex(questions, ['1', '2'])).toBe(2)
  })

  it('skips already-answered ids regardless of order', () => {
    expect(firstUnansweredIndex(questions, ['3', '1'])).toBe(1)
  })

  it('falls back to the last question when all answered', () => {
    expect(firstUnansweredIndex(questions, ['1', '2', '3'])).toBe(2)
  })
})
