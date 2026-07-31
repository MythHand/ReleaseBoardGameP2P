// Mock legality functions retired from @release/ui.
// These were the UI's guess at legality (cardCanTarget, isComboSource, validComboTarget).
// The engine now supplies the canonical answers: state.playable, actions.legalTargets(card),
// comboOptions, and window.canAttackWith. These functions remain only to keep ComboStory,
// a design-exploration story with no engine behind it, working.

import type { CardData } from '@release/ui'

// Мок логики: может ли карта выбирать цель (атаки — да). Реально решает логика друга.
export const cardCanTarget = (card?: CardData): boolean => !!card?.tags?.includes('lightning')

// Мок логики комбо «две карты как одно действие» (Sudo / Code Review).
export const isComboSource = (card?: CardData): boolean => !!card?.tags?.includes('combo-source')

export const validComboTarget = (source?: CardData, target?: CardData): boolean => {
  if (!source || !target || source.id === target.id) return false
  if (source.id === 'support-sudo') return !!target.tags?.includes('sudo')
  if (source.id === 'support-code-review') return target.category === 'release'
  return false
}
