import type { PlayerQuestion } from '@/api/types'

/**
 * Given the player's questions and the ids they've already answered, return the
 * index of the first question still unanswered. Used to resume a player's
 * session after a disconnect (Track F.2).
 */
export function firstUnansweredIndex(questions: PlayerQuestion[], answeredIds: string[]): number {
  const answered = new Set(answeredIds)
  const idx = questions.findIndex((q) => !answered.has(q.id))
  return idx < 0 ? Math.max(0, questions.length - 1) : idx
}
