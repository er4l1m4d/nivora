import type { OptionKey } from '@/api/types'
import { Icon } from './Icon'

interface OptionButtonProps {
  optionKey: OptionKey
  text: string
  /** currently selected by the player (pre-confirm) */
  selected: boolean
  /** reveal state after confirm */
  reveal?: 'correct' | 'wrong' | 'missed'
  disabled?: boolean
  /** grow to share a flex column's height (fit-to-screen play layout) */
  fill?: boolean
  onSelect: (key: OptionKey) => void
}

const KEY_LETTERS: Record<OptionKey, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
}

export function OptionButton({
  optionKey,
  text,
  selected,
  reveal,
  disabled = false,
  fill = false,
  onSelect,
}: OptionButtonProps) {
  const base =
    'flex w-full items-center gap-3 rounded-card border-2 p-4 text-left transition-all duration-150'

  const state = (() => {
    if (reveal === 'correct') return 'border-success bg-success-soft'
    if (reveal === 'wrong') return 'border-danger bg-danger-soft'
    if (reveal === 'missed') return 'border-line bg-paper-deep opacity-70'
    if (selected) return 'border-ink bg-volt shadow-press-sm'
    return 'border-line bg-surface hover:border-ink active:translate-y-0.5'
  })()

  const keyBadge = (() => {
    if (reveal === 'correct') return 'border-success bg-success text-white'
    if (reveal === 'wrong') return 'border-danger bg-danger text-white'
    if (selected) return 'border-ink bg-ink text-volt'
    return 'border-line bg-surface text-ink-soft'
  })()

  const icon = (() => {
    if (reveal === 'correct') return <Icon name="check" size={16} weight="bold" />
    if (reveal === 'wrong') return <Icon name="x" size={16} weight="bold" />
    return KEY_LETTERS[optionKey]
  })()

  return (
    <button
      type="button"
      className={`${base} ${fill ? 'min-h-12 flex-1' : 'min-h-14'} ${state} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      disabled={disabled}
      onClick={() => onSelect(optionKey)}
      aria-pressed={selected}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border-2 font-display text-sm font-extrabold ${keyBadge}`}
      >
        {icon}
      </span>
      <span className="text-[15px] font-medium text-ink">{text}</span>
    </button>
  )
}
