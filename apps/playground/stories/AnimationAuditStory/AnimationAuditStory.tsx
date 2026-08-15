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
type Status = 'ok' | 'rework' | 'reuse' | 'open'

const STATUS: Record<Status, { cls: string; label: Loc }> = {
  ok: { cls: styles.ok, label: { ru: 'оформлено', en: 'done' } },
  rework: { cls: styles.rework, label: { ru: 'доработать', en: 'rework' } },
  reuse: { cls: styles.reuse, label: { ru: 'есть готовое', en: 'reuse' } },
  open: { cls: styles.open, label: { ru: 'нет решения', en: 'undecided' } },
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
      ru: 'Тряска влево-вправо — «не годится»: поле не заполнено, карты нет в руке. Разовый триггер по событию (как flipCard), с возвратом в исходную точку. Три параметра, каждый про своё: amp — размах первого рывка в px, dur — время, shape — ХАРАКТЕР (доли размаха по кадрам, SHAKE_SHAPES). Характеров два: settle — рывок и успокоение (жест поля ввода, по умолчанию 7px/380ms), spring — два полных размаха и два поменьше (крупный элемент, вздрогнувший всем собой). Доли, а не пиксели, поэтому характер читается одинаково на любой силе.',
      en: 'Left-right shake — "this will not do": an empty field, a card that is not in the hand. A one-shot event trigger (like flipCard), returning to the start point. Three parameters, each its own thing: amp — the first swing in px, dur — the time, shape — the CHARACTER (fractions of the swing per frame, SHAKE_SHAPES). Two characters: settle — a jolt and a calm-down (the input-field gesture, 7px/380ms by default), spring — two full swings then two smaller ones (a large element that flinched whole). Fractions, not pixels, so a character reads the same at any force.',
    },
    where: {
      ru: 'словарь → Input (сам примитив), Invite, Start (модалка входа), Form во фронтенде; spring — веер соперника в PickSpecific',
      en: 'registry → Input (the primitive itself), Invite, Start (entry modal), Form in the frontend; spring — the opponent fan in PickSpecific',
    },
    status: 'ok',
  },
  {
    mod: "play('playToCenter')",
    what: {
      ru: 'Выкладывание карты в центр стола (move, 480/ease).',
      en: 'Playing a card to the table center (move, 480/ease).',
    },
    where: {
      ru: 'словарь → CardPlay, DeckAnimations, Combo, HandLimit, AiCards, Error503, DefenseRelease',
      en: 'registry → CardPlay, DeckAnimations, Combo, HandLimit, AiCards, Error503, DefenseRelease',
    },
    status: 'ok',
  },
  {
    mod: "play('playToReleaseZone')",
    what: {
      ru: 'Карта в слот зоны релиза (move, 480, снап-приземление).',
      en: 'A card into a release-zone slot (move, 480, snap landing).',
    },
    where: {
      ru: 'словарь → Combo, AiCards, DefenseRelease, GameEnd',
      en: 'registry → Combo, AiCards, DefenseRelease, GameEnd',
    },
    status: 'ok',
  },
  {
    mod: "play('centerToDiscard')",
    what: {
      ru: 'Из центра в сброс с разворотом и разбросом (move, 420).',
      en: 'From the center to the discard with a turn and scatter (move, 420).',
    },
    where: {
      ru: 'словарь → только через useDiscardExit (сцены его не зовут напрямую)',
      en: 'registry → through useDiscardExit only (no scene calls it directly)',
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
    where: {
      ru: 'словарь → DrawCard, AiCards, Error503, GameDeal, useFlyer',
      en: 'registry → DrawCard, AiCards, Error503, GameDeal, useFlyer',
    },
    status: 'ok',
  },
  {
    mod: "play('dealToSeat')",
    what: {
      ru: 'Карта из центра уходит к месту игрока и растворяется в скрытой руке (move + fade).',
      en: 'A card leaves the center for a player seat and dissolves into the hidden hand (move + fade).',
    },
    where: { ru: 'словарь → DrawCard, GameDeal', en: 'registry → DrawCard, GameDeal' },
    status: 'ok',
  },
  {
    mod: "play('returnToDeck')",
    what: {
      ru: 'Карта возвращается из центра обратно в колоду (центр→колода) с уменьшением до размера колоды. Парный к drawToCenter.',
      en: 'A card returns from the center back to the deck (center→deck), shrinking to the deck size. The pair of drawToCenter.',
    },
    where: {
      ru: 'словарь → DrawCard, AiCards, CherryPick, Rebase',
      en: 'registry → DrawCard, AiCards, CherryPick, Rebase',
    },
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
    mod: 'CardPair + PAIR_AUX_POSE',
    what: {
      ru: 'Визуальный атом пары: вспомогательная карта подтыкается под основную под углом. Поза объявлена ОДИН раз и ДАННЫМИ — PAIR_AUX { rot, dy }, а CSS-строка PAIR_AUX_POSE выводится из них: читателей трое и формы им нужны разные. Компонент ставит строку инлайном, складывание садится на неё финальным кадром, а шаг ухода в сброс берёт угол числом — при распаде пары половина улетает своим полётом и должна стартовать с того наклона, который был виден. Тот же приём, что Scatter + restTransform() у кучи: поза — значение, CSS — её представление.',
      en: 'The visual atom of a pair: a helper card tucks under the main one at an angle. The pose is declared ONCE and as DATA — PAIR_AUX { rot, dy } — with the CSS string PAIR_AUX_POSE derived from it: there are three readers and they need different forms. The component applies the string inline, the fold lands on it as its final frame, and the discard-exit step takes the angle as a number — when a pair splits, the half flying out on its own must start at the tilt it was seen at. The same trick as Scatter + restTransform() for the heap: the pose is a value, the CSS is its representation.',
    },
    where: {
      ru: 'primitives/CardPair → Combo, DefenseRelease, Error503, ReleaseZone, useDiscardExit',
      en: 'primitives/CardPair → Combo, DefenseRelease, Error503, ReleaseZone, useDiscardExit',
    },
    status: 'ok',
  },
  {
    mod: "play('foldIntoPair') / enterPose()",
    what: {
      ru: 'Две карты СКЛАДЫВАЮТСЯ в пару: каждая половина приезжает из своего настоящего места на столе в свою позу внутри пары (у основной — рамка, у вспомогательной — PAIR_AUX_POSE, с snap-приземлением). Отличается от travel-пресетов тем, что пара никуда не летит: двигаются только внутренние узлы data-main / data-aux. enterPose(from, box) — вход FLIP-полёта отдельным хелпером, потому что сцена красит им первый кадр ДО старта: иначе половины успевают мигнуть в конечной позе.',
      en: 'Two cards FOLD into a pair: each half arrives from where it actually stands on the table into its pose inside the pair (the main one — the frame, the aux — PAIR_AUX_POSE with a snap landing). Unlike the travel presets the pair does not fly anywhere: only the inner data-main / data-aux nodes move. enterPose(from, box) is the FLIP entry pose as its own helper, because the scene paints the first frame with it BEFORE the start — otherwise the halves flash in their final pose.',
    },
    where: { ru: 'словарь → Combo, DefenseRelease', en: 'registry → Combo, DefenseRelease' },
    status: 'ok',
  },
  {
    mod: 'EdgeGlow',
    what: {
      ru: 'Краевое свечение контейнера внутрь (инсет-вуаль) с плавным fade появления/затухания (CSS-transition). Два варианта силы: strong (стол игрока) / weak (место соперника). Цвет/интенсивность — пропсами.',
      en: 'Inward edge glow of a container (inset veil) with a smooth fade in/out (CSS-transition). Two strength variants: strong (player table) / weak (opponent seat). Color/intensity via props.',
    },
    where: {
      ru: 'primitives/EdgeGlow → DrawCard и Error503 (тревога 503), AiCards, UI KIT',
      en: 'primitives/EdgeGlow → DrawCard and Error503 (the 503 alarm), AiCards, UI KIT',
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
      ru: 'animations/scatter → useDiscardExit (значит все сцены со сбросом) + напрямую CherryPick, Combo, CardPlay, DeckAnimations, Error503, DefenseRelease, GameDeal, GameEnd',
      en: 'animations/scatter → useDiscardExit (hence every scene with a discard) + directly CherryPick, Combo, CardPlay, DeckAnimations, Error503, DefenseRelease, GameDeal, GameEnd',
    },
    status: 'ok',
  },
  {
    mod: 'cardBoxIn() / cardAreaOf() / CARD_RATIO',
    what: {
      ru: 'Прицел полёта: карточная КОРОБКА внутри чужого прямоугольника. Место соперника, ячейка колоды, сидушка — шире карты и другой пропорции, и целиться в них целиком нельзя: карта раздулась бы до их ширины. cardBoxIn(rect, width) вписывает коробку заданной ширины по центру; cardAreaOf(cell) берёт ширину ячейки и достраивает высоту по CARD_RATIO (1.4) — единственному месту, где это отношение объявлено. Отвечает на «куда лететь», ровно как scatter отвечает на «как лечь».',
      en: 'The aim of a flight: the card BOX inside somebody else’s rectangle. An opponent seat, a deck cell, a seat plate — all wider than a card and of another proportion, and aiming at them whole is wrong: the card would inflate to their width. cardBoxIn(rect, width) centres a box of the given width inside; cardAreaOf(cell) takes the cell width and derives the height from CARD_RATIO (1.4) — the one place that ratio is declared. It answers "where to fly", exactly as scatter answers "how to lie".',
    },
    where: {
      ru: 'primitives/Card/geometry → useDiscardExit, useHandArrival, CardPlay, DrawCard, GameDeal, DefenseRelease, Error503, AiCards, OpponentTakes, DeckAnimations, Combo, Rebase',
      en: 'primitives/Card/geometry → useDiscardExit, useHandArrival, CardPlay, DrawCard, GameDeal, DefenseRelease, Error503, AiCards, OpponentTakes, DeckAnimations, Combo, Rebase',
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
      ru: 'animations/timing → useFlyer, useHandArrival, useDiscardExit (значит под каждым полётом), Combo, AiCards, DeckAnimations, DefenseRelease',
      en: 'animations/timing → useFlyer, useHandArrival, useDiscardExit (hence under every flight), Combo, AiCards, DeckAnimations, DefenseRelease',
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
      ru: 'animations/timing → 12 сцен и все три хука полёта',
      en: 'animations/timing → 12 scenes and all three flight hooks',
    },
    status: 'ok',
  },
  {
    mod: 'slotPlacement() / handStep() / insertPath()',
    what: {
      ru: 'Единый источник геометрии веера руки: наклон, дуга, ширина и шаг-от-кол-ва карт. Раскладка слотов в Hand и приземление вставки считаются по ОДНОЙ формуле — без копий, которые разъезжаются при тюнинге. Здесь же правило ВХОДА в веер (insertPath): карта заходит в свой слот в обход СЛЕВА, одной кривой без излома, чтобы смену слоя (карта перестаёт быть верхней и становится зажатой между двумя) можно было сделать на вершине обхода — там, где полоса перекрытия с правой соседкой минимальна, и на движении. Вылет — в шагах веера, место на дуге читается по высоте отпускания. У последнего слота соседа справа нет: заход обращается в ноль, кривая становится прямой.',
      en: 'The single source of hand-fan geometry: tilt, arc, width and step-from-card-count. The slot layout in Hand and the insert landing are computed by ONE formula — no copies that drift apart under tuning. The rule for ENTERING the fan lives here too (insertPath): a card comes into its slot round from the LEFT, along one curve with no corner in it, so the layer switch (it stops being the top card and becomes one held between two) can be made at the apex — where the strip it overlaps its right neighbour by is smallest, and while it moves. The reach is in fan steps; where on the arc is read off the release height. The last slot has no right neighbour: the reach collapses to zero and the curve is a straight line.',
    },
    where: {
      ru: 'table/Hand/fan → Hand, useHandArrival',
      en: 'table/Hand/fan → Hand, useHandArrival',
    },
    status: 'ok',
  },
  {
    mod: 'useHandArrival()',
    what: {
      ru: 'Карты ПРИХОДЯТ в руку — одно движение на любое их число. Раньше это были два шага («карта встаёт в руку» и «сборка возвращается»), а на экране движение одно: веер раздвигает зазор в СЕРЕДИНЕ, карта подгоняет размер, садится на нижний центр слота и подтыкается под веер. Источник любой: прямоугольник; карта, лежащая с наклоном (пивот компенсируется, первый кадр не дёргается); уже нарисованный элемент (шаг сам убирает его с экрана); половина пары (по своему якорю, наклонённая рамка обрезается — I6). Форма посадки — не его: карта входит в веер по insertPath, тем же правилом, каким рука кладёт обратно перетащенную, потому что встать между двух карт — одна ситуация, чем бы карту туда ни принесли. На приземлении отдаёт НАЗАД то, что прилетело: сцена не читает свою выкладку, которую к тому моменту уже очистила (I8).',
      en: 'Cards ARRIVE in the hand — one movement for any number of them. It used to be two steps ("a card settles in" and "the staging comes back"), but on screen the movement is one: the fan opens a gap in the MIDDLE, the card matches the size, lands on the slot bottom-centre and tucks under the fan. Any source: a rect; a card resting at a tilt (the pivot is compensated, so the first frame does not jump); an element already drawn (the step takes it off screen itself); one half of a pair (measured off its anchor, the tilted box trimmed — I6). The shape of the landing is not its own: the card comes into the fan along insertPath, the same rule the hand puts a dragged card back by, because going in between two cards is one situation whatever carried the card there. On landing it hands BACK what arrived: the scene does not read its own staging, which it cleared the moment the flight started (I8).',
    },
    where: {
      ru: 'stories/interactive → 11 сцен: добор, карта соперника (обе сцены выбора), Inside, Cherry-pick, System Upgrade, отмены в Combo и DeckAnimations, Rollback, раздача в GameDeal, CardToHand как витрина самого шага',
      en: 'stories/interactive → 11 scenes: draws, an opponent card (both picking scenes), Inside, Cherry-pick, System Upgrade, the undos in Combo and DeckAnimations, Rollback, the deal in GameDeal, CardToHand as the showcase of the step itself',
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
      ru: '@release/ui/animations → все 10 сцен со сбросом + борд фронтенда',
      en: '@release/ui/animations → all 10 scenes with a discard + the frontend board',
    },
    status: 'ok',
  },
  {
    mod: 'BoardAnchors',
    what: {
      ru: 'Реестр узлов борда: во что целится полёт и откуда стартует. Блоки HUD, discardBox, centre, hand, плюс seatBox(player) — карточная коробка по центру сидушки (I6, сидушка сильно шире карты), pileBox(index)/bindPile(index, el) — коробка стопки добора по индексу, которым движок называет её в `drawn.pile`, handSlotAt(index) и releaseSlot(player, slot). Только DOM: своего состояния не держит и чужое не зеркалит — потому карта в руке достаётся по индексу, а не по uid (иначе реестр зависел бы от той самой руки, от которой должен быть независим). Слот релиза всегда ищется под владельцем: frontend есть у каждого игрока. Одна идентичность на всю жизнь монтирования — потребители забирают реестр в ref внутрь долгих последовательностей.',
      en: "The board's registry of nodes: what a flight aims at and where it starts. The HUD blocks, discardBox, centre, hand, plus seatBox(player) — a card box centred on a seat (I6, a seat is far wider than a card), pileBox(index)/bindPile(index, el) — a draw pile's card box, keyed by the index the engine names in `drawn.pile`, handSlotAt(index) and releaseSlot(player, slot). DOM only: it holds no game state and mirrors none, which is why a hand card is reached by index rather than by uid (a uid lookup would make the registry depend on the very hand it must be independent of). A release slot is always looked up under its owner: every player has a frontend. One identity for the life of the mount — consumers capture it into a ref inside long-running sequences.",
    },
    where: {
      ru: 'frontend: entities/game/board/anchors.ts → раздача, очередь тактов',
      en: 'frontend: entities/game/board/anchors.ts → the deal, the beat queue',
    },
    status: 'ok',
  },
  {
    mod: 'planBeats() + useBeats()',
    what: {
      ru: 'Очередь тактов борда. События приходят с провода ПАЧКАМИ — за один синк может приехать несколько ходов, — поэтому борд, который анимировал бы на рендер, играл бы их поверх друг друга или ронял все, кроме последней. Такт играет по одному; пока он идёт, борд рисует ТЕНЬ — ту проекцию, ОТ которой такт уходит, а не ту, к которой приходит (к моменту эффекта live уже без карты, вместе с её слотом — I1). Пачка, приехавшая посреди такта, ждёт своей очереди, а не планируется против состояния, которого никто не видел. Событие без хореографии не даёт такта и проходит насквозь. Тень живёт ровно столько, сколько очередь: на опустошении она снимается и живая проекция побеждает всегда — даже если такт упал. Здесь же единственная проверка prefers-reduced-motion: play() её не делает.',
      en: "The board's beat queue. Events arrive off the wire in BATCHES — several moves can land in one sync — so a board that animated on render would play them on top of each other or drop all but the last. One beat at a time; while it runs the board draws a SHADOW — the projection the beat moves AWAY from, not the one it arrives at (by effect time `live` is already without the card, and without its slot — I1). A batch arriving mid-beat waits its turn rather than being planned against a state nobody saw. An event with no choreography yields no beat and passes through. The shadow lives exactly as long as the queue: on drain it is dropped and the live projection always wins — even if a beat threw. This is also the single prefers-reduced-motion check, because play() does not make one.",
    },
    where: {
      ru: 'frontend: features/board-beats/ → уход карты в сброс; раздача как такт ноль',
      en: 'frontend: features/board-beats/ → a card leaving for the discard; the deal as beat zero',
    },
    status: 'ok',
  },
  {
    mod: 'useFlyer()',
    what: {
      ru: 'ПЕРЕВОЗЧИК — та половина полёта, которая не правило. Под каждым полётом один и тот же узел: закреплённая карта над столом. Его писали заново в каждой сцене, а вместе с ним пять инвариантов, и каждый хоть раз ломался: рисоваться там, где смонтировался (I10 — иначе вспышка внизу страницы), свежий узел на полёт (I5), прокраска у источника (I2), гашение остатков анимаций (I3), прикол после посадки (I4). Умеет нести не только карту: пару, карту в беглом чтении, карту в морфе — содержимое остаётся сценовым, узел общий. Не знает, куда лететь и каким пресетом. I4 сцена вправе не применять: если поза приземления живёт в залитой анимации, прикол её погасит.',
      en: "THE CARRIER — the half of a flight that is not the rule. Under every flight there is the same node: a fixed card over the table. It was written from scratch per scene, and with it five invariants, each broken at least once: paint where it MOUNTS (I10 — else a flash at the bottom of the page), a fresh node per flight (I5), a painted frame at the source (I2), leftover animations cancelled (I3), the pin after landing (I4). It can carry more than a card — a pair, a card in its at-a-glance reading, a card mid-morph: the content stays the scene's, the node is shared. It does not know where to fly or which preset. A scene may decline I4: if the landing pose lives in a filled animation, pinning would cancel it.",
    },
    where: {
      ru: 'stories/interactive → все сцены с полётами',
      en: 'stories/interactive → every scene with flights',
    },
    status: 'ok',
  },
  {
    mod: 'Pile (heap)',
    what: {
      ru: 'Сброс как наброшенная КУЧА, а не ровная стопка: карты лежат каждая со своим разбросом (scatterAt/restTransform), под ними «глубина» стопки — и она показывается только когда под видимыми картами реально что-то есть. Отдаёт наружу коробку карты (boxRef) — в неё целятся полёты, и собранное состояние (gathered) — когда сброс превращается в колоду. Два состояния выбора, как у карты в руке: pickable — спокойная обводка «сюда можно» (идёт выбор, целей несколько), selected — свечение в цвете под курсором. Счётчик стоит на ступень ВЫШЕ полёта: прилетающая карта проходит под ним, а не накрывает и потом ныряет вниз — поэтому место стопки на столе нельзя центрировать трансформом (он запер бы бейдж внутри).',
      en: "The discard as a tossed HEAP, not a neat stack: every card lies at its own scatter (scatterAt/restTransform), with the pile depth beneath — shown only when something is actually hidden under the visible cards. Exposes the card box (boxRef) for flights to aim at, and the gathered state for when the discard turns into a deck. Two pick states, like a hand card: pickable — a calm outline meaning 'this one can be picked' (a choice is open and there are several targets), selected — the accent glow under the cursor. The counter sits one rung ABOVE the flight: an arriving card passes under it instead of covering it and then dropping beneath — which is why a pile's place on the table must not be centred with a transform (that would trap the badge inside the wrapper).",
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
      ru: 'Интерактивный веер: ховер (подъём + расступание + отдельный зум-превью), взять-потянуть (наружу — розыгрыш, внутри — перестановка), порог клик/drag, посадка обратно с transform-origin bottom-center. Карта берётся оттуда, где НАРИСОВАНА (с подъёмом от ховера), и уносит на летящий слой наклон, который на ней был, — иначе она проваливалась бы на высоту подъёма и выпрямлялась в один кадр. Кладётся обратно по insertPath: сам обход — правило веера, руке принадлежат часы (SETTLE_MS, SETTLE_EASE, SWITCH_AT). Всё внутри компонента; наружу — данные и колбэки намерения (onPlay/onReorder/onCardClick/stateAt).',
      en: 'The interactive fan: hover (lift + spread + a separate zoom preview), pick-up & drag (out → play, inside → reorder), a click/drag threshold, the landing back with transform-origin bottom-center. A card is picked up from where it is DRAWN (hover lift included) and carries the tilt it had onto the drag layer — otherwise it dropped by the height of that lift and cut to flat in one frame. It is put back along insertPath: the sweep belongs to the fan, the clock to the hand (SETTLE_MS, SETTLE_EASE, SWITCH_AT). All internal; the consumer supplies data and intent callbacks (onPlay/onReorder/onCardClick/stateAt).',
    },
    where: { ru: 'table/Hand → все руки', en: 'table/Hand → every hand' },
    status: 'ok',
  },
  {
    mod: 'CardCatalog',
    what: {
      ru: 'Каталог выбора карты: набор карт лицом вверх, из которого называют одну. Не веер и не куча — карты разложены, чтобы их прочитали и сравнили, поэтому по ховеру ячейка ВЫРАСТАЕТ до читаемого размера, а не поднимается. Жизнь каталога — два пропса: open (выбор идёт: все ячейки живые) и chosen (названная держится увеличенной, пока остальные уезжают вниз); selected — то, на чём выбор заряжен, но ещё не подтверждён. Появление — стаггером по ячейкам. Подтверждение снаружи, обычно ConfirmAction: назвать карту необратимо. ГДЕ каталог стоит — дело сцены, блок занимает выданную область.',
      en: 'The card-pick catalog: a set of face-up cards to name one from. Not a fan and not a heap — the cards are laid out to be read and compared, so on hover a cell GROWS to a readable size instead of lifting. Its life is two props: open (the choice is on: every cell alive) and chosen (the named one holds enlarged while the rest slide away); selected is what the choice is armed on but not yet committed. Entrance — a per-cell stagger. Confirmation lives outside, usually ConfirmAction: naming a card is irreversible. WHERE the catalog stands is the scene’s business; the block fills the area it is given.',
    },
    where: {
      ru: 'table/CardCatalog → PickSpecific, OpponentTakes',
      en: 'table/CardCatalog → PickSpecific, OpponentTakes',
    },
    status: 'ok',
  },
  {
    mod: 'useCardPreview',
    what: {
      ru: 'Чтение карты, которая стоит НА СТОЛЕ — той, что вышла в центр: 503 из колоды, эффект AI, чужая атака. Превью показывается в ОДНОМ постоянном месте справа, а не у курсора: место, которое игрок запоминает, и которое заведомо не накрывает центр, где всё и происходит. Размер — зум руки в максимуме плюс 15% и минус 10%. Привязка к СЛОТУ, а не к «карте в центре»: у Defense Release таких слотов пять, и каждый читается сам по себе. Закрывается ОДНИМ правилом — курсор сдвинулся туда, где нет ни читаемого слота, ни самого превью. Из этого правила сами собой выпадают два нужных поведения: карта улетела в сброс, пока её читают (слот размонтировался под неподвижным курсором, mouseleave не приходит — превью висит до движения мыши, НАМЕРЕННО наоборот к зуму руки, который обязан уйти вместе с картой), и курсор на самом превью (висит, иначе превью над сбросом мигало бы). Рубашкой вверх не показывается: у чужой закрытой карты нет личности и в проекции. Задержка есть только на УХОД со слота (90ms): слоты стоят в нескольких пикселях друг от друга, и без неё превью мигало бы при переходе на соседнюю карту. Глухого периода нет намеренно — иначе наведение на другую карту в центре переставало бы отвечать.',
      en: 'Reading a card that stands ON THE TABLE — the one at the centre: a 503 out of the deck, an AI effect, somebody else’s attack. The preview shows at ONE fixed place on the right, never at the cursor: a place the player learns, and one that cannot cover the centre where the game happens. Size — the hand’s hover zoom at its largest, plus 15% and minus 10%. Bound to a SLOT rather than to "the card at the centre": Defense Release has five of them and each reads on its own. ONE rule closes it — the pointer moved somewhere that is neither a readable slot nor the preview. Two needed behaviours fall out of that rule by themselves: the card flies to the discard while being read (its slot unmounts under a still cursor, no mouseleave is fired — the preview stays until the hand moves, DELIBERATELY the opposite of the hand’s zoom, which must leave with its card), and the pointer resting on the preview (it stays, or a preview over the discard would flicker). Face-down shows nothing: somebody else’s closed card has no identity in the projection either. The only delay is on LEAVING a slot (90ms): slots stand a few px apart and without it the preview would blink when crossing to the neighbouring card. There is deliberately no blind period — one would stop the centre answering when you move onto another card there.',
    },
    where: {
      ru: 'table/CardPreview → CardPlay, AiCards, Error503, DefenseRelease',
      en: 'table/CardPreview → CardPlay, AiCards, Error503, DefenseRelease',
    },
    status: 'ok',
  },
  {
    mod: 'useCardTilt() + CardMotionProvider',
    what: {
      ru: 'Наклон лица карты — вся математика в одном месте: курсор → отклонение p (по нему ComposedFace разводит слои), ховер и готовый transform. Обе формы карты берут её отсюда. Параметр from — отклонение, с которым лицо РОЖДАЕТСЯ и из которого выпрямляется: карту, оторванную из веера на слой перетаскивания, рисует НОВЫЙ экземпляр, а новый рождается плоским, и выпрямление, через которое слой проходит по каждому уходу курсора, просто не случается. CardMotionProvider — экранный выключатель параллакса: не проп, а контекст, потому что это решение про весь экран, а не про карту, и проброс флага положил бы настройку отображения в API руки, мест, стопок и зоны релиза. Гасит ТОЛЬКО слежение за курсором: подъём по ховеру остаётся, он отвечает «курсор на этой карте», а это обратная связь, а не украшение.',
      en: 'The tilt of a card face — the whole math in one place: pointer → deflection p (which ComposedFace shifts each layer by), hover, and the ready transform. Both card shapes take it from here. The `from` parameter is the deflection a face is BORN with and straightens out of: a card torn out of the fan onto the drag layer is drawn by a NEW instance, and a new instance is born flat, so the straightening the layer transitions through on every mouseleave simply never happens. CardMotionProvider is the screen-wide parallax switch: a context and not a prop, because it is a decision about a whole screen rather than about one card, and threading a flag would put a display preference into the APIs of the hand, the seats, the piles and the release zone. It mutes ONLY the pointer tracking: the hover lift stays, since it answers "the cursor is on this card", which is feedback and not decoration.',
    },
    where: {
      ru: 'cards/useCardTilt + cards/cardMotion → Card, CardParallax; выключатель — в настройках экрана Table',
      en: 'cards/useCardTilt + cards/cardMotion → Card, CardParallax; the switch lives in the Table screen settings',
    },
    status: 'ok',
  },
  {
    mod: 'ConfirmAction',
    what: {
      ru: 'Общий слайд-бар подтверждения выбора: заезжает по open, прижат к низу контейнера, опциональная подпись. Презентационный, i18n-agnostic.',
      en: 'The shared confirm-the-selection bar: slides up on open, pinned to the bottom of its container, an optional caption. Presentational, i18n-agnostic.',
    },
    where: {
      ru: 'table/ConfirmAction → CherryPick, Rebase, SystemUpgrade, AiCards (Inside), PickSpecific, OpponentTakes',
      en: 'table/ConfirmAction → CherryPick, Rebase, SystemUpgrade, AiCards (Inside), PickSpecific, OpponentTakes',
    },
    status: 'ok',
  },
  {
    mod: "play('hudIn')",
    what: {
      ru: 'Блок интерфейса приходит на своё место: короткий сдвиг по заданной оси + проявление. dx/dy — ОТКУДА он приходит (0/0 — чистое проявление, как у фоновой сетки), delay держит его невидимым до своей очереди (fill: both). Сдвиг живёт на transform, поэтому вешать пресет надо на ВНУТРЕННИЙ узел блока: на самом блоке transform обычно держит позиционирование (translate(-50%)). Из него собирается вся очередь появления экрана.',
      en: 'A HUD block arrives at its place: a short shift along the given axis + a fade in. dx/dy — WHERE it comes from (0/0 is a plain fade, as the background grid does), delay holds it invisible until its turn (fill: both). The shift lives on transform, so the preset goes on the block’s INNER node: on the block itself transform usually holds the positioning (translate(-50%)). The whole entrance order of a screen is built from it.',
    },
    where: { ru: 'словарь → Game Deal', en: 'registry → Game Deal' },
    status: 'ok',
  },
  {
    mod: "play('confettiFly')",
    what: {
      ru: 'Одна частица хлопушки: выстрел в заданном направлении, дуга через верх (peak) и падение с вращением, в конце — растворение. Пресет знает только полёт ОДНОЙ частицы; разброс, количество и символы — на сцене.',
      en: 'One piece of a party popper: a throw in a given direction, an arc over the top (peak) and a fall with spin, dissolving at the end. The preset knows one PIECE’s flight only; the spread, the count and the symbols belong to the scene.',
    },
    where: { ru: 'словарь → Game End', en: 'registry → Game End' },
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
      ru: 'useArrow + centerOf ведёт прицел; совмещение — foldIntoPair по разу на половину (первый кадр красится enterPose, иначе половины мигнут в конечной позе; вспомогательная приземляется в PAIR_AUX_POSE самого CardPair, поэтому передача пары в статичный слот не видна). Здесь у неё вырожденный случай: вторая карта УЖЕ стоит в центре, и это выражено как enterPose(box, box) — та же формула даёт identity, отдельной ветки нет. Релиз → playToReleaseZone (move 480, SNAP-приземление); в сброс — через useDiscardExit (пара распадается на 2 одиночки, каждая от своего якоря); отмена — через useHandArrival (сборка возвращается в середину веера разом).',
      en: 'useArrow + centerOf drives the aim; the pairing — foldIntoPair once per half (the first frame painted with enterPose, else the halves flash in their final pose; the aux lands on CardPair’s own PAIR_AUX_POSE, so handing the pair to a static slot is invisible). Here it has the degenerate case: the second card is ALREADY at the centre, expressed as enterPose(box, box) — the same formula yields identity, no separate branch. Release → playToReleaseZone (move 480, SNAP landing); to the discard — via useDiscardExit (the pair splits into 2 singles, each from its own anchor); cancel — via useHandArrival (the staging returns to the middle of the fan at once).',
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
      ru: 'FLIP-вылет flyFrom: половина уже в новом DOM-месте, анимируем «из» прошлого rect (getBoundingClientRect до→после ремаунта) в текущую позицию. То же движение теперь играется на живом борде из pilesChanged (deckBeat, «The deck is rebuilt, split, merged (live board)» в recipes.md) — какая стопка разделилась, там не называется событием, а выводится позиционно (classifyPiles, docs/animations/backlog.md).',
      en: 'FLIP fly-in flyFrom: half is already in its new DOM place, we animate "from" the previous rect (getBoundingClientRect before→after remount) to the current position. The same movement now also runs on the live board off pilesChanged (deckBeat, "The deck is rebuilt, split, merged (live board)" in recipes.md) — which pile split is not named by the event, it is derived positionally (classifyPiles, docs/animations/backlog.md).',
    },
    where: 'DeckAnimations + frontend: board-beats/deckBeat',
  },
  {
    name: { ru: 'Слияние колод (+ сброс)', en: 'Merging decks (+ discard)' },
    from: {
      ru: 'все стопки и сброс — параллельные absorbToDeck (move + fade) в один rect первой колоды; цель измеряется однажды, расходятся только источники. То же движение играется на живом борде из pilesChanged (deckBeat) — теперь на РЯД стопок (decks.main: number[]), а не на одну.',
      en: 'all piles and the discard — parallel absorbToDeck (move + fade) into the single rect of the first deck; the target is measured once, only the sources differ. The same movement now also runs on the live board off pilesChanged (deckBeat) — over a ROW of piles (decks.main: number[]) rather than one.',
    },
    where: 'DeckAnimations + frontend: board-beats/deckBeat',
  },
  {
    name: { ru: 'Сброс → новая колода', en: 'Discard → new deck' },
    from: {
      ru: 'собрать разбросанный сброс в стопку → gatherToDeck (move, центр-в-центр) к месту колоды → flipCard рубашкой вверх по приземлении. То же движение играется на живом борде дважды: как deckReshuffled (обычный ребилд на пилу 0) и как второй шаг Git Branch + Sudo внутри pilesChanged (fromDiscard, на индекс, который назвал сплит) — обе ветки через один и тот же discardOntoPile в deckBeat.',
      en: "gather the scattered discard into a pile → gatherToDeck (move, center-to-center) to the deck spot → flipCard back-up on landing. The same movement now also runs on the live board twice: as deckReshuffled (an ordinary rebuild onto pile 0) and as Git Branch + Sudo's second step inside pilesChanged (fromDiscard, onto the index the split just named) — both branches through the same discardOntoPile in deckBeat.",
    },
    where: 'DeckAnimations + frontend: board-beats/deckBeat',
  },
  {
    name: { ru: 'Добор карты (одиночный)', en: 'Drawing a card (single)' },
    from: {
      ru: 'drawToCenter (move 480) колода→центр рубашкой вверх; ветвление по карте: игрок — flipCard + useHandArrival.insert (садится в слот руки); соперник — dealToSeat (move + fade) в card-area места ×0.7, без скейла вверх; триггер/AI — flipCard в центре (reveal для всех), AI ещё добирает эффект из AI-колоды рядом (flyer с key={seq}, чтобы Card не переиспользовалась и не крутилась). Три ветки — свой / чужой / триггер — теперь играются и на живом борде от настоящих drawn/revealed событий (drawBeat, «A card is drawn (live board)» в recipes.md); AI-ветка там не участвует (#106).',
      en: 'drawToCenter (move 480) deck→center back-up; branch by card: player — flipCard + useHandArrival.insert (sits into a hand slot); opponent — dealToSeat (move + fade) into the seat card-area ×0.7, no upward scale; trigger/AI — flipCard at the center (reveal for all), AI also draws an effect from the nearby AI deck (flyer with key={seq} so the Card is not reused and does not spin). The mine/opponent/trigger branches now also run on the live board off real drawn/revealed events (drawBeat, "A card is drawn (live board)" in recipes.md); the AI branch is not part of that (#106).',
    },
    where: 'DrawCard + frontend: board-beats/drawBeat',
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
      ru: 'EdgeGlow внутри контейнера зоны стола (.glowBounds — inset:0 области демонстрации: край экрана ≠ край стола, и мерить нечего, потому что зона стола и есть сцена); своя вытяжка — strong ДО Hand в DOM (ПОД рукой); соперник — weak ПОСЛЕ Hand (НАД рукой) + pointer-events:none, чтобы не глушить ховер-реакцию руки; появление/затухание — CSS-transition opacity.',
      en: 'EdgeGlow inside the table-zone container (.glowBounds — inset: 0 of the demo area: screen edge ≠ table edge, and there is nothing to measure because the table zone IS the stage); own layer — strong BEFORE Hand in the DOM (UNDER the hand); opponent — weak AFTER Hand (OVER the hand) + pointer-events:none so it does not smother the hand hover reaction; fade in/out — CSS-transition opacity.',
    },
    where: 'DrawCard',
  },
  {
    name: { ru: 'Взятие карты соперника', en: "Taking an opponent's card" },
    from: {
      ru: 'раздача-грид карт рубашкой → flipCard reveal выбранной → useHandArrival (зазор в руке + посадка в bottom-center слота по slotPlacement).',
      en: 'a deal-grid of face-down cards → flipCard reveal of the chosen one → useHandArrival (a gap in the hand + landing at the slot bottom-center per slotPlacement).',
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
      ru: 'добор из колоды → 503 в центр + красное краевое свечение. У ЛЮБОГО ответа одна форма: карта летит в центр, накрывает тревогу со смещением (обе читаются), обе стоят открытыми COVER_HOLD и уходят в сброс одним обменом (useDiscardExit: тревога снизу, ответ сверху, пара с Code Review разбирается шагом). Monitoring — тот же такт без карты. Бросок принимает ВЕСЬ стол; отдаёт назад только своя область (зона + рука). Без защиты: рука сметается к центру, держится GATHER_HOLD (такт из Hand limit) и разлетается в сброс, дальше полноэкранное видео вылета (случайное из папки сцены).',
      en: "draw from the deck → 503 to the centre + red edge glow. EVERY answer has the same shape: the card flies to the centre, covers the alarm nudged aside (both readable), both stand open for COVER_HOLD and leave as one exchange (useDiscardExit: the alarm underneath, the answer on top, a pair with its Code Review split by the step). Monitoring is the same beat without a card. The WHOLE table accepts the drop; only the player's own area (zone + hand) gives the card back. No defence: the hand sweeps to the centre, holds for GATHER_HOLD (the hand-limit beat) and scatters to the discard, then a full-screen elimination video (random from the scene folder).",
    },
    where: 'Error503Story',
  },
  {
    name: { ru: 'AI-эффекты — разрешение', en: 'AI effects — resolution' },
    from: {
      ru: 'добор AI-триггера из базовой колоды → выбранная AI-карта из колоды событий в центр (drawToCenter, крупнее) → hold на столе → разрешение по эффекту. Карта события ВСЕГДА возвращается в AI-колоду (returnToDeck); в общий сброс идут только триггер (centerToDiscard) и уничтоженный ОБЫЧНЫЙ релиз. Release/Monitoring → в пустой слот (playToReleaseZone) и остаётся. Crush → уничтожает совпавший релиз (AI-релиз → AI-колода, обычный → сброс). Inside → релиз из сброса через центр в руку (useHandArrival); при нескольких — открытый ряд-выбор с ConfirmAction, невыбранные летят обратно в сброс. Good Vibe → добор 2 карт; триггер в доборе отыгрывается полностью первым, Hallucination ставит флаг прерывания — 2-й добор пропускается. Bad Vibe → карта вытаскивается ИЗ ВЕЕРА и тем же движением встаёт справа от AI-карты, стоит открыто PICK_HOLD, и дальше всё уходит одновременно: триггер в сброс, AI-карта в колоду событий, отданная карта в сброс. Ховер руки заглушён во время анимаций (pointer-events).',
      en: 'draw the AI trigger from the base deck → the chosen AI card from the events deck to the center (drawToCenter, larger) → hold → resolve by effect. An event card ALWAYS returns to the AI deck (returnToDeck); only the trigger (centerToDiscard) and a destroyed ORDINARY release reach the common discard. Release/Monitoring → into an empty slot (playToReleaseZone) and stays. Crush → destroys the matching release (AI release → AI deck, ordinary → discard). Inside → a release from the discard through the center into the hand (useHandArrival); with several, an open row choice + ConfirmAction, the rest fly back to the discard. Good Vibe → draws 2 cards; a drawn trigger resolves fully first, Hallucination raises a turn-interrupt flag — the 2nd draw is skipped. Bad Vibe → the card is pulled OUT of the fan and, in the same movement, takes its place to the right of the AI card; it stands open for PICK_HOLD, and then everything leaves at once: the trigger to the discard, the AI card back to its deck, the given-up card to the discard. Hand hover is muted during animations (pointer-events).',
    },
    where: 'AiCardsStory',
  },
  {
    name: { ru: 'Забрать конкретную карту', en: 'Take a specific card' },
    from: {
      ru: "CardCatalog (без триггеров) в средней полосе + веер соперника рубашкой сверху (data-in слайд). Выбор заряжается кликом и подтверждается ConfirmAction, дальше держит PICK_BEAT: названная карта стоит увеличенной, остальные уезжают. Хит — карта вылетает из слота соперника к центру стола (CSS-transition, центр от rootRef, не window), flip лицом, REVEAL_HOLD, затем useHandArrival в руку. Мисс — веер вздрагивает на месте: play('shake') характером spring, amp 9 / 460ms (крупный элемент вздрагивает всем собой), подпись, веер уезжает. Слот-донор рендерит null, пока карту несёт flyer.",
      en: "CardCatalog (no triggers) in the middle band + the opponent fan back-up from the top (data-in slide). The pick is armed by a click and committed through ConfirmAction, then holds PICK_BEAT: the named card stands enlarged while the rest slide away. Hit — the card flies out of the opponent slot to the stage centre (CSS transition, centre from rootRef not window), flips face up, REVEAL_HOLD, then useHandArrival into the hand. Miss — the fan flinches in place: play('shake') in its spring character, amp 9 / 460ms (a large element flinches whole), a note, and the fan leaves. The donor slot renders null while the flyer carries the card.",
    },
    where: 'PickSpecificCardStory',
  },
  {
    name: { ru: 'У тебя забирают карту', en: 'Opponent takes your card' },
    from: {
      ru: 'зеркало «забрать конкретную» со стороны жертвы, и каталог выбора у них общий — тот же CardCatalog, только называет карту соперник (бродкаст). Дальше two-hop CSS-transition from → center → up. В центре flip РУБАШКОЙ (теперь карта соперника), затем к центру его веера rotate(180); zIndex падает до 30 на подъёме, чтобы подоткнуться под веер. useHandArrival НЕ используется — карта уходит из руки, а не встаёт в неё.',
      en: 'mirror of "take a specific card" from the victim, and the pick catalog is shared — the same CardCatalog, only the opponent names the card (a broadcast). Then a two-hop CSS transition from → center → up. At the centre it flips FACE-DOWN (now the opponent’s card), then to their fan centre rotate(180); zIndex drops to 30 on the way up to tuck behind the fan. No useHandArrival — the card leaves the hand, it does not settle into one.',
    },
    where: 'OpponentTakesCardStory',
  },
  {
    name: { ru: 'Git Cherry-pick (прототип)', en: 'Git Cherry-pick (prototype)' },
    from: {
      ru: 'сброс раздаётся в грид выбора (стаггер DEAL_STEP, cap STAGGER_CAP); выбранная — к центру, useHandArrival в руку; sudo-вторая — flipCard рубашкой + returnToDeck на колоду; невыбранные возвращаются в стопку по scatterAt (порядок сохраняется, без перетасовки). Rules-complete отложен (#61).',
      en: 'the discard deals into a selection grid (stagger DEAL_STEP, cap STAGGER_CAP); the pick → centre, useHandArrival into the hand; a sudo second card → flipCard back-up + returnToDeck onto the deck; the unpicked return to the pile by scatterAt (order kept, no reshuffle). Rules-complete deferred (#61).',
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
      ru: 'каждый соперник бросает карту с места в центр (THROW_DUR/STEP, рост THROW_SCALE→1); base — после HOLD_MS всё в сброс (centerToDiscard, стаггер CLEAR_STEP); sudo — игрок берёт одну (reveal + useHandArrival), остальные в сброс. Rules-complete отложен.',
      en: 'each opponent throws a card from its seat to the centre (THROW_DUR/STEP, growing THROW_SCALE→1); base — after HOLD_MS all to the discard (centerToDiscard, stagger CLEAR_STEP); sudo — the player takes one (reveal + useHandArrival), the rest to the discard. Rules-complete deferred.',
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
      ru: 'релиз из веера встаёт в центр и НЕ приземляется — по правилам он стоит одной карты, оплата показывается рядом открыто; только после этого релиз садится в свой слот зоны (playToReleaseZone) и открывается окно атак. Атака летит с места соперника в центр (cardBoxIn — прицел по карточной коробке, не по всей сидушке) и ложится под своим наклоном. Ответ: защита накрывает атаку, обе уходят в сброс одним обменом (useDiscardExit, слои сохраняются). Своё судо встаёт в СВОЙ слот со стрелкой и складывается с выбранной защитой в пару через foldIntoPair — без дублей и телепортов: судо со стола передаётся флаеру тем же коммитом, поэтому оно ни на кадр не оказывается на экране дважды. Security Bug не жжёт релиз, а забирает его в зону атакующего — карта морфит в LOD прямо В ПОЛЁТЕ. Rollback возвращает атаку: без судо — в руку атакующего, с судо — в свою через useHandArrival. Промах мимо цели отменяет выложенное.',
      en: "a Release pulled from the fan stands at the centre and does NOT land — by the rules it costs one card, and the cost is shown beside it in the open; only then does the Release settle into its zone slot (playToReleaseZone) and the attack window opens. An attack flies from the opponent seat to the centre (cardBoxIn — aimed at the card box, not the whole seat) and lies at its own tilt. The answer: a defence covers the attack and both leave as one exchange (useDiscardExit, layers preserved). The player's own Sudo takes ITS OWN slot with an arrow and folds into a pair with the chosen defence via foldIntoPair — no duplicates and no teleports: the standing Sudo is handed to the flyer in the same commit, so it is never on screen twice for even a frame. Security Bug does not burn the release but takes it into the attacker zone — the card morphs into its LOD reading IN FLIGHT. Rollback sends the attack back: plain — to the attacker hand, under Sudo — to your own via useHandArrival. A press on nothing valid takes a staged play back.",
    },
    where: 'DefenseRelease',
  },
  {
    name: {
      ru: 'Начало партии: интерфейс и раздача',
      en: 'The start of a match: interface and deal',
    },
    from: {
      ru: "две хореографии подряд. ПЕРВАЯ — приход интерфейса, вся на play('hudIn') с паузой BEAT между тактами: правая навигация въезжает от своего края (dx: 44), затем слой стола вместе с сеточкой чистым проявлением (dx/dy: 0), затем колоды слева (dx: -34) и сброс справа (dx: 34) со сдвигом PILE_STAGGER — не вместе, а друг за другом; последними места соперников падают сверху по одному (dy: -28, SEAT_STAGGER) и в тот же такт снизу поднимается док (dy: 30, DOCK_DELAY) — в состоянии «ход соперника», но с текстом «старт игры». Зоны релиза в этой очереди НЕТ. ВТОРАЯ — раздача по кругу, начиная с игрока, DEAL_STEP между картами и ROUND_GAP между кругами: карта игрока идёт drawToCenter в центр и ОСТАЁТСЯ там под своим scatterAt (один разброс ведёт и полёт, и покой — та же связка, что в сбросе), карта соперника уходит dealToSeat в cardBoxIn его места ×0.7 и растворяется в счётчике. Первый круг — Debugger, в открытую; остальное рубашкой. Что легло в центр, копится в локальный массив, а не читается из staged: замыкание не перезапускается, и staged в нём навсегда пустой (I8). Когда сели все пять — HEAP_HOLD, центр очищается в том же коммите, что стартует полёт, и вся кучка ОДНИМ useHandArrival уходит в веер (from = место карты в куче, rot её же) — всё ещё закрытой. FLIP_HOLD — рука переворачивается (Card играет flipCard сам, по faceDown). И только через REVEAL_HOLD hudIn выводит зону релиза игрока (dy: 22) — у него одного, у соперников её нет. Сцена вооружена started-рефом (StrictMode монтирует дважды), рестарт снимает его и перезапускает всё по key.",
      en: "two choreographies in a row. THE FIRST — the interface arriving, all of it on play('hudIn') with a BEAT between steps: the page rail slides in from its own edge (dx: 44), then the table layer with its grid as a plain fade (dx/dy: 0), then the decks from the left (dx: -34) and the discard from the right (dx: 34) offset by PILE_STAGGER — one after the other, not together; last the opponent seats drop in from above one by one (dy: -28, SEAT_STAGGER) and in the same beat the dock rises from below (dy: 30, DOCK_DELAY) — in its «opponent's turn» state but reading «game start». The release zone is NOT in this order. THE SECOND — the deal, round by round starting with the player, DEAL_STEP between cards and ROUND_GAP between rounds: the player's card goes drawToCenter to the centre and STAYS there at its own scatterAt (one scatter drives both flight and rest — the discard's own coupling), an opponent's card leaves dealToSeat into cardBoxIn of their seat ×0.7 and dissolves into the counter. The first round is the Debugger, dealt open; everything else face down. What landed at the centre is collected in a local array instead of read back off staged: the closure never re-runs, so staged in it stays the empty array it was (I8). When all five have landed — HEAP_HOLD, the centre empties in the same commit that starts the flight, and the whole heap goes into the fan with ONE useHandArrival (from = the card's place in the heap, rot its own) — still face down. FLIP_HOLD — the hand turns over (Card plays flipCard itself, off faceDown). And only after REVEAL_HOLD does hudIn bring in the player's release zone (dy: 22) — his alone, the opponents have none. The scene is armed with a started ref (StrictMode mounts twice); restart clears it and re-runs everything by key.",
    },
    where: 'GameDeal',
  },
  {
    name: { ru: 'Конец партии', en: 'The end of a match' },
    from: {
      ru: "последний релиз вытягивается из веера и садится в свой слот (playToReleaseZone, SNAP) — зона закрыта. Дальше хлопушки: ТРИ независимых залпа (0 / 620 / 1450ms), у каждого своя сила — она задаёт число частиц, дальность и время в воздухе, поэтому это три события, а не один повтор. Залп — отдельный компонент: частицы создаются один раз и стартуют один раз в эффекте на монтирование (запуск из ref-колбэка убивал уже летящие: колбэк переприсваивается на каждом рендере, а play вешает вторую анимацию на летящий узел). Частица — свой символ кода, цвет-токен и ступень моно-шкалы; дуга — play('confettiFly'). Окно GameOver встаёт на 2.4s, ПОКА конфетти ещё летит, и конфетти идёт поверх окна. В плейграунде оба слоя начинаются под технической линией — она часть плейграунда, а не экрана.",
      en: "the last release is pulled out of the fan and settles into its slot (playToReleaseZone, SNAP) — the zone is closed. Then the poppers: THREE independent bangs (0 / 620 / 1450ms), each with its own power — it drives the piece count, the reach and the time in the air, so they are three events and not one repeat. A volley is its own component: the pieces are made once and started once in a mount effect (starting from a render-time ref callback killed the pieces already in the air: the callback re-fires on every render and play stacks a second animation on a node mid-flight). Every piece its own code symbol, colour token and step of the mono scale; the arc is play('confettiFly'). The GameOver window comes up at 2.4s WHILE the confetti is still flying, and the confetti flies over it. In the playground both layers start below the technical line — it belongs to the playground, not the screen.",
    },
    where: 'GameEnd',
  },
  {
    name: {
      ru: 'Карта уходит из руки в сброс (живой борд)',
      en: 'A card leaves the hand for the discard (live board)',
    },
    from: {
      ru: 'Первая хореография, которую ведут настоящие события движка, а не клики сцены. Приходит батч, planBeats сворачивает ВСЕ discarded этого батча в ОДИН такт (по одной, но все сразу — сброс по лимиту руки читается одним жестом, а не тремя). Планируется против проекции, которая ещё на экране: в живой карта уже вынута из руки вместе со слотом, из которого лететь (I1). Источник — свой слот веера (карта ищется по id: событие несёт id, а не uid), карточная коробка на сидушке соперника, либо слот зоны релиза для destroyed/neutralized. Разброс — scatterAt(id события), тот же вызов, которым куча в toBoardState кладёт карту на покой: одно значение, два читателя, поэтому передача от тени к проекции не двигает ни пикселя (I7). Рука при этом не блокируется: сброс — то, что СЛУЧИЛОСЬ, а не то, что решается. Раздача встала в ту же очередь тактом ноль — единственный такт, который держит стол и публикует свою тень вместо базы.',
      en: "The first choreography driven by real engine events rather than a scene's clicks. A batch arrives; planBeats folds EVERY discarded in it into ONE beat (one by one but all at once — a hand-limit discard reads as one gesture, not three). It is planned against the projection still on screen: in the live one the card is already out of the hand, and with it the slot to fly from (I1). The source is its own slot in the fan (found by card id — the event carries an id, not a uid), a card box on an opponent's seat, or a release-zone slot for destroyed/neutralized. The scatter is scatterAt(event id) — the same call the heap in toBoardState uses to rest the card: one value, two readers, so the handover from shadow to projection does not move a pixel (I7). The hand is never blocked: a discard is a thing that HAPPENED, not a thing being decided. The deal joined the same queue as beat zero — the one beat that holds the table and publishes its own shadow instead of a base.",
    },
    where: 'frontend: board-beats',
  },
]

// ===== 3. Needs rework — THE register of findings =====
// Everything found about the animations lands here: this page is where the work
// is looked at, so it is where a finding has to be visible. Two kinds live side
// by side, and the status tells them apart:
//   • what is VISIBLE in the scenes — a movement written twice, a ready module
//     not used (rework / reuse). The rule: a movement that exists in two scenes
//     is a module that has not been packaged yet.
//   • what CANNOT be seen in a scene — a rule nobody decided, a value out of
//     reach (open). The long form of these — what it costs and what would close
//     it — is in docs/animations/backlog.md; here they are visible, there they
//     are actionable.
const ISSUES: Issue[] = [
  {
    what: {
      ru: 'Модуль, не записанный НИГДЕ, не виден ни одной проверке',
      en: 'A module written down NOWHERE is invisible to every check',
    },
    problem: {
      ru: 'Про доку, не про игровую логику. Три вещи обязаны сюда доезжать, и две с половиной проверены машиной: пресет без строки в reference.md роняет тест; модуль, который есть на этой странице, но не упомянут в reference.md, роняет тест; сцена без «живой ссылки» в recipes.md роняет тест. Но все три сверяют ДВЕ точки друг с другом — значит модуль, не дошедший ни до одной, невидим для всех сразу. Так и вышло с экранным выключателем параллакса: написан, работает в настройках стола, не значился ни здесь, ни в доках. Опаснее прочего тем, что тесты при этом зелёные — возникает ложное чувство покрытия. Автоматически не закрывается: отличить модуль от вспомогательной функции может только человек. Закрывает дисциплина на входе — модуль считается сделанным, когда он появился ЗДЕСЬ, дальше его дотянет тест.',
      en: 'About the docs, not the game logic. Three things are supposed to land here, and two and a half are machine-checked: a preset with no row in reference.md fails a test; a module that is on this page but unmentioned in reference.md fails a test; a scene with no live reference in recipes.md fails a test. But all three compare TWO places with each other — so a module that reached neither is invisible to all of them at once. That is exactly what happened to the screen-wide parallax switch: written, working in the table settings, listed neither here nor in the docs. What makes it worse than an ordinary gap is that the tests stay green, which reads as coverage. It does not close automatically — telling a module from a helper takes a person. What closes it is discipline at the door: a module counts as done once it appears HERE, and the test drags it into the docs from there.',
    },
    where: { ru: 'эта страница + docs/animations/', en: 'this page + docs/animations/' },
    status: 'open',
  },
  {
    what: {
      ru: '`drawn` был приватным, добор соперника было нечем анимировать',
      en: '`drawn` was private, an opponent’s draw had nothing to animate',
    },
    problem: {
      ru: 'Issue #97 утверждал, что `drawn` уже опускает `card` для чужого добора и проекция уже нужной формы — это было неверно: движок ставил `visibleTo: [drawer]` на обычный добор, и сеть роняла всё событие целиком у всех, кроме доборщика (`network/session/audience.ts`), так что соперник не получал ничего, кроме тика счётчика руки. Решено этой задачей: `reduce.ts` больше не ставит `visibleTo`, событие публично для всех, а секретность личности карты вынесена в `@release/engine`.`redactFor(event, viewerId)` — она вырезает `card` из чужого `drawn`, и `forViewer` фильтрует по `visibleTo` как раньше, затем прогоняет уцелевшее через неё. Запись держится тут намеренно даже решённой: исходный текст issue продолжает утверждать обратное.',
      en: 'Issue #97 claimed `drawn` already omitted `card` for an opponent’s draw and the projection was already the right shape — that was wrong: the engine set `visibleTo: [drawer]` on an ordinary draw, and the network dropped the whole event for everyone but the drawer (`network/session/audience.ts`), so an opponent got nothing but a tick of the hand counter. Resolved by this task: `reduce.ts` no longer sets `visibleTo`, the event is public to everyone, and the card’s identity secrecy moved into `@release/engine`’s `redactFor(event, viewerId)` — it strips `card` from someone else’s `drawn`; `forViewer` filters by `visibleTo` as before, then runs the survivors through it. The entry stays here on purpose even though it is solved: the original issue text still states the opposite.',
    },
    where: {
      ru: 'packages/engine (redactFor) + network/session/audience.ts (forViewer)',
      en: 'packages/engine (redactFor) + network/session/audience.ts (forViewer)',
    },
    status: 'ok',
  },
  {
    what: {
      ru: '`pilesChanged` не называет ни операцию, ни индекс разделения',
      en: '`pilesChanged` names neither its operation nor the split index',
    },
    problem: {
      ru: 'Событие несёт только счётчики (`piles: number[]`), ни какая операция произошла, ни какая стопка в ней участвовала — без вывода нечем решить, `flyFrom` целится в какой индекс или `absorbToDeck` во что. `classifyPiles` (`planBeats.ts`) выводит это позиционно: длина + сумма стопок до/после, с вычерпыванием, проверяемым раньше мёрджа (обе формы дают одну длину результата). Вычерпывание (prune) при этом не заводит отдельный вид `PileStep` — пустой пропавшей стопке нечего анимировать, и функция просто возвращает `null`.',
      en: 'The event carries only counts (`piles: number[]`) — neither which operation ran nor which pile it touched, so nothing tells `flyFrom` which index to aim at or `absorbToDeck` what to absorb into. `classifyPiles` (`planBeats.ts`) derives it positionally instead — length and sum of the pile counts before/after, with the prune case checked ahead of merge (both shapes yield the same result length). A prune does not get its own `PileStep` variant either — an empty pile that ceased to exist has nothing on screen to animate, so the function just returns `null`.',
    },
    where: {
      ru: 'frontend: features/board-beats/planBeats.ts (classifyPiles)',
      en: 'frontend: features/board-beats/planBeats.ts (classifyPiles)',
    },
    status: 'rework',
  },
  {
    what: {
      ru: 'Сколько триггер стоит в центре — значения нет',
      en: 'How long a revealed trigger stands at the centre — no approved value',
    },
    problem: {
      ru: 'Такт добора держит вскрытый триггер на столе `REVEAL_HOLD = 900` перед уходом в сброс. `DrawCardStory` держит `AI_HOLD = 4000`, но это пауза AI-ветки (стол читает эффект), не обычного вскрытия — а для голого reveal подтверждённого значения нет вовсе. `REVEAL_HOLD = 900` — число этой задачи, ничем не подтверждённое.',
      en: 'The draw beat holds a revealed trigger at the centre for `REVEAL_HOLD = 900` before it leaves for the discard. `DrawCardStory` has `AI_HOLD = 4000`, but that is the AI branch’s pause (the table reads the effect), not a plain reveal’s — and a plain reveal has no approved value at all. `REVEAL_HOLD = 900` is this task’s own number, unconfirmed by anything.',
    },
    where: {
      ru: 'frontend: features/board-beats/drawBeat.tsx (REVEAL_HOLD)',
      en: 'frontend: features/board-beats/drawBeat.tsx (REVEAL_HOLD)',
    },
    status: 'open',
  },
  {
    what: {
      ru: 'Ширина стопки при нескольких колодах не утверждена',
      en: 'The pile-width ramp above one pile has no approved value',
    },
    problem: {
      ru: '`pileWidthFor` держит 150px при одной стопке добора, 120 при двух, 100 при трёх и более — рамп придуман для этой задачи, не утверждён. `DeckAnimationsStory` кладёт стопки в ряд, которому никогда не приходится делить стол с рукой и доком, поэтому её фиксированные 150 ничего не подтверждают для борда: ряд из трёх (Git Branch + Sudo) может налезть на руку на узких экранах.',
      en: '`pileWidthFor` holds a draw pile at 150px at one, 120 at two, 100 at three or more — a ramp invented for this task, not approved. `DeckAnimationsStory` lays its piles out in a row that never has to share the table with the hand and the dock, so its fixed 150 confirms nothing for the board: a row of three (Git Branch + Sudo) can crowd the hand on a narrow screen.',
    },
    where: {
      ru: 'apps/ui/src/table/Table/piles.ts (pileWidthFor)',
      en: 'apps/ui/src/table/Table/piles.ts (pileWidthFor)',
    },
    // `open`, not `reuse`: the module is applied in both the kit and the board.
    // What is missing is an approved source for the ramp — a decision.
    status: 'open',
  },
  {
    what: {
      ru: '`drawBeat` меряет якоря без `nextFrames` — мёрдж в том же батче уронит добор',
      en: '`drawBeat` measures anchors without `nextFrames` — a same-batch merge would drop the draw',
    },
    problem: {
      ru: '`toCentre` в `drawBeat.tsx` меряет `pileBox`/`centre` на входе такта без `await nextFrames()`, хотя `discardBeat`/`deckBeat` уже платят этот вызов за ровно тот же layout-эффект. Сходит с рук только потому, что добор не убирает стопку; `[drawn(pile 2), pilesChanged → merge]` вернёт `pileBox(2) === null` и уронит добор целиком — недостижимо до #108 (Git Branch/Merge с борда). Стаб анкоров в тесте тоже не переработан, в отличие от `deckBeat.test.tsx`.',
      en: '`toCentre` in `drawBeat.tsx` measures `pileBox`/`centre` at beat entry with no `await nextFrames()`, though `discardBeat`/`deckBeat` already pay that call against the same layout-effect hazard. It gets away with it only because a draw never removes a pile; `[drawn(pile 2), pilesChanged → merge]` would return `pileBox(2) === null` and drop the draw entirely — unreachable until #108 (Git Branch/Merge from the board). The test’s anchors stub is not reworked either, unlike `deckBeat.test.tsx`.',
    },
    where: {
      ru: 'frontend: features/board-beats/drawBeat.tsx (toCentre)',
      en: 'frontend: features/board-beats/drawBeat.tsx (toCentre)',
    },
    status: 'open',
  },
  {
    what: {
      ru: 'Сброс после `[drawn(mine), discarded]` может целиться в слот, соседний с верным',
      en: 'A discard after `[drawn(mine), discarded]` can aim next to the right hand slot',
    },
    problem: {
      ru: '`planBeats` резолвит `source.index` сброса против `before`, но очередь тактов передаёт дальше опубликованное состояние такта добора как базу такта сброса, а `useHandArrival` вставляет прилетевшую карту в середину веера — сброс на индексе на месте вставки или после неё летит из соседнего слота. Косметика, лучше отката веера, который был до передачи базы между тактами; честный фикс меняет, как `planBeats` и очередь делят резолвинг индексов.',
      en: '`planBeats` resolves the discard’s `source.index` against `before`, but the beat queue now chains the draw beat’s published state forward as the discard beat’s base, and `useHandArrival` inserts the arriving card into the middle of the fan — a discard at or after that index flies from the neighbouring slot. Cosmetic, better than the whole-fan rollback that preceded chaining bases between beats; the honest fix changes how `planBeats` and the queue split index resolution.',
    },
    where: {
      ru: 'frontend: features/board-beats/planBeats.ts (source.index)',
      en: 'frontend: features/board-beats/planBeats.ts (source.index)',
    },
    status: 'open',
  },
]

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
    issuesNote:
      'Реестр находок: сюда заносится всё, что нашли про анимации. Видимое в сценах — движение, написанное дважды, готовый модуль без применения. И невидимое — нерешённое правило, значение, до которого не дотянуться. Наткнулся на дыру — запиши сюда, а не обходи её на месте.',
    issuesEmpty:
      'Открытых проблем нет — всё свелось к модулям. Правило, на котором держится эта пустота: движение, встретившееся в двух сценах, — это модуль, который ещё не оформили.',
    legendOk: 'оформлено модулем, переиспользуется',
    legendRework: 'код есть, но кривой/дублируется — доработать',
    legendReuse: 'есть готовый модуль, но не используется — применить',
    legendOpen: 'решения нет — нужен выбор, а не работа',
    docsH: 'Спека в проекте',
    docsNote:
      'У этой страницы есть письменная пара — docs/animations/. Здесь состояние в лицах: что готово, из чего собрано, что нашли. Там — как этим пользоваться из игровой логики: README (модель и инварианты I1–I10), recipes (последовательности по игровым ситуациям), reference (вызываемое: пресеты, хелперы, шаги), glossary (параметры и значения), extending (как добавить своё), backlog (развёрнутые находки: чем грозит и что закроет). Правило синхронности одностороннее только на словах: пресет без строки в reference роняет тест.',
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
    issuesNote:
      'The register of findings: everything found about the animations lands here. What is visible in the scenes — a movement written twice, a ready module left unused. And what is not — a rule nobody decided, a value out of reach. Run into a gap: write it here instead of working around it in place.',
    issuesEmpty:
      'No open issues — everything reduced to modules. The rule this emptiness rests on: a movement found in two scenes is a module that has not been packaged yet.',
    legendOk: 'packaged as a module, reused',
    legendRework: 'code exists but messy/duplicated — rework',
    legendReuse: 'a ready module exists but unused — apply it',
    legendOpen: 'undecided — it needs a choice, not work',
    docsH: 'The written spec',
    docsNote:
      'This page has a written counterpart — docs/animations/. Here is the state in the flesh: what is ready, what it is assembled from, what has been found. There is how to use it from game logic: README (the model and the I1–I10 invariants), recipes (ordered sequences by game situation), reference (the callable API: presets, helpers, steps), glossary (parameters and values), extending (how to add your own), backlog (findings in full: what it costs and what would close it). The sync rule is one-way only in wording: a preset with no row in reference fails a test.',
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
            поэтому без статусов). И в конце — <b>реестр находок</b>: всё, что нашли про анимации,
            от копии словарного движения в сцене до вопроса, который никто не решил.
          </>
        ) : (
          <>
            The source of state for animation work. First the ready <b>modules</b> — building
            blocks. Then <b>scenario combinations</b> — how the blocks assemble for game situations
            (a scenario is a sequence, not a module: it isn't formalized separately, so no
            statuses). And at the end — the <b>register of findings</b>: everything found about the
            animations, from a scene carrying its own copy of a registry movement to a question
            nobody has decided.
          </>
        )}
      </p>

      <div className={styles.legend}>
        <LegendItem status="ok">{ui.legendOk}</LegendItem>
        <LegendItem status="rework">{ui.legendRework}</LegendItem>
        <LegendItem status="reuse">{ui.legendReuse}</LegendItem>
        <LegendItem status="open">{ui.legendOpen}</LegendItem>
      </div>

      {/* the written half of the same subject — named on the page itself, so it
          is reachable from where the work is looked at */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{ui.docsH}</h2>
        <p className={styles.sectionNote}>{ui.docsNote}</p>
      </section>

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
        <p className={styles.sectionNote}>{ui.issuesNote}</p>
        {ISSUES.length > 0 ? (
          <IssueTable rows={ISSUES} />
        ) : (
          <p className={styles.sectionNote}>{ui.issuesEmpty}</p>
        )}
      </section>
    </div>
  )
}
