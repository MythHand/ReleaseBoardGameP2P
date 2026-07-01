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
      ru: 'словарь → CardPlay, Combo, DeckAnimations',
      en: 'registry → CardPlay, Combo, DeckAnimations',
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
    mod: 'jitter()',
    what: {
      ru: 'Разброс карты в сбросе (угол ±14°, смещение ±10/±8). Пара к centerToDiscard.',
      en: 'Card scatter in the discard (angle ±14°, offset ±10/±8). The pair of centerToDiscard.',
    },
    where: {
      ru: 'animations/scatter → Combo, CardPlay, DeckAnimations',
      en: 'animations/scatter → Combo, CardPlay, DeckAnimations',
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
      ru: 'stories/interactive → DrawCard, CardToHand, PickOpponentCard',
      en: 'stories/interactive → DrawCard, CardToHand, PickOpponentCard',
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
    name: { ru: 'Розыгрыш комбо (пара)', en: 'Playing a combo (pair)' },
    from: {
      ru: 'useArrow + centerOf ведёт прицел; совмещение через CardPair (доп. карта подтыкается под углом); релиз → playToReleaseZone (move 480, SNAP-приземление); в сброс — пара распадается на 2 одиночки, каждой свой centerToDiscard + jitter().',
      en: 'useArrow + centerOf drives the aim; pairing via CardPair (the extra card tucks in at an angle); release → playToReleaseZone (move 480, SNAP landing); to the discard — the pair splits into 2 singles, each with its own centerToDiscard + jitter().',
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
