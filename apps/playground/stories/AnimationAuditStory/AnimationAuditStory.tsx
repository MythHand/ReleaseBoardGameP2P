import { type ReactNode, useState } from 'react'
import { type Lang, useLang } from '../../Playground/lang'
import styles from './AnimationAuditStory.module.css'

// ANIMATION AUDIT — the source of state for animation work (a map, not an
// interactive demo). Three tables:
//   1. Ready modules — building blocks (animation atoms), with statuses.
//   2. Scenario combinations — how the blocks assemble for game situations.
//      A scenario is a sequence, not a module: it isn't formalized separately,
//      so it has NO statuses, only what is already implemented.
//   3. Needs rework — where it's off, with statuses (rework / reuse).
// Change the animations — update this page.
//
// Language: technical names (module ids, file paths, rect/FLIP/move/fade/DOM…)
// stay English in both languages; descriptive prose is bilingual via useLang().
type Loc = Record<Lang, string>
type Status = 'ok' | 'rework' | 'reuse'

const STATUS: Record<Status, { cls: string; label: Loc }> = {
  ok: { cls: styles.ok, label: { ru: 'оформлено', en: 'done' } },
  rework: { cls: styles.rework, label: { ru: 'доработать', en: 'rework' } },
  reuse: { cls: styles.reuse, label: { ru: 'есть готовое', en: 'reuse' } },
}

interface Module {
  mod: string
  what: Loc
  where: Loc
  status: Status
}
interface Scenario {
  name: Loc
  from: Loc
  where: string
}
interface Issue {
  what: Loc
  problem: Loc
  where: Loc
  status: Status
}

// ===== 1. Ready modules — building blocks =====
const MODULES: Module[] = [
  {
    mod: 'move()',
    what: {
      ru: 'Базовый travel: перелёт из rect в rect — translate по центрам + scale по ширине + финальные rotate/dx/dy. Основа всех полётов карт.',
      en: 'Base travel: a flight from rect to rect — translate by centers + scale by width + final rotate/dx/dy. The foundation of every card flight.',
    },
    where: { ru: 'animations/presets.ts (внутр.)', en: 'animations/presets.ts (internal)' },
    status: 'ok',
  },
  {
    mod: "play('flipCard')",
    what: {
      ru: 'Переворот карты лицо↔рубашка (rotateY).',
      en: 'Card flip face↔back (rotateY).',
    },
    where: { ru: 'словарь → Card', en: 'registry → Card' },
    status: 'ok',
  },
  {
    mod: "play('shake')",
    what: {
      ru: 'Тряска влево-вправо — фидбек «поле не заполнено». Разовый триггер по событию (как flipCard): затухающая амплитуда, возврат в исходную точку. Перезапускается на повторный вызов.',
      en: 'Left-right shake — the "field is empty" feedback. A one-shot event trigger (like flipCard): decaying amplitude, returns to the start point. Restarts on a repeat call.',
    },
    where: {
      ru: 'словарь → Invite, Start (модалка входа)',
      en: 'registry → Invite, Start (entry modal)',
    },
    status: 'ok',
  },
  {
    mod: "play('playToCenter')",
    what: {
      ru: 'Выкладывание карты в центр стола (move, 480/ease).',
      en: 'Playing a card to the table center (move, 480/ease).',
    },
    where: { ru: 'словарь → CardPlay, DeckAnimations', en: 'registry → CardPlay, DeckAnimations' },
    status: 'ok',
  },
  {
    mod: "play('playToReleaseZone')",
    what: {
      ru: 'Карта в слот зоны релиза (move, 480, снап-приземление).',
      en: 'A card into a release-zone slot (move, 480, snap landing).',
    },
    where: { ru: 'словарь → Combo', en: 'registry → Combo' },
    status: 'ok',
  },
  {
    mod: "play('centerToDiscard')",
    what: {
      ru: 'Из центра в сброс с разворотом и разбросом (move, 420).',
      en: 'From the center to the discard with a turn and scatter (move, 420).',
    },
    where: {
      ru: 'словарь → CardPlay, Combo, DeckAnimations, CherryPick',
      en: 'registry → CardPlay, Combo, DeckAnimations, CherryPick',
    },
    status: 'ok',
  },
  {
    mod: "play('flyFrom')",
    what: {
      ru: 'FLIP-вылет: элемент уже на новом месте, анимируем его «из» прошлого rect в текущую позицию. Появление новой колоды/карты из источника.',
      en: 'FLIP fly-in: the element is already in its new place, we animate it "from" the previous rect to the current position. A new deck/card appearing from a source.',
    },
    where: {
      ru: 'словарь → DeckAnimations, Animations',
      en: 'registry → DeckAnimations, Animations',
    },
    status: 'ok',
  },
  {
    mod: "play('gatherToDeck')",
    what: {
      ru: 'Стопка летит к целевой стопке и приземляется (сброс → новая колода). move, центр-в-центр.',
      en: 'A pile flies to the target pile and lands (discard → new deck). move, center-to-center.',
    },
    where: { ru: 'словарь → DeckAnimations', en: 'registry → DeckAnimations' },
    status: 'ok',
  },
  {
    mod: "play('absorbToDeck')",
    what: {
      ru: 'Поглощение: стопка/колода летит в целевую и растворяется по ходу (слияние колод). move + fade.',
      en: 'Absorption: a pile/deck flies into the target and dissolves along the way (merging decks). move + fade.',
    },
    where: { ru: 'словарь → DeckAnimations', en: 'registry → DeckAnimations' },
    status: 'ok',
  },
  {
    mod: "play('drawToCenter')",
    what: {
      ru: 'Карта выходит из колоды добора в центр стола. Отдельно от playToCenter — у добора своя вариативность (число карт, спец-механики).',
      en: 'A card comes out of the draw deck to the table center. Separate from playToCenter — drawing has its own variability (card count, special mechanics).',
    },
    where: { ru: 'словарь → DrawCard', en: 'registry → DrawCard' },
    status: 'ok',
  },
  {
    mod: "play('dealToSeat')",
    what: {
      ru: 'Карта из центра уходит к месту игрока и растворяется в скрытой руке (move + fade).',
      en: 'A card leaves the center for a player seat and dissolves into the hidden hand (move + fade).',
    },
    where: { ru: 'словарь → DrawCard', en: 'registry → DrawCard' },
    status: 'ok',
  },
  {
    mod: "play('returnToDeck')",
    what: {
      ru: 'Карта возвращается из центра обратно в колоду (центр→колода) с уменьшением до размера колоды. Парный к drawToCenter.',
      en: 'A card returns from the center back to the deck (center→deck), shrinking to the deck size. The pair of drawToCenter.',
    },
    where: { ru: 'словарь → DrawCard', en: 'registry → DrawCard' },
    status: 'ok',
  },
  {
    mod: 'useArrow() + centerOf()',
    what: {
      ru: 'Геометрия адресной стрелки: точки from/to, слежение за курсором, старт/стоп.',
      en: 'Targeting-arrow geometry: from/to points, cursor tracking, start/stop.',
    },
    where: {
      ru: 'primitives/Arrow → Arrow, Combo, DeckAnimations',
      en: 'primitives/Arrow → Arrow, Combo, DeckAnimations',
    },
    status: 'ok',
  },
  {
    mod: 'CardPair',
    what: {
      ru: 'Визуальный атом пары: вспомогательная карта подтыкается под основную под углом.',
      en: 'The visual atom of a pair: a helper card tucks under the main one at an angle.',
    },
    where: {
      ru: 'primitives/CardPair → Combo, DeckAnimations',
      en: 'primitives/CardPair → Combo, DeckAnimations',
    },
    status: 'ok',
  },
  {
    mod: 'EdgeGlow',
    what: {
      ru: 'Краевое свечение контейнера внутрь (инсет-вуаль) с плавным fade появления/затухания (CSS-transition). Два варианта силы: strong (стол игрока) / weak (место соперника). Цвет/интенсивность — пропсами.',
      en: 'Inward edge glow of a container (inset veil) with a smooth fade in/out (CSS-transition). Two strength variants: strong (player table) / weak (opponent seat). Color/intensity via props.',
    },
    where: {
      ru: 'primitives/EdgeGlow → DrawCard (тревога Error 503), UI KIT',
      en: 'primitives/EdgeGlow → DrawCard (Error 503 alarm), UI KIT',
    },
    status: 'ok',
  },
  {
    mod: 'scatterAt() / restTransform() / toDiscardParams()',
    what: {
      ru: 'Единый источник «как карта ложится и лежит в куче сброса». Разброс (угол + смещение долями ширины карты) считается ОДИН раз по ключу карты (scatterAt — детерминирован, стабилен между ре-рендерами и пирами); полёт (toDiscardParams) и покой (restTransform) читают его же → карта приземляется ровно туда, где лежит, без подмены позиции в финале. jitter() — разовый случайный вариант. HEAP_SHOW — сколько верхних карт видно, нижние гаснут. Аналог slotPlacement() для веера руки.',
      en: 'The single source of "how a card lands in and rests in the discard heap". Scatter (tilt + offset as fractions of card width) is computed ONCE by card key (scatterAt — deterministic, stable across re-renders and peers); the flight (toDiscardParams) and the rest (restTransform) read the same one → a card lands exactly where it rests, no position swap on the last frame. jitter() is the one-off random variant. HEAP_SHOW — how many top cards stay visible, the rest fade. The discard counterpart of slotPlacement() for the hand fan.',
    },
    where: {
      ru: 'animations/scatter → CherryPick, Combo, CardPlay, DeckAnimations',
      en: 'animations/scatter → CherryPick, Combo, CardPlay, DeckAnimations',
    },
    status: 'ok',
  },
  {
    mod: 'nextFrames()',
    what: {
      ru: 'Двойной requestAnimationFrame — дождаться отрисовки нового узла перед стартом анимации.',
      en: 'A double requestAnimationFrame — wait for the new node to paint before starting the animation.',
    },
    where: {
      ru: 'animations/timing → Combo, CardPlay, DeckAnimations, DrawCard',
      en: 'animations/timing → Combo, CardPlay, DeckAnimations, DrawCard',
    },
    status: 'ok',
  },
  {
    mod: 'wait(ms)',
    what: {
      ru: 'Пауза-таймер для держания фаз между анимациями.',
      en: 'A pause timer to hold phases between animations.',
    },
    where: {
      ru: 'animations/timing → Combo, CardPlay, DeckAnimations, DrawCard, Animations',
      en: 'animations/timing → Combo, CardPlay, DeckAnimations, DrawCard, Animations',
    },
    status: 'ok',
  },
  {
    mod: 'slotPlacement() / handStep()',
    what: {
      ru: 'Единый источник геометрии веера руки: наклон, дуга, ширина и шаг-от-кол-ва карт. Раскладка слотов в Hand и приземление вставки считаются по ОДНОЙ формуле — без копий, которые разъезжаются при тюнинге.',
      en: 'The single source of hand-fan geometry: tilt, arc, width and step-from-card-count. The slot layout in Hand and the insert landing are computed by ONE formula — no copies that drift apart under tuning.',
    },
    where: {
      ru: 'table/Hand/fan → Hand, useHandInsert',
      en: 'table/Hand/fan → Hand, useHandInsert',
    },
    status: 'ok',
  },
  {
    mod: 'useHandInsert()',
    what: {
      ru: 'Карта «встаёт в руку»: рука раздвигает зазор, карта подгоняет размер и садится в bottom-center слота. Место слота берёт из table/Hand/fan (slotPlacement).',
      en: 'A card "settles into the hand": the hand opens a gap, the card matches size and sits at the slot bottom-center. The slot position comes from table/Hand/fan (slotPlacement).',
    },
    where: {
      ru: 'stories/interactive → DrawCard, CardToHand, PickOpponentCard, CherryPick, SystemUpgrade, AiCards, DefenseRelease',
      en: 'stories/interactive → DrawCard, CardToHand, PickOpponentCard, CherryPick, SystemUpgrade, AiCards, DefenseRelease',
    },
    status: 'ok',
  },
  {
    mod: 'useDiscardExit()',
    what: {
      ru: 'Карты уходят со стола в сброс: по одной, но ВСЕ СРАЗУ — одновременность и читается как «стопка ушла». Пара распадается на две одиночки, каждая летит из своего настоящего места. Один разброс на карту ведёт и полёт, и покой (I7). Наклон стола раскручивается В ПОЛЁТЕ. Слой со стола едет с картой и решает порядок добавления в кучу — снизу вверх (I9). Умеет: свой разброс (карта возвращается на своё место), растворение (уходит под видимый верх кучи), стаггер, и полёт уже существующим элементом вместо своего флаера.',
      en: 'Cards leave the table for the discard: one by one but ALL AT ONCE — the simultaneity is what reads as "the pile went to the discard". A pair splits into two singles, each flying from where it actually stands. One scatter per card drives both its flight and its rest (I7). The table tilt unwinds IN FLIGHT. The layer a card had travels with it and decides the order it joins the heap — bottom-up (I9). Supports: a card\'s own scatter (going back to its place), fading (sinking under the visible top), a stagger, and flying an element that already exists instead of raising a flyer.',
    },
    where: {
      ru: 'stories/interactive → все 10 сцен со сбросом',
      en: 'stories/interactive → all 10 scenes with a discard',
    },
    status: 'ok',
  },
  {
    mod: 'useHandReturn()',
    what: {
      ru: 'Отмена розыгрыша: сборка со стола возвращается в руку ВСЯ РАЗОМ — розыгрыш был одним действием, отмена тоже одно. Приземляется в СЕРЕДИНУ веера (как любая другая вставка), веер раздвигается ПОКА карты летят. Каждая целится в свой будущий слот и садится на его нижний центр. Пара — снова две карты, каждая от своего якоря.',
      en: 'Undo of a play: the staging comes back into the hand ALL AT ONCE — the play was one act, so undoing it is one act too. It lands in the MIDDLE of the fan (like every other insert), and the fan opens the gap WHILE the cards travel. Each card aims at the slot it will occupy and sits on its bottom centre. A pair is two cards again, each from its own anchor.',
    },
    where: {
      ru: 'stories/interactive → Combo, DeckAnimations',
      en: 'stories/interactive → Combo, DeckAnimations',
    },
    status: 'ok',
  },
  {
    mod: 'Pile (heap)',
    what: {
      ru: 'Сброс как наброшенная КУЧА, а не ровная стопка: карты лежат каждая со своим разбросом (scatterAt/restTransform), под ними «глубина» стопки — и она показывается только когда под видимыми картами реально что-то есть. Отдаёт наружу коробку карты (boxRef) — в неё целятся полёты, и собранное состояние (gathered) — когда сброс превращается в колоду. Счётчик стоит на ступень ВЫШЕ полёта: прилетающая карта проходит под ним, а не накрывает и потом ныряет вниз — поэтому место стопки на столе нельзя центрировать трансформом (он запер бы бейдж внутри).',
      en: "The discard as a tossed HEAP, not a neat stack: every card lies at its own scatter (scatterAt/restTransform), with the pile depth beneath — shown only when something is actually hidden under the visible cards. Exposes the card box (boxRef) for flights to aim at, and the gathered state for when the discard turns into a deck. The counter sits one rung ABOVE the flight: an arriving card passes under it instead of covering it and then dropping beneath — which is why a pile's place on the table must not be centred with a transform (that would trap the badge inside the wrapper).",
    },
    where: {
      ru: 'primitives/Pile → Table + все сцены',
      en: 'primitives/Pile → Table + every scene',
    },
    status: 'ok',
  },
  {
    mod: "play('rollOut' / 'rollIn')",
    what: {
      ru: 'Подмена содержимого слота чистым фейдом по opacity — БЕЗ движения. dur — длительность; delay (только у in) держит новое невидимым, пока старое не ушло (последовательное появление имени). Оркестрируется компонентом Swap: живой слой в потоке + уходящий абсолютом поверх (без сетки).',
      en: 'Swap a slot’s content with a plain opacity fade — NO movement. dur — duration; delay (in only) holds the incoming invisible until the outgoing clears (sequential name entrance). Orchestrated by the Swap component: a live layer in flow + the outgoing one absolutely overlaid (no grid).',
    },
    where: { ru: 'словарь → TurnDock/Swap', en: 'registry → TurnDock/Swap' },
    status: 'ok',
  },
  {
    mod: "play('popIn' / 'popOut')",
    what: {
      ru: 'Появление/уход маленького элемента в зарезервированном слоте (fade + масштаб), без сдвига соседей. Оркестрируется компонентом Reveal.',
      en: 'Appear/disappear of a small element in a reserved slot (fade + scale), without shifting neighbours. Orchestrated by the Reveal component.',
    },
    where: {
      ru: 'словарь → TurnDock/Reveal («drawn»-бейдж)',
      en: 'registry → TurnDock/Reveal (the “drawn” badge)',
    },
    status: 'ok',
  },
  {
    mod: 'Hand (canonical)',
    what: {
      ru: 'Интерактивный веер: ховер (подъём + расступание + отдельный зум-превью), взять-потянуть (наружу — розыгрыш, внутри — перестановка), порог клик/drag, settle-back с transform-origin bottom-center. Всё внутри компонента; наружу — данные и колбэки намерения (onPlay/onReorder/onCardClick/stateAt).',
      en: 'The interactive fan: hover (lift + spread + a separate zoom preview), pick-up & drag (out → play, inside → reorder), a click/drag threshold, settle-back with transform-origin bottom-center. All internal; the consumer supplies data and intent callbacks (onPlay/onReorder/onCardClick/stateAt).',
    },
    where: { ru: 'table/Hand → все руки', en: 'table/Hand → every hand' },
    status: 'ok',
  },
  {
    mod: 'ConfirmAction',
    what: {
      ru: 'Общий слайд-бар подтверждения выбора: заезжает по open, прижат к низу контейнера, опциональная подпись. Презентационный, i18n-agnostic.',
      en: 'The shared confirm-the-selection bar: slides up on open, pinned to the bottom of its container, an optional caption. Presentational, i18n-agnostic.',
    },
    where: {
      ru: 'table/ConfirmAction → CherryPick, AI cards (Inside)',
      en: 'table/ConfirmAction → CherryPick, AI cards (Inside)',
    },
    status: 'ok',
  },
]

// ===== 2. Scenario combinations — sequences per situation (no statuses) =====
// The middle column is technical: modules + key implementation points
// (rect measurements, FLIP, DOM order, key-remount, fixes), not a summary.
const SCENARIOS: Scenario[] = [
  {
    name: { ru: 'Розыгрыш карты', en: 'Playing a card' },
    from: {
      ru: 'flyer (fixed) от rect карты → playToCenter (move 480, EASE) по центрам; wait — удержание; nextFrames перед стартом, чтобы новый узел успел отрисоваться; затем centerToDiscard (move 420) + jitter() на финальные rotate/dx/dy разброса.',
      en: 'flyer (fixed) from the card rect → playToCenter (move 480, EASE) by centers; wait — hold; nextFrames before start so the new node can paint; then centerToDiscard (move 420) + jitter() for the final scatter rotate/dx/dy.',
    },
    where: 'CardPlay, DeckAnimations',
  },
  {
    name: { ru: 'Переход состояния TurnDock', en: 'TurnDock state transition' },
    from: {
      ru: 'один фиксированный каркас, слоты не двигаются. Ключ/имя — ОДНА фикс-ширина (≈ «добор» + 18px с каждой стороны), не ресайзится и не прыгает. Текст (фаза, метка ключа, ник) — чистый фейд rollOut→rollIn через Swap, без движения. Держит рамку кнопки, меняется только метка + акцент (CSS-transition на --btn-accent). Имя соперника (первый вход и смена ника подряд) появляется одинаково: ждёт ухода предыдущего (delayIn), потом проявляется. «drawn»-бейдж — popIn/popOut (Reveal). Кольцо и точка стоят на месте: только морф акцента (transition на stroke/--dot) + дозаполнение кольца до полного (progress→1 при смене фазы).',
      en: 'one fixed frame, slots never move. Key/name — ONE fixed width (≈ the «добор» key + 18px each side), never resizes or jumps. Text (phase, key label, nick) — a plain opacity fade rollOut→rollIn via Swap, no movement. The button frame stays, only the label + accent change (CSS transition on --btn-accent). The opponent name (first entry and successive nick changes alike) appears the same way: it waits for the previous to clear (delayIn), then fades in. The “drawn” badge — popIn/popOut (Reveal). Ring and dot stay put: only the accent morphs (transition on stroke/--dot) + the ring fills back to full (progress→1 on a phase change).',
    },
    where: 'TurnDock (Swap, Reveal), RingTimer, StatusDot, Button hud',
  },
  {
    name: { ru: 'Розыгрыш комбо (пара)', en: 'Playing a combo (pair)' },
    from: {
      ru: 'useArrow + centerOf ведёт прицел; совмещение через CardPair (доп. карта подтыкается под углом); релиз → playToReleaseZone (move 480, SNAP-приземление); в сброс — через useDiscardExit (пара распадается на 2 одиночки, каждая от своего якоря); отмена — через useHandReturn (сборка возвращается в середину веера разом).',
      en: 'useArrow + centerOf drives the aim; pairing via CardPair (the extra card tucks in at an angle); release → playToReleaseZone (move 480, SNAP landing); to the discard — via useDiscardExit (the pair splits into 2 singles, each from its own anchor); cancel — via useHandReturn (the staging returns to the middle of the fan at once).',
    },
    where: 'Combo',
  },
  {
    name: { ru: 'Адресная атака стрелкой', en: 'Targeted arrow attack' },
    from: {
      ru: 'useArrow строит from/to по centerOf карты и цели, слежение за курсором (mousemove), старт/стоп по фазе розыгрыша.',
      en: 'useArrow builds from/to from centerOf the card and the target, cursor tracking (mousemove), start/stop by the play phase.',
    },
    where: 'Arrow, Combo',
  },
  {
    name: { ru: 'Разделение колоды', en: 'Splitting the deck' },
    from: {
      ru: 'FLIP-вылет flyFrom: половина уже в новом DOM-месте, анимируем «из» прошлого rect (getBoundingClientRect до→после ремаунта) в текущую позицию.',
      en: 'FLIP fly-in flyFrom: half is already in its new DOM place, we animate "from" the previous rect (getBoundingClientRect before→after remount) to the current position.',
    },
    where: 'DeckAnimations',
  },
  {
    name: { ru: 'Слияние колод (+ сброс)', en: 'Merging decks (+ discard)' },
    from: {
      ru: 'все стопки и сброс — параллельные absorbToDeck (move + fade) в один rect первой колоды; цель измеряется однажды, расходятся только источники.',
      en: 'all piles and the discard — parallel absorbToDeck (move + fade) into the single rect of the first deck; the target is measured once, only the sources differ.',
    },
    where: 'DeckAnimations',
  },
  {
    name: { ru: 'Сброс → новая колода', en: 'Discard → new deck' },
    from: {
      ru: 'собрать разбросанный сброс в стопку → gatherToDeck (move, центр-в-центр) к месту колоды → flipCard рубашкой вверх по приземлении.',
      en: 'gather the scattered discard into a pile → gatherToDeck (move, center-to-center) to the deck spot → flipCard back-up on landing.',
    },
    where: 'DeckAnimations',
  },
  {
    name: { ru: 'Добор карты (одиночный)', en: 'Drawing a card (single)' },
    from: {
      ru: 'drawToCenter (move 480) колода→центр рубашкой вверх; ветвление по карте: игрок — flipCard + useHandInsert.insert (садится в слот руки); соперник — dealToSeat (move + fade) в card-area места ×0.7, без скейла вверх; триггер/AI — flipCard в центре (reveal для всех), AI ещё добирает эффект из AI-колоды рядом (flyer с key={seq}, чтобы Card не переиспользовалась и не крутилась).',
      en: 'drawToCenter (move 480) deck→center back-up; branch by card: player — flipCard + useHandInsert.insert (sits into a hand slot); opponent — dealToSeat (move + fade) into the seat card-area ×0.7, no upward scale; trigger/AI — flipCard at the center (reveal for all), AI also draws an effect from the nearby AI deck (flyer with key={seq} so the Card is not reused and does not spin).',
    },
    where: 'DrawCard',
  },
  {
    name: { ru: 'Мультидобор (по кнопке)', en: 'Multi-draw (by button)' },
    from: {
      ru: 'батч из N карт (N = число колод) гонит тот же одиночный сценарий через drawOne → boolean; на неразрешённом триггере (Error 503) drawOne возвращает false и серия рвётся — ждёт ручного разбора карты (фикс-сценариев под триггеры нет).',
      en: 'a batch of N cards (N = deck count) runs the same single scenario via drawOne → boolean; on an unresolved trigger (Error 503) drawOne returns false and the series breaks — it waits for manual card resolution (there are no fixed scenarios for triggers).',
    },
    where: 'DrawCard',
  },
  {
    name: { ru: 'Разрешение AI (уход карт)', en: 'AI resolution (cards leaving)' },
    from: {
      ru: 'resolveAi(trig, eff) — карты приходят аргументами, не из стейта (фикс stale-closure на клике); wait (имитация логики) → параллельно: триггер centerToDiscard + jitter() в сброс; эффект flipCard рубашкой на месте со стаггером → returnToDeck (move) в AI-колоду с уменьшением до её размера.',
      en: 'resolveAi(trig, eff) — cards arrive as arguments, not from state (a stale-closure fix on click); wait (logic simulation) → in parallel: the trigger centerToDiscard + jitter() to the discard; the effect flipCard back-up in place with a stagger → returnToDeck (move) into the AI deck, shrinking to its size.',
    },
    where: 'DrawCard',
  },
  {
    name: { ru: 'Тревога Error 503 (краевое свечение)', en: 'Error 503 alarm (edge glow)' },
    from: {
      ru: 'EdgeGlow внутри контейнера зоны стола (.glowBounds от измеренной высоты тех-бара — край экрана ≠ край стола); своя вытяжка — strong ДО Hand в DOM (ПОД рукой); соперник — weak ПОСЛЕ Hand (НАД рукой) + pointer-events:none, чтобы не глушить ховер-реакцию руки; появление/затухание — CSS-transition opacity.',
      en: 'EdgeGlow inside the table-zone container (.glowBounds from the measured tech-bar height — screen edge ≠ table edge); own layer — strong BEFORE Hand in the DOM (UNDER the hand); opponent — weak AFTER Hand (OVER the hand) + pointer-events:none so it does not smother the hand hover reaction; fade in/out — CSS-transition opacity.',
    },
    where: 'DrawCard',
  },
  {
    name: { ru: 'Взятие карты соперника', en: "Taking an opponent's card" },
    from: {
      ru: 'раздача-грид карт рубашкой → flipCard reveal выбранной → useHandInsert (зазор в руке + посадка в bottom-center слота по slotPlacement).',
      en: 'a deal-grid of face-down cards → flipCard reveal of the chosen one → useHandInsert (a gap in the hand + landing at the slot bottom-center per slotPlacement).',
    },
    where: 'PickOpponentCard',
  },
  {
    name: { ru: 'Каноничная рука (взять-потянуть)', en: 'Canonical hand (pick up & drag)' },
    from: {
      ru: 'взять карту мышкой и потянуть: наружу из руки → розыгрыш (onPlay), внутри руки → перестановка (onReorder, локальная). Порог DRAG_THRESHOLD различает клик и drag — клик (onCardClick) сосуществует. Летящая карта — fixed flyer за курсором (rAF); при отпускании settleInto доводит её в слот (rotate до угла, z под соседей). transform-origin: bottom center у флайера совпадает с пивотом слота — без финального прыжка. Ховер: подъём + расступание соседей (без in-place scale и без выхода на верхний слой), читаемость — отдельный зум-превью над рукой (появление разово через @keyframes zoom-rise, уход только opacity).',
      en: 'pick a card with the mouse and drag: out of the hand → play (onPlay), inside the hand → reorder (onReorder, local). A DRAG_THRESHOLD tells a click from a drag — a click (onCardClick) coexists. The flyer is a fixed node following the cursor (rAF); on release settleInto glides it into the slot (rotate to the slot angle, z tucked under the neighbours). The flyer’s transform-origin: bottom center matches the slot pivot — no end-of-glide jump. Hover: lift + neighbours part (no in-place scale, no jump to the top layer); readability comes from a separate zoom preview above the hand (one-shot appear via @keyframes zoom-rise, exit is opacity only).',
    },
    where: 'Hand (fan), HandStory',
  },
  {
    name: { ru: 'Error 503 — ход игрока и защита', en: 'Error 503 — player turn & defence' },
    from: {
      ru: 'добор из колоды → 503 в центр + красное краевое свечение (EdgeGlow strong в зоне стола). Защита ПЕРЕТАСКИВАНИЕМ карты на 503 (невидимые хит-зоны, drag как в игре, не клик): Release тащится вместе с прикреплённым Code Review (связка по позиции, не «сгруппированы»); карта накрывает 503, обе уходят в сброс (порядок стопки: 503, code review, release). Выбывание: PASS (рука + зона релиза → центр → сброс) или нет защиты (задержка → рука → сброс) → игрок становится зрителем, TurnDock → waiting. Полноэкранное видео выбывания для всех (мин. длительность, доигрывает текущий цикл).',
      en: 'draw from the deck → 503 to the center + red edge glow (EdgeGlow strong in the table zone). Defence is a DRAG of a card onto the 503 (invisible hit areas, a real-game drag, not a click): a Release drags together with its attached Code Review (bound by position, not «grouped»); the card covers the 503 and both leave to the discard (stack order: 503, code review, release). Elimination: PASS (hand + release zone → center → discard) or no defence available (delay → hand → discard) → the player becomes a spectator, TurnDock → waiting. A full-screen elimination video for everyone (min duration, finishes the current loop).',
    },
    where: 'Error503Story',
  },
  {
    name: { ru: 'AI-эффекты — разрешение', en: 'AI effects — resolution' },
    from: {
      ru: 'добор AI-триггера из базовой колоды → выбранная AI-карта из колоды событий в центр (drawToCenter, крупнее) → hold на столе → разрешение по эффекту. Карта события ВСЕГДА возвращается в AI-колоду (returnToDeck); в общий сброс идут только триггер (centerToDiscard) и уничтоженный ОБЫЧНЫЙ релиз. Release/Monitoring → в пустой слот (playToReleaseZone) и остаётся. Crush → уничтожает совпавший релиз (AI-релиз → AI-колода, обычный → сброс). Inside → релиз из сброса через центр в руку (useHandInsert); при нескольких — открытый ряд-выбор с ConfirmAction, невыбранные летят обратно в сброс. Good Vibe → добор 2 карт; триггер в доборе отыгрывается полностью первым, Hallucination ставит флаг прерывания — 2-й добор пропускается. Bad Vibe → игрок кликает карту руки → в центр (показ) → в сброс. Ховер руки заглушён во время анимаций (pointer-events).',
      en: 'draw the AI trigger from the base deck → the chosen AI card from the events deck to the center (drawToCenter, larger) → hold → resolve by effect. An event card ALWAYS returns to the AI deck (returnToDeck); only the trigger (centerToDiscard) and a destroyed ORDINARY release reach the common discard. Release/Monitoring → into an empty slot (playToReleaseZone) and stays. Crush → destroys the matching release (AI release → AI deck, ordinary → discard). Inside → a release from the discard through the center into the hand (useHandInsert); with several, an open row choice + ConfirmAction, the rest fly back to the discard. Good Vibe → draws 2 cards; a drawn trigger resolves fully first, Hallucination raises a turn-interrupt flag — the 2nd draw is skipped. Bad Vibe → the player clicks a hand card → to the center (shown) → to the discard. Hand hover is muted during animations (pointer-events).',
    },
    where: 'AiCardsStory',
  },
  {
    name: { ru: 'Забрать конкретную карту', en: 'Take a specific card' },
    from: {
      ru: 'каталог-грид (без триггеров) в центре + веер соперника рубашкой сверху (data-in слайд). Выбор держит PICK_BEAT; хит — карта вылетает из слота соперника к центру стола (CSS-transition, центр от rootRef, не window), flip лицом, REVEAL_HOLD, затем useHandInsert в руку; мисс — тряска + подпись, веер уезжает. Слот-донор рендерит null, пока карту несёт flyer.',
      en: 'a catalog grid (no triggers) at the centre + the opponent fan back-up from the top (data-in slide). The pick holds PICK_BEAT; hit — the card flies out of the opponent slot to the stage centre (CSS transition, centre from rootRef not window), flips face up, REVEAL_HOLD, then useHandInsert into the hand; miss — shake + note, the fan leaves. The donor slot renders null while the flyer carries the card.',
    },
    where: 'PickSpecificCardStory',
  },
  {
    name: { ru: 'У тебя забирают карту', en: 'Opponent takes your card' },
    from: {
      ru: 'зеркало «забрать конкретную» со стороны жертвы: two-hop CSS-transition from → center → up. В центре flip РУБАШКОЙ (теперь карта соперника), затем к центру его веера rotate(180); zIndex падает до 30 на подъёме, чтобы подоткнуться под веер. useHandInsert НЕ используется — карта уходит из руки, а не встаёт в неё.',
      en: 'mirror of "take a specific card" from the victim: a two-hop CSS transition from → center → up. At the centre it flips FACE-DOWN (now the opponent’s card), then to their fan centre rotate(180); zIndex drops to 30 on the way up to tuck behind the fan. No useHandInsert — the card leaves the hand, it does not settle into one.',
    },
    where: 'OpponentTakesCardStory',
  },
  {
    name: { ru: 'Git Cherry-pick (прототип)', en: 'Git Cherry-pick (prototype)' },
    from: {
      ru: 'сброс раздаётся в грид выбора (стаггер DEAL_STEP, cap STAGGER_CAP); выбранная — к центру, useHandInsert в руку; sudo-вторая — flipCard рубашкой + returnToDeck на колоду; невыбранные возвращаются в стопку по scatterAt (порядок сохраняется, без перетасовки). Rules-complete отложен (#61).',
      en: 'the discard deals into a selection grid (stagger DEAL_STEP, cap STAGGER_CAP); the pick → centre, useHandInsert into the hand; a sudo second card → flipCard back-up + returnToDeck onto the deck; the unpicked return to the pile by scatterAt (order kept, no reshuffle). Rules-complete deferred (#61).',
    },
    where: 'GitCards/CherryPick',
  },
  {
    name: { ru: 'Git Rebase (прототип)', en: 'Git Rebase (prototype)' },
    from: {
      ru: 'верхние 3 карты колоды вылетают в нумерованный ряд (DEAL_DUR/STEP), игрок меняет порядок, затем flipCard рубашкой + returnToDeck обратно на колоду в выбранном порядке (BACK_DUR/STEP). Знание о колоде не моделируется (#61 q9). Rules-complete отложен.',
      en: 'the top 3 cards fly out into a numbered row (DEAL_DUR/STEP), the player reorders, then flipCard back-up + returnToDeck onto the deck in the chosen order (BACK_DUR/STEP). Deck knowledge is not modelled (#61 q9). Rules-complete deferred.',
    },
    where: 'GitCards/Rebase',
  },
  {
    name: { ru: 'System Upgrade (прототип)', en: 'System Upgrade (prototype)' },
    from: {
      ru: 'каждый соперник бросает карту с места в центр (THROW_DUR/STEP, рост THROW_SCALE→1); base — после HOLD_MS всё в сброс (centerToDiscard, стаггер CLEAR_STEP); sudo — игрок берёт одну (reveal + useHandInsert), остальные в сброс. Rules-complete отложен.',
      en: 'each opponent throws a card from its seat to the centre (THROW_DUR/STEP, growing THROW_SCALE→1); base — after HOLD_MS all to the discard (centerToDiscard, stagger CLEAR_STEP); sudo — the player takes one (reveal + useHandInsert), the rest to the discard. Rules-complete deferred.',
    },
    where: 'GitCards/SystemUpgrade',
  },
  {
    name: { ru: 'Лимит карт в руке', en: 'Hand limit' },
    from: {
      ru: 'пока рука ВЫШЕ лимита, карту можно вытащить из веера — иначе Hand отклоняет и карта уезжает обратно. Сброшенные не идут в кучу по одной: они строят СЕТКУ в центре (форма выбрана заранее по известному числу лишних карт, каждая летит сразу в свою ячейку — playToCenter), сетка держится открытой, и только когда села последняя, вся она уходит в сброс через useDiscardExit со стаггером. Рука никогда не блокируется полётом: выбрасывание нелинейно — «подумал и быстро скинул».',
      en: 'while the hand is OVER the limit a card can be pulled out of the fan — otherwise Hand rejects the drop and it glides back. Discards do not reach the heap one at a time: they build a GRID at the centre (its shape chosen upfront from the known excess, every card flying straight to its own cell — playToCenter), the grid is held open, and only when the last one lands does the whole of it leave via useDiscardExit with a stagger. The hand is never blocked by a flight: discarding is non-linear — think, then dump fast.',
    },
    where: 'HandLimit',
  },
  {
    name: { ru: 'Защита релиза (полный ход)', en: 'Defending a release (a whole turn)' },
    from: {
      ru: 'релиз из веера встаёт в центр и НЕ приземляется — по правилам он стоит одной карты, оплата показывается рядом открыто; только после этого релиз садится в свой слот зоны (playToReleaseZone) и открывается окно атак. Атака летит с места соперника в центр (cardBoxIn — прицел по карточной коробке, не по всей сидушке) и ложится под своим наклоном. Ответ: защита накрывает атаку, обе уходят в сброс одним обменом (useDiscardExit, слои сохраняются). Своё судо встаёт в СВОЙ слот со стрелкой и складывается с выбранной защитой в пару (покадровое слияние, без дублей и телепортов). Security Bug не жжёт релиз, а забирает его в зону атакующего — карта морфит в LOD прямо В ПОЛЁТЕ. Rollback возвращает атаку: без судо — в руку атакующего, с судо — в свою через useHandInsert. Промах мимо цели отменяет выложенное.',
      en: "a Release pulled from the fan stands at the centre and does NOT land — by the rules it costs one card, and the cost is shown beside it in the open; only then does the Release settle into its zone slot (playToReleaseZone) and the attack window opens. An attack flies from the opponent seat to the centre (cardBoxIn — aimed at the card box, not the whole seat) and lies at its own tilt. The answer: a defence covers the attack and both leave as one exchange (useDiscardExit, layers preserved). The player's own Sudo takes ITS OWN slot with an arrow and folds into a pair with the chosen defence (a frame-by-frame merge, no duplicates and no teleports). Security Bug does not burn the release but takes it into the attacker zone — the card morphs into its LOD reading IN FLIGHT. Rollback sends the attack back: plain — to the attacker hand, under Sudo — to your own via useHandInsert. A press on nothing valid takes a staged play back.",
    },
    where: 'DefenseRelease',
  },
]

// ===== 3. Needs rework =====
// Empty: everything reduced to modules. (Pairing in Combo is intentionally left
// as is — it's cards sliding into a stack, not a rect→rect flight; routing it
// through move() would be extra complexity, not a fix.)
const ISSUES: Issue[] = []

// Section headings, notes, legend and table headers.
const UI = {
  ru: {
    title: 'Аудит анимаций',
    modulesH: 'Готовые модули',
    modulesNote: 'Самодостаточные кирпичики — один смысл, одна задача.',
    scenariosH: 'Сценарные комбинации',
    scenariosNote:
      'Реализованные последовательности из модулей выше — под конкретные ситуации игры.',
    issuesH: 'Требует доработок',
    issuesEmpty: 'Открытых проблем нет — всё свелось к модулям.',
    legendOk: 'оформлено модулем, переиспользуется',
    legendRework: 'код есть, но кривой/дублируется — доработать',
    legendReuse: 'есть готовый модуль, но не используется — применить',
    colModule: 'модуль',
    colWhatDoes: 'что делает',
    colWhereMod: 'где живёт · используется',
    colStatus: 'статус',
    colScenario: 'сценарий',
    colImpl: 'реализация · модули и ключевые моменты',
    colWhere: 'где',
    colWhatShort: 'что',
    colProblem: 'проблема',
    copy: 'копировать',
  },
  en: {
    title: 'Animation audit',
    modulesH: 'Ready modules',
    modulesNote: 'Self-contained blocks — one meaning, one task.',
    scenariosH: 'Scenario combinations',
    scenariosNote: 'Implemented sequences from the modules above — for concrete game situations.',
    issuesH: 'Needs rework',
    issuesEmpty: 'No open issues — everything reduced to modules.',
    legendOk: 'packaged as a module, reused',
    legendRework: 'code exists but messy/duplicated — rework',
    legendReuse: 'a ready module exists but unused — apply it',
    colModule: 'module',
    colWhatDoes: 'what it does',
    colWhereMod: 'where it lives · used',
    colStatus: 'status',
    colScenario: 'scenario',
    colImpl: 'implementation · modules and key points',
    colWhere: 'where',
    colWhatShort: 'what',
    colProblem: 'problem',
    copy: 'copy',
  },
}

function Badge({ status }: { status: Status }) {
  const { lang } = useLang()
  const s = STATUS[status]
  return <span className={`${styles.badge} ${s.cls}`}>{s.label[lang]}</span>
}

// micro "copy module name" button — appears on row hover
function CopyButton({ text }: { text: string }) {
  const { lang } = useLang()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1100)
    })
  }
  return (
    <button
      type="button"
      className={styles.copyBtn}
      onClick={copy}
      aria-label={`${UI[lang].copy} ${text}`}
      title={UI[lang].copy}
    >
      {copied ? '✓' : '❐'}
    </button>
  )
}

function LegendItem({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <span className={styles.legendItem}>
      <Badge status={status} />
      {children}
    </span>
  )
}

function ModuleTable({ rows }: { rows: Module[] }) {
  const { lang } = useLang()
  const ui = UI[lang]
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>{ui.colModule}</th>
          <th>{ui.colWhatDoes}</th>
          <th>{ui.colWhereMod}</th>
          <th>{ui.colStatus}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.mod}>
            <td className={styles.mod}>
              <span className={styles.modCell}>
                <span>{r.mod}</span>
                <CopyButton text={r.mod} />
              </span>
            </td>
            <td className={styles.what}>{r.what[lang]}</td>
            <td className={styles.where}>{r.where[lang]}</td>
            <td>
              <Badge status={r.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ScenarioTable({ rows }: { rows: Scenario[] }) {
  const { lang } = useLang()
  const ui = UI[lang]
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>{ui.colScenario}</th>
          <th>{ui.colImpl}</th>
          <th>{ui.colWhere}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name.en}>
            <td className={styles.mod}>{r.name[lang]}</td>
            <td className={styles.what}>{r.from[lang]}</td>
            <td className={styles.where}>{r.where}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function IssueTable({ rows }: { rows: Issue[] }) {
  const { lang } = useLang()
  const ui = UI[lang]
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>{ui.colWhatShort}</th>
          <th>{ui.colProblem}</th>
          <th>{ui.colWhere}</th>
          <th>{ui.colStatus}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.what.en}>
            <td className={styles.mod}>{r.what[lang]}</td>
            <td className={styles.what}>{r.problem[lang]}</td>
            <td className={styles.where}>{r.where[lang]}</td>
            <td>
              <Badge status={r.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AnimationAuditStory() {
  const { lang } = useLang()
  const ui = UI[lang]
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{ui.title}</h1>
      <p className={styles.intro}>
        {lang === 'ru' ? (
          <>
            Источник состояния работы с анимациями. Сначала готовые <b>модули</b> — кирпичики для
            сборки. Затем <b>сценарные комбинации</b> — как кирпичики складываются под игровые
            ситуации (сценарий — это последовательность, а не модуль: его не оформляют отдельно,
            поэтому без статусов). И в конце — раздел <b>что требует доработок</b> (сейчас пусто:
            всё свелось к модулям).
          </>
        ) : (
          <>
            The source of state for animation work. First the ready <b>modules</b> — building
            blocks. Then <b>scenario combinations</b> — how the blocks assemble for game situations
            (a scenario is a sequence, not a module: it isn't formalized separately, so no
            statuses). And at the end — the <b>what needs rework</b> section (currently empty:
            everything reduced to modules).
          </>
        )}
      </p>

      <div className={styles.legend}>
        <LegendItem status="ok">{ui.legendOk}</LegendItem>
        <LegendItem status="rework">{ui.legendRework}</LegendItem>
        <LegendItem status="reuse">{ui.legendReuse}</LegendItem>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{ui.modulesH}</h2>
        <p className={styles.sectionNote}>{ui.modulesNote}</p>
        <ModuleTable rows={MODULES} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{ui.scenariosH}</h2>
        <p className={styles.sectionNote}>{ui.scenariosNote}</p>
        <ScenarioTable rows={SCENARIOS} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{ui.issuesH}</h2>
        {ISSUES.length > 0 ? (
          <IssueTable rows={ISSUES} />
        ) : (
          <p className={styles.sectionNote}>{ui.issuesEmpty}</p>
        )}
      </section>
    </div>
  )
}
