import i18n, { useTranslation } from '@release/translation'

const en = {
  title: 'Board debug',
  restart: 'Restart scenario',
  ready: 'Ready',
  opening: 'Preparing board',
  idle: 'No pending decision',
  opponentDiscard: 'Opponent discards first card',
  trace: 'Last action and engine events',
  // Shown only when they do not: the stand is a game or it is nothing, and a
  // game has the cards it has.
  cardsOff: 'cards do not add up',
  noAction: 'No action yet',
  viewerYou: 'View: attacker',
  viewerOpponent: 'View: opponent',
  viewerObserver: 'View: observer',
  advancePending: 'Resolve pending as its owner',
  branch: 'Branch + Merge + Sudo',
  securityRelease: 'Security Bug: attack a fresh release',
  securityHand: 'Security Bug: take a card from a hand',
  securityRequest: 'Security Bug: request',
  securityGive: 'Security Bug: duplicate hit',
  blindStealPlay: 'Bug: play and pick',
  blindSteal: 'Bug: blind pick',
  handDefense: 'Attack / defence centre',
  elimination: '503 → watch survivors',
  eliminationHint:
    'Draw Error 503. After the clip, advance the remaining bots one action at a time to finish the match.',
  nextBot: 'Next bot action',
  branchHint:
    'The pile cards, all in one hand: two Branch, one Merge and three Sudo. Split the pile, split it again, then put every pile back together — with or without a Sudo each time. Branch with Sudo also turns the discard into a pile of its own; Merge with Sudo takes the discard back in before shuffling.',
  securityReleaseHint:
    'The opponent has just played a release and its window is open. Attack it with Security Bug: the release moves into your own zone.',
  securityHandHint:
    'Your turn, nothing in any zone. Play Security Bug at the opponent hand and name a card — they hand it over, or they do not have it and the attack is spent.',
  securityRequestHint:
    'Request Hotfix. The opponent holds two copies. Change viewer to inspect each role.',
  securityGiveHint:
    'Name Hotfix to transfer the first matching copy automatically. Restart as observer and resolve the pending to inspect the public transfer.',
  blindStealPlayHint:
    'Pull Bug out of your hand onto the opponent, then pass for them with the pending control: their closed fan opens for you to pick from. Legacy Code and Out of Memory are in the hand too — the same effect on three cards — and so is Sudo.',
  blindStealHint:
    'Pick a position in the opponent closed fan. The observer must never learn the stolen face.',
  handDefenseHint:
    'Switch to the opponent and pull a defence over the staged attack, or take the hit. Their hand holds every defence card, one copy each.',
  release: 'Release into a zone',
  releaseCost: 'Release: pay a card',
  releaseCostHint:
    'Put Frontend down, then pull a hand card out of the fan to pay for it. The chosen card leaves the hand as its flight starts, stands beside the release, then goes to discard.',
  ddos: 'DDoS: the standing zone',
  alarm503: 'Error 503: the alarm',
  aiTrigger: 'AI trigger: a Crush',
  aiInside: 'AI trigger: Inside',
  ddosHint:
    'Your turn, five DDoS in hand, both opponent zones already standing. The first holds a Monitoring, a bare release and a release under Code Review; the second holds the AI pair — an AI Monitoring and an AI release. Throw one at each: a Monitoring is destroyed, a release goes back to its owner hand frozen for a round, a Code Review is discarded with the release it rode — and the AI cards go home to the events deck instead of the discard.',
  releaseHint:
    'Your turn, zones empty. Put the release down: it costs a card, so the table asks which one — it is shown open beside the release, goes to the discard, and only then does the release settle into its slot. Or play the release with Code Review, and that rides it instead of a card being spent. Monitoring is in the hand too: it goes into its own slot in the zone.',
  alarm503Hint:
    'Nothing drawn yet. Take a card from the pile: Error 503 turns up and the alarm stands. Answer it with the Debugger in hand or by sacrificing the release in your zone.',
  aiTriggerHint:
    'Nothing drawn yet. Take a card from the pile: the AI trigger reveals a Crush aimed at the release in your zone. Answer it with the Debugger, or sacrifice the release.',
  aiInsideHint:
    'Nothing drawn yet. Take a card from the pile: the AI trigger reveals Inside. The discard holds three releases and a Bug — pick one release from the row over the discard and confirm: it goes to your hand, the rest stay in the discard.',
  cherry: 'Cherry-pick',
  rebase: 'Rebase',
  upgrade: 'Upgrade',
  cherryFizzle: 'Cherry-pick: triggers only',
  rebaseFizzle: 'Rebase: empty pile',
  upgradeFizzle: 'Upgrade: empty opponent hands',
  cherryHint:
    'Pull Cherry-pick out of your hand, then choose a card from the discard grid. Sudo is in the hand too — combine them to choose a second card for the deck.',
  rebaseHint:
    'Pull Rebase out of your hand, reorder the offered top cards, then confirm. Sudo is in the hand too — combine them to reach every pile.',
  upgradeHint:
    'Pull Upgrade out of your hand — with or without the Sudo beside it, both are in the hand — then use the opponent discard control: every seat that owes a card gives one, and you choose from what they threw.',
  cherryFizzleHint:
    'Pull Cherry-pick out of your hand. The discard contains only a trigger, so there is no legal hand pick.',
  rebaseFizzleHint:
    'Pull Rebase out of your hand. The draw pile is empty, so there is nothing to reorder.',
  upgradeFizzleHint: 'Pull Upgrade out of your hand. The opponent has no cards to discard.',
}
const ru: Record<keyof typeof en, string> = {
  elimination: '503 → наблюдать за оставшимися',
  eliminationHint:
    'Доберите Error 503. После ролика выполняйте следующие действия ботов, чтобы доиграть партию.',
  nextBot: 'Следующее действие бота',
  title: 'Отладка стола',
  restart: 'Перезапустить сценарий',
  ready: 'Готово',
  opening: 'Подготовка стола',
  idle: 'Нет ожидающего решения',
  opponentDiscard: 'Соперник сбрасывает первую карту',
  trace: 'Последнее действие и события движка',
  cardsOff: 'карты не сходятся',
  noAction: 'Действий пока нет',
  viewerYou: 'Вид: атакующий',
  viewerOpponent: 'Вид: соперник',
  viewerObserver: 'Вид: наблюдатель',
  advancePending: 'Выполнить решение за его владельца',
  branch: 'Branch + Merge + Sudo',
  securityRelease: 'Security Bug: атака свежего релиза',
  securityHand: 'Security Bug: забрать карту с руки',
  securityRequest: 'Security Bug: запрос',
  securityGive: 'Security Bug: две копии',
  blindStealPlay: 'Bug: розыгрыш и выбор',
  blindSteal: 'Bug: закрытый выбор',
  handDefense: 'Атака / защита в центре',
  branchHint:
    'Карты колод в одной руке: два Branch, один Merge и три Sudo. Разделите колоду, разделите ещё раз, потом соберите все колоды обратно — каждый раз с Sudo или без. Branch с Sudo ещё и превращает сброс в отдельную колоду; Merge с Sudo забирает сброс в общую стопку перед перемешиванием.',
  securityReleaseHint:
    'Соперник только что выложил релиз, окно по нему открыто. Ударьте по нему Security Bug: релиз переедет в вашу зону.',
  securityHandHint:
    'Ваш ход, в зонах пусто. Разыграйте Security Bug по руке соперника и назовите карту — он её отдаст, либо её у него нет и атака просто тратится.',
  securityRequestHint:
    'Запросите Hotfix. У соперника две копии. Меняйте вид для проверки всех ролей.',
  securityGiveHint:
    'Запрос Hotfix успешен. Переключитесь на соперника и вытяните одну из двух копий из руки; перезапустите для проверки других ролей.',
  blindStealPlayHint:
    'Вытяните Bug из руки на соперника, затем выполните за него решение «пас» — откроется его закрытый веер для выбора. Legacy Code и Out of Memory тоже в руке — это тот же эффект на трёх картах, — и Sudo там же.',
  blindStealHint:
    'Выберите позицию в закрытом веере соперника. Наблюдатель не должен узнать украденную карту.',
  handDefenseHint:
    'Переключитесь на соперника и вытяните защиту поверх атаки или примите удар. В его руке все карты защиты, по одной копии.',
  release: 'Релиз в зону',
  releaseCost: 'Релиз: оплатить картой',
  releaseCostHint:
    'Выложите Frontend, затем вытяните карту из руки для оплаты. Выбранная карта покидает руку с началом перелёта, ложится рядом с релизом и уходит в сброс.',
  ddos: 'DDoS: зона соперника',
  alarm503: 'Error 503: тревога',
  aiTrigger: 'Триггер AI: Crush',
  aiInside: 'Триггер AI: Inside',
  ddosHint:
    'Ваш ход, пять DDoS в руке, зоны обоих соперников уже стоят. У первого мониторинг, обычный релиз и релиз под Code Review; у второго пара AI — мониторинг AI и релиз AI. Бросьте по одной в каждую цель: мониторинг уничтожается, релиз уходит владельцу в руку и заморожен на раунд, Code Review уходит в сброс вместе с релизом, а карты AI возвращаются в колоду событий, а не в сброс.',
  releaseHint:
    'Ваш ход, зоны пусты. Выложите релиз: он стоит карту, и стол спросит какую — она ложится открыто рядом с релизом, уходит в сброс, и только после этого релиз садится в свой слот. Либо разыграйте релиз с Code Review — тогда он ляжет под релиз вместо оплаты картой. Мониторинг тоже в руке: он занимает свой слот в зоне.',
  alarm503Hint:
    'Добора ещё не было. Возьмите карту из колоды: выпадет Error 503 и тревога встанет. Ответьте Debugger из руки или пожертвуйте релизом из своей зоны.',
  aiTriggerHint:
    'Добора ещё не было. Возьмите карту из колоды: триггер AI откроет Crush, нацеленный на релиз в вашей зоне. Ответьте Debugger или пожертвуйте релизом.',
  aiInsideHint:
    'Добора ещё не было. Возьмите карту из колоды: триггер AI откроет Inside. В сбросе три релиза и Bug — выберите релиз в ряду над сбросом и подтвердите: он уйдёт в руку, остальные останутся в сбросе.',
  cherry: 'Cherry-pick',
  rebase: 'Rebase',
  upgrade: 'Upgrade',
  cherryFizzle: 'Cherry-pick: только триггеры',
  rebaseFizzle: 'Rebase: пустая колода',
  upgradeFizzle: 'Upgrade: пустые руки соперников',
  cherryHint:
    'Вытяните Cherry-pick из руки, затем выберите карту в сетке сброса. Sudo тоже в руке — объедините их, чтобы выбрать вторую карту на колоду.',
  rebaseHint:
    'Вытяните Rebase из руки, упорядочьте предложенные верхние карты и подтвердите. Sudo тоже в руке — объедините их, чтобы достать все колоды.',
  upgradeHint:
    'Вытяните Upgrade из руки — с Sudo рядом или без него, обе карты в руке, — затем нажмите кнопку сброса: каждый обязанный соперник отдаёт карту, и вы выбираете из сброшенного.',
  cherryFizzleHint:
    'Вытяните Cherry-pick из руки. В сбросе только триггер, поэтому взять карту в руку нельзя.',
  rebaseFizzleHint: 'Вытяните Rebase из руки. Колода пуста, переставлять нечего.',
  upgradeFizzleHint: 'Вытяните Upgrade из руки. Ни у кого из соперников нет карт для сброса.',
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
