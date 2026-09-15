import i18n, { useTranslation } from '@release/translation'

const en = {
  title: 'Board debug',
  restart: 'Restart scenario',
  ready: 'Ready',
  opening: 'Preparing board',
  idle: 'No pending decision',
  opponentDiscard: 'Opponent discards first card',
  trace: 'Last action and engine events',
  noAction: 'No action yet',
  cherry: 'Cherry-pick',
  cherrySudo: 'Cherry-pick + Sudo',
  rebase: 'Rebase',
  rebaseSudo: 'Rebase + Sudo',
  upgrade: 'Upgrade',
  upgradeSudo: 'Upgrade + Sudo',
  cherryFizzle: 'Cherry-pick: triggers only',
  rebaseFizzle: 'Rebase: empty pile',
  upgradeFizzle: 'Upgrade: empty opponent hand',
  cherryHint: 'Pull Cherry-pick out of your hand, then choose a card from the discard grid.',
  cherrySudoHint:
    'Combine Sudo with Cherry-pick, then choose a card for your hand and another for the deck.',
  rebaseHint: 'Pull Rebase out of your hand, reorder the offered top cards, then confirm.',
  rebaseSudoHint:
    'Combine Sudo with Rebase, reorder the offered top cards from both piles, then confirm.',
  upgradeHint:
    'Pull Upgrade out of your hand, then use the opponent discard control to complete the effect.',
  upgradeSudoHint:
    'Combine Sudo with Upgrade, use the opponent discard control, then choose the thrown card.',
  cherryFizzleHint:
    'Pull Cherry-pick out of your hand. The discard contains only a trigger, so there is no legal hand pick.',
  rebaseFizzleHint:
    'Pull Rebase out of your hand. The draw pile is empty, so there is nothing to reorder.',
  upgradeFizzleHint: 'Pull Upgrade out of your hand. The opponent has no cards to discard.',
}
const ru: Record<keyof typeof en, string> = {
  title: 'Отладка стола',
  restart: 'Перезапустить сценарий',
  ready: 'Готово',
  opening: 'Подготовка стола',
  idle: 'Нет ожидающего решения',
  opponentDiscard: 'Соперник сбрасывает первую карту',
  trace: 'Последнее действие и события движка',
  noAction: 'Действий пока нет',
  cherry: 'Cherry-pick',
  cherrySudo: 'Cherry-pick + Sudo',
  rebase: 'Rebase',
  rebaseSudo: 'Rebase + Sudo',
  upgrade: 'Upgrade',
  upgradeSudo: 'Upgrade + Sudo',
  cherryFizzle: 'Cherry-pick: только триггеры',
  rebaseFizzle: 'Rebase: пустая колода',
  upgradeFizzle: 'Upgrade: пустая рука соперника',
  cherryHint: 'Вытяните Cherry-pick из руки, затем выберите карту в сетке сброса.',
  cherrySudoHint: 'Объедините Sudo с Cherry-pick, затем выберите карту в руку и другую на колоду.',
  rebaseHint: 'Вытяните Rebase из руки, упорядочьте предложенные верхние карты и подтвердите.',
  rebaseSudoHint: 'Объедините Sudo с Rebase, упорядочьте верхние карты обеих колод и подтвердите.',
  upgradeHint:
    'Вытяните Upgrade из руки, затем нажмите кнопку сброса соперника для завершения эффекта.',
  upgradeSudoHint:
    'Объедините Sudo с Upgrade, нажмите кнопку сброса соперника, затем выберите сброшенную карту.',
  cherryFizzleHint:
    'Вытяните Cherry-pick из руки. В сбросе только триггер, поэтому взять карту в руку нельзя.',
  rebaseFizzleHint: 'Вытяните Rebase из руки. Колода пуста, переставлять нечего.',
  upgradeFizzleHint: 'Вытяните Upgrade из руки. У соперника нет карт для сброса.',
}

i18n.addResourceBundle('en', 'debug', en)
i18n.addResourceBundle('ru', 'debug', ru)

// This namespace exists only in the debug entry. Keep its typed keys local so
// neither its catalog nor a declaration augmenting it enters the shipped app.
const translate = i18n.getFixedT(null, 'debug' as never) as unknown as (
  key: keyof typeof en,
) => string

export function useDebugCopy() {
  useTranslation()
  return translate
}
