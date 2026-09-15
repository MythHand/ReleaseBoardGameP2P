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
  viewerYou: 'View: attacker',
  viewerOpponent: 'View: opponent',
  viewerObserver: 'View: observer',
  advancePending: 'Resolve pending as its owner',
  branch: 'Branch → 2 piles',
  branchSudo: 'Branch + Sudo → 3 piles',
  securityRequest: 'Security Bug: request',
  securityGive: 'Security Bug: duplicate hit',
  blindSteal: 'Bug: blind pick',
  handDefense: 'Attack / defence centre',
  branchHint: 'Pull Branch out of your hand: one draw pile splits into two.',
  branchSudoHint: 'Combine Branch with Sudo: the split and flipped discard produce three piles.',
  securityRequestHint:
    'Request Hotfix. The opponent holds two copies. Change viewer to inspect each role.',
  securityGiveHint:
    'A Hotfix request has hit. Switch to the opponent and pull either matching copy out of the hand; restart to inspect the other roles.',
  blindStealHint:
    'Pick a position in the opponent closed fan. The observer must never learn the stolen face.',
  handDefenseHint:
    'Switch to the opponent and pull Hotfix over the staged attack, or take the hit.',
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
  viewerYou: 'Вид: атакующий',
  viewerOpponent: 'Вид: соперник',
  viewerObserver: 'Вид: наблюдатель',
  advancePending: 'Выполнить решение за его владельца',
  branch: 'Branch → 2 колоды',
  branchSudo: 'Branch + Sudo → 3 колоды',
  securityRequest: 'Security Bug: запрос',
  securityGive: 'Security Bug: две копии',
  blindSteal: 'Bug: закрытый выбор',
  handDefense: 'Атака / защита в центре',
  branchHint: 'Вытяните Branch из руки: одна колода разделится на две.',
  branchSudoHint: 'Объедините Branch с Sudo: разделение и переворот сброса дадут три колоды.',
  securityRequestHint:
    'Запросите Hotfix. У соперника две копии. Меняйте вид для проверки всех ролей.',
  securityGiveHint:
    'Запрос Hotfix успешен. Переключитесь на соперника и вытяните одну из двух копий из руки; перезапустите для проверки других ролей.',
  blindStealHint:
    'Выберите позицию в закрытом веере соперника. Наблюдатель не должен узнать украденную карту.',
  handDefenseHint: 'Переключитесь на соперника и вытяните Hotfix поверх атаки или примите удар.',
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
