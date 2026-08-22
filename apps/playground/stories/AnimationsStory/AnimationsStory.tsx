import { type CSSProperties, type Ref, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  enterPose,
  jitter,
  nextFrames,
  play,
  presetNames,
  type ShakeShape,
  wait,
} from '@/animations'
import { CARDS } from '@/cards'
import Card from '@/primitives/Card'
import CardPair, { PAIR_AUX_POSE } from '@/primitives/CardPair'
import Typography from '@/primitives/Typography'
import type { TypographyBase } from '@/primitives/Typography/Typography'
import { type Lang, useLang } from '../../Playground/lang'
import styles from './AnimationsStory.module.css'

// Language: preset names, timings and terms (move/rotateY/ms/ease/fade/FLIP…)
// stay English in both languages; descriptive prose is bilingual via useLang().
type Loc = Record<Lang, string>

// The FORM of the demo — a preset is shown by what it actually is, not by a
// flight it never makes. Adding a preset to the registry means picking its form
// here; without one it lands in 'none' and says so out loud instead of faking a
// travel it would ignore.
type Kind =
  | 'flip' // переворот на месте
  | 'flyIn' // прилёт «из» прошлого места
  | 'shake' // тряска на месте
  | 'travel' // перелёт из места в место
  | 'slot' // подмена содержимого в зарезервированном слоте
  | 'badge' // появление/уход мелкого элемента в слоте
  | 'arrive' // блок интерфейса приходит на своё место
  | 'confetti' // залп частиц
  | 'fold' // две половины складываются в пару
  | 'none' // формы нет — демо не показываем
// a scene "place" (where the card flies from/to)
type Visual = 'hand' | 'center' | 'deck' | 'discard' | 'seat' | 'release' | 'source'

interface SceneEnd {
  label: Loc
  visual: Visual
}
interface Spec {
  name: string
  group: string
  desc: Loc
  // the technical gist: what's under the hood (move/fade/scale, duration, easing)
  detail: Loc
  kind: Kind
  from?: SceneEnd
  to?: SceneEnd
}

const DEMO = CARDS[1] // Security Bug

const SPECS: Spec[] = [
  {
    name: 'flipCard',
    group: 'Переворот',
    desc: { ru: 'Переворот карты лицо↔рубашка.', en: 'Card flip face↔back.' },
    detail: {
      ru: 'rotateY 0↔180° · 420ms · ease · играет сам Card при смене faceDown',
      en: 'rotateY 0↔180° · 420ms · ease · Card plays it itself on a faceDown change',
    },
    kind: 'flip',
  },
  {
    name: 'flyFrom',
    group: 'Появление',
    desc: {
      ru: 'FLIP-вылет: карта влетает «из» прошлого места в текущую позицию.',
      en: 'FLIP fly-in: the card flies "from" its previous place to the current position.',
    },
    detail: {
      ru: 'старт из прошлого rect → translate(0) · 520ms · ease · появление из источника',
      en: 'start from the previous rect → translate(0) · 520ms · ease · appearance from a source',
    },
    kind: 'flyIn',
  },
  {
    name: 'hudIn',
    group: 'Появление',
    desc: {
      ru: 'Блок интерфейса приходит на своё место: короткий сдвиг + проявление.',
      en: 'A HUD block arrives at its place: a short shift + a fade in.',
    },
    detail: {
      ru: 'translate(dx,dy)→0 + opacity 0→1 · 340ms · ease · fill both (delay держит блок невидимым до своей очереди) · dx/dy — ОТКУДА он приходит, 0/0 — чистое проявление',
      en: 'translate(dx,dy)→0 + opacity 0→1 · 340ms · ease · fill both (delay holds the block invisible until its turn) · dx/dy — WHERE it comes from, 0/0 is a plain fade',
    },
    kind: 'arrive',
  },
  {
    name: 'playToCenter',
    group: 'Розыгрыш',
    desc: {
      ru: 'Выкладывание карты в центр стола (видно всем).',
      en: 'Playing a card to the table center (visible to all).',
    },
    detail: {
      ru: 'move(from→to) · 480ms · ease · перелёт центр-в-центр + масштаб по ширине',
      en: 'move(from→to) · 480ms · ease · center-to-center flight + width scaling',
    },
    kind: 'travel',
    from: { label: { ru: 'рука', en: 'hand' }, visual: 'hand' },
    to: { label: { ru: 'центр стола', en: 'table center' }, visual: 'center' },
  },
  {
    name: 'playToReleaseZone',
    group: 'Розыгрыш',
    desc: { ru: 'Карта в слот зоны релиза.', en: 'A card into a release-zone slot.' },
    detail: {
      ru: 'move · 480ms · кривая LAND (приземление карты: путь виден, доезд мягкий)',
      en: 'move · 480ms · the LAND curve (a card landing: the travel is seen, the arrival is soft)',
    },
    kind: 'travel',
    from: { label: { ru: 'рука', en: 'hand' }, visual: 'hand' },
    to: { label: { ru: 'зона релиза', en: 'release zone' }, visual: 'release' },
  },
  {
    name: 'centerToDiscard',
    group: 'Розыгрыш',
    desc: { ru: 'Из центра в сброс.', en: 'From the center to the discard.' },
    detail: {
      ru: 'move · 420ms · ease · разброс приходит параметрами rotate/dx/dy: у кучи его считает scatterAt + toDiscardParams (полёт и покой из одного разброса), здесь показан разовый jitter()',
      en: 'move · 420ms · ease · the scatter arrives as rotate/dx/dy: a heap computes it with scatterAt + toDiscardParams (one scatter for both the flight and the rest), shown here with the one-off jitter()',
    },
    kind: 'travel',
    from: { label: { ru: 'центр', en: 'center' }, visual: 'center' },
    to: { label: { ru: 'сброс', en: 'discard' }, visual: 'discard' },
  },
  {
    name: 'foldIntoPair',
    group: 'Розыгрыш',
    desc: {
      ru: 'Две карты складываются в пару: каждая половина едет в свою позу внутри неё.',
      en: 'Two cards fold into a pair: each half travels to its pose inside it.',
    },
    detail: {
      ru: 'вызывается по разу на половину · 620ms · основная → рамка (ease), вспомогательная → PAIR_AUX_POSE (LAND) · пара НИКУДА не летит, двигаются только внутренние узлы · первый кадр красится enterPose(from, box), иначе половины мигнут в конечной позе',
      en: 'called once per half · 620ms · the main one → the frame (ease), the aux → PAIR_AUX_POSE (LAND) · the pair does NOT fly anywhere, only the inner nodes move · the first frame is painted with enterPose(from, box), else the halves flash in their final pose',
    },
    kind: 'fold',
  },
  {
    name: 'landInPose',
    group: 'Розыгрыш',
    desc: {
      ru: 'Карта прилетает на стол и садится сразу в свою позу — наклон едет вместе с ней.',
      en: 'A card arrives on the table and lands already in its pose — the tilt travels with it.',
    },
    detail: {
      ru: 'FLIP-форма (карта уже на месте, летит её вход) · 480ms · ease, по флагу snap — кривая LAND · та же математика, что у foldIntoPair, но pose — поза САМОЙ карты на столе, а не половины внутри пары · I11: разложенное системой ложится ровно, пришедшее из руки игрока — наклонённым',
      en: 'FLIP form (the card is already in place; its entry is what moves) · 480ms · ease, the LAND curve on the snap flag · the same math as foldIntoPair, but `pose` is the pose of the CARD on the table rather than of a half inside a pair · I11: what the system deals lies square, what came from a hand lies tilted',
    },
    kind: 'fold',
  },
  {
    name: 'gatherToDeck',
    group: 'Колоды',
    desc: {
      ru: 'Стопка летит к целевой колоде и приземляется.',
      en: 'A pile flies to the target deck and lands.',
    },
    detail: {
      ru: 'move · 520ms · ease · сбор сброса в новую колоду',
      en: 'move · 520ms · ease · gathering the discard into a new deck',
    },
    kind: 'travel',
    from: { label: { ru: 'стопка сброса', en: 'discard pile' }, visual: 'discard' },
    to: { label: { ru: 'колода', en: 'deck' }, visual: 'deck' },
  },
  {
    name: 'absorbToDeck',
    group: 'Колоды',
    desc: {
      ru: 'Поглощение: летит в колоду и растворяется по ходу.',
      en: 'Absorption: flies into the deck and dissolves along the way.',
    },
    detail: {
      ru: 'move + fade(opacity→0) · 520ms · ease · слияние колод',
      en: 'move + fade(opacity→0) · 520ms · ease · merging decks',
    },
    kind: 'travel',
    from: { label: { ru: 'стопка', en: 'pile' }, visual: 'deck' },
    to: { label: { ru: 'колода', en: 'deck' }, visual: 'deck' },
  },
  {
    name: 'drawToCenter',
    group: 'Добор',
    desc: {
      ru: 'Карта выходит из колоды добора в центр стола.',
      en: 'A card comes out of the draw deck to the table center.',
    },
    detail: {
      ru: 'move · 480ms · ease · колода→центр (рубашкой вверх)',
      en: 'move · 480ms · ease · deck→center (back-up)',
    },
    kind: 'travel',
    from: { label: { ru: 'колода добора', en: 'draw deck' }, visual: 'deck' },
    to: { label: { ru: 'центр стола', en: 'table center' }, visual: 'center' },
  },
  {
    name: 'dealToSeat',
    group: 'Добор',
    desc: {
      ru: 'Карта уходит к месту игрока и растворяется в скрытой руке.',
      en: 'A card leaves for a player seat and dissolves into the hidden hand.',
    },
    detail: {
      ru: 'move + fade · 460ms · ease · в скрытую руку соперника',
      en: "move + fade · 460ms · ease · into the opponent's hidden hand",
    },
    kind: 'travel',
    from: { label: { ru: 'центр', en: 'center' }, visual: 'center' },
    to: { label: { ru: 'место игрока', en: 'player seat' }, visual: 'seat' },
  },
  {
    name: 'returnToDeck',
    group: 'Добор',
    desc: {
      ru: 'Карта возвращается из центра в колоду с уменьшением.',
      en: 'A card returns from the center to the deck, shrinking.',
    },
    detail: {
      ru: 'move · 480ms · ease · scale вниз до размера колоды',
      en: 'move · 480ms · ease · scale down to the deck size',
    },
    kind: 'travel',
    from: { label: { ru: 'центр', en: 'center' }, visual: 'center' },
    to: { label: { ru: 'колода', en: 'deck' }, visual: 'deck' },
  },
  {
    name: 'rollOut',
    group: 'Слоты',
    desc: {
      ru: 'Содержимое слота гаснет — первая половина подмены.',
      en: 'The slot content fades out — the first half of a swap.',
    },
    detail: {
      ru: 'opacity 1→0 · 220ms · ease · fill forwards · БЕЗ движения: слот зафиксирован, содержимое не ездит',
      en: 'opacity 1→0 · 220ms · ease · fill forwards · NO movement: the slot is fixed, its content does not travel',
    },
    kind: 'slot',
  },
  {
    name: 'rollIn',
    group: 'Слоты',
    desc: {
      ru: 'Новое содержимое проявляется — вторая половина подмены.',
      en: 'The new content fades in — the second half of a swap.',
    },
    detail: {
      ru: 'opacity 0→1 · 300ms · ease · fill both · delay держит новое невидимым, пока старое не ушло (последовательное появление)',
      en: 'opacity 0→1 · 300ms · ease · fill both · delay holds the incoming invisible until the outgoing clears (a sequential entrance)',
    },
    kind: 'slot',
  },
  {
    name: 'popIn',
    group: 'Слоты',
    desc: {
      ru: 'Маленький элемент появляется в зарезервированном слоте.',
      en: 'A small element appears in a reserved slot.',
    },
    detail: {
      ru: 'opacity 0→1 + scale 0.9→1 · 260ms · кривая SNAP (появление на месте, не полёт) · слот держит размер, соседи не сдвигаются',
      en: 'opacity 0→1 + scale 0.9→1 · 260ms · the SNAP curve (appearing in place, not a flight) · the slot keeps its size, neighbours do not shift',
    },
    kind: 'badge',
  },
  {
    name: 'popOut',
    group: 'Слоты',
    desc: {
      ru: 'Тот же элемент уходит из слота.',
      en: 'The same element leaves the slot.',
    },
    detail: {
      ru: 'opacity 1→0 + scale 1→0.92 · 200ms · ease',
      en: 'opacity 1→0 + scale 1→0.92 · 200ms · ease',
    },
    kind: 'badge',
  },
  {
    name: 'confettiFly',
    group: 'Праздник',
    desc: {
      ru: 'Одна частица хлопушки: выстрел, дуга через верх, падение с вращением.',
      en: 'One piece of a party popper: a throw, an arc over the top, a fall with spin.',
    },
    detail: {
      ru: '3 кадра: старт (ease-out) → пик дуги на 0.42 (ease-in) → падение и растворение · dx/dy — конечное смещение, peak — высота дуги, spin — оборот · пресет знает полёт ОДНОЙ частицы: их число, символы и разброс — на сцене',
      en: '3 keyframes: the throw (ease-out) → the arc peak at 0.42 (ease-in) → the fall and the fade · dx/dy — the final offset, peak — the arc height, spin — the turn · the preset knows ONE piece: the count, the symbols and the spread belong to the scene',
    },
    kind: 'confetti',
  },
  {
    name: 'shake',
    group: 'Фидбек',
    desc: {
      ru: 'Тряска влево-вправо — «не годится»: поле не заполнено, карты нет в руке.',
      en: 'Left-right shake — "this will not do": an empty field, a card not in the hand.',
    },
    detail: {
      ru: 'translateX по долям размаха · amp — размах (по умолчанию 7px), dur — время (380ms), shape — характер: settle (рывок и успокоение) или spring (два полных размаха, потом два поменьше)',
      en: 'translateX in fractions of the swing · amp — the swing (7px by default), dur — the time (380ms), shape — the character: settle (a jolt and a calm-down) or spring (two full swings, then two smaller ones)',
    },
    kind: 'shake',
  },
]

// The group string is a stable bucket key; GROUP_LABELS holds the visible heading.
const GROUP_ORDER = [
  'Переворот',
  'Появление',
  'Розыгрыш',
  'Колоды',
  'Добор',
  'Слоты',
  'Праздник',
  'Фидбек',
  'Без описания',
]
const GROUP_LABELS = new Map<string, Loc>([
  ['Переворот', { ru: 'Переворот', en: 'Flip' }],
  ['Появление', { ru: 'Появление', en: 'Appear' }],
  ['Розыгрыш', { ru: 'Розыгрыш', en: 'Play' }],
  ['Колоды', { ru: 'Колоды', en: 'Decks' }],
  ['Добор', { ru: 'Добор', en: 'Draw' }],
  ['Слоты', { ru: 'Слоты HUD', en: 'HUD slots' }],
  ['Праздник', { ru: 'Праздник', en: 'Celebration' }],
  ['Фидбек', { ru: 'Фидбек', en: 'Feedback' }],
  ['Без описания', { ru: 'Без описания', en: 'Undescribed' }],
])

// Registry presets without a spec — shown so the showcase keeps up with PRESETS.
// Their kind is 'none': the stage says there is no demo instead of running them
// through a travel they do not understand (a preset that ignores from/to would
// look like a fade in a flight scene — or, needing a param it is not given, do
// nothing at all and read as broken).
const KNOWN = new Set(SPECS.map((s) => s.name))
const EXTRA: Spec[] = presetNames()
  .filter((n) => !KNOWN.has(n))
  .map((name) => ({
    name,
    group: 'Без описания',
    desc: { ru: 'нет описания — добавь в SPECS', en: 'no description — add it to SPECS' },
    detail: { ru: '—', en: '—' },
    kind: 'none' as Kind,
  }))

const ALL = [...SPECS, ...EXTRA]

// ===== хлопушка: содержимое залпа — дело сцены, пресет знает одну частицу =====
const GLYPHS = ['{', '}', ';', '=>', '&&', '()', '/>']
const GLYPH_COLORS = ['var(--brand-green)', 'var(--select-accent)', 'var(--cat-support)']
const GLYPH_SIZES: TypographyBase[] = ['mono-sm', 'mono', 'mono-lg']
const BURST_N = 22 // частиц в залпе — показ, а не праздник в конце партии
const BURST_MS = 4200 // к этому времени всё долетело; узлы можно снимать

interface Pop {
  id: number
  glyph: string
  color: string
  base: TypographyBase
  dx: number
  dy: number
  peak: number
  spin: number
  dur: number
}

const rnd = (min: number, max: number) => min + Math.random() * (max - min)
const oneOf = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

let popSeq = 0
let burstSeq = 0

const burst = (): Pop[] =>
  Array.from({ length: BURST_N }, () => ({
    id: ++popSeq,
    glyph: oneOf(GLYPHS),
    color: oneOf(GLYPH_COLORS),
    base: oneOf(GLYPH_SIZES),
    dx: rnd(-420, 420),
    dy: rnd(260, 460),
    peak: rnd(180, 420),
    spin: rnd(-720, 720),
    dur: rnd(1800, 3000),
  }))

// A burst is INDEPENDENT: its pieces are made once and started once, in a
// mount-only effect. Starting them from a render-time ref callback would kill
// the pieces already in the air — the callback re-fires on every render and
// `play` stacks a second animation on a node mid-flight.
function Burst({ pieces }: { pieces: Pop[] }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const nodes = box.current?.children
    if (!nodes) return
    pieces.forEach((p, i) => {
      const node = nodes[i]
      if (node)
        play('confettiFly', node, { dx: p.dx, dy: p.dy, peak: p.peak, spin: p.spin, dur: p.dur })
    })
  }, [pieces])

  return (
    <div ref={box} className={styles.burst}>
      {pieces.map((p) => (
        <span key={p.id} className={styles.pop} style={{ color: p.color }}>
          <Typography as="span" base={p.base} tk="tk-02">
            {p.glyph}
          </Typography>
        </span>
      ))}
    </div>
  )
}

// Section headings, hint and placeholders.
const UI = {
  ru: {
    noPreset: 'пресет не выбран',
    pickPreset: 'выбери пресет слева',
    source: 'источник',
    noDemo: 'демо нет — задай пресету форму в SPECS',
    slotLabel: 'добор',
    slotLabelNext: 'ход соперника',
    badgeLabel: 'взял',
    hudLabel: 'блок интерфейса',
    dirFrom: 'откуда приходит',
    character: 'характер',
    dirs: { up: 'сверху', down: 'снизу', left: 'слева', right: 'справа', none: 'на месте' },
    foldMain: 'основная',
    foldAux: 'вспомогательная',
  },
  en: {
    noPreset: 'no preset selected',
    pickPreset: 'pick a preset on the left',
    source: 'source',
    noDemo: 'no demo — give the preset a form in SPECS',
    slotLabel: 'draw',
    slotLabelNext: 'opponent turn',
    badgeLabel: 'drawn',
    hudLabel: 'a HUD block',
    dirFrom: 'comes from',
    character: 'character',
    dirs: { up: 'above', down: 'below', left: 'the left', right: 'the right', none: 'in place' },
    foldMain: 'main',
    foldAux: 'aux',
  },
}

type Dir = 'up' | 'down' | 'left' | 'right' | 'none'
const DIR_ORDER: Dir[] = ['down', 'up', 'left', 'right', 'none']
const DIR_SHIFT: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -34 },
  down: { dx: 0, dy: 34 },
  left: { dx: -44, dy: 0 },
  right: { dx: 44, dy: 0 },
  none: { dx: 0, dy: 0 },
}
const SHAPE_ORDER: ShakeShape[] = ['settle', 'spring']

// the inner "filling" of a place: deck pile, discard scatter, seat avatar, etc.
function SceneVisual({ visual }: { visual: Visual }) {
  if (visual === 'deck') {
    return (
      <div className={styles.deck}>
        <Card card={DEMO} faceDown interactive={false} width={96} />
        <Card card={DEMO} faceDown interactive={false} width={96} />
        <Card card={DEMO} faceDown interactive={false} width={96} />
      </div>
    )
  }
  if (visual === 'discard') {
    return (
      <div className={styles.discard}>
        <Card card={CARDS[3]} interactive={false} width={96} />
        <Card card={CARDS[5]} interactive={false} width={96} />
      </div>
    )
  }
  if (visual === 'seat') {
    return (
      <div className={styles.seat}>
        <span className={styles.seatAvatar} aria-hidden="true" />
        <span className={styles.seatSlot} />
      </div>
    )
  }
  if (visual === 'hand') {
    return (
      <div className={styles.hand}>
        <span className={styles.handCard} />
        <span className={styles.handCard} />
        <span className={styles.handCard} />
      </div>
    )
  }
  // center / release / source — an empty "place", the frame provides the style
  return null
}

// the "landing" width — sets the arrival scale (a 150 card shrinks to the target)
function landingWidth(visual: Visual): number {
  if (visual === 'deck') return 96
  if (visual === 'seat') return 104
  return 150
}

function End({
  end,
  side,
  anchorRef,
}: {
  end: SceneEnd
  side: 'left' | 'right'
  anchorRef?: Ref<HTMLDivElement>
}) {
  const { lang } = useLang()
  const dashed = end.visual === 'center' || end.visual === 'source'
  return (
    <div className={`${styles.end} ${side === 'left' ? styles.endLeft : styles.endRight}`}>
      <span className={styles.endLabel}>{end.label[lang]}</span>
      <div
        className={`${styles.endBox} ${dashed ? styles.endDashed : ''} ${
          end.visual === 'release' ? styles.endRelease : ''
        }`}
      >
        <SceneVisual visual={end.visual} />
        {/* invisible anchor — the arrival target at the right size (shrink scale) */}
        {anchorRef && (
          <div
            ref={anchorRef}
            className={styles.landing}
            style={{ inlineSize: landingWidth(end.visual) } as CSSProperties}
          />
        )}
      </div>
    </div>
  )
}

export default function AnimationsStory() {
  const { lang } = useLang()
  const ui = UI[lang]
  const { preset } = useParams<{ preset?: string }>()
  const navigate = useNavigate()
  const cardRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const pairRef = useRef<HTMLDivElement>(null)
  const foldMainRef = useRef<HTMLDivElement>(null)
  const foldAuxRef = useRef<HTMLDivElement>(null)
  const [faceDown, setFaceDown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dir, setDir] = useState<Dir>('down')
  const [shape, setShape] = useState<ShakeShape>('settle')
  const [bursts, setBursts] = useState<{ id: number; pieces: Pop[] }[]>([])

  const spec = ALL.find((s) => s.name === preset)

  // an animation with fill:forwards keeps overwriting the element's own style —
  // every demo that runs twice has to clear the previous one first (I3)
  const clear = (el: Element | null) => {
    for (const a of el?.getAnimations() ?? []) a.cancel()
  }

  const run = async () => {
    if (!spec || busy) return

    if (spec.kind === 'flip') {
      clear(cardRef.current)
      setFaceDown((v) => !v) // Card plays flipCard itself via the registry
      return
    }
    if (spec.kind === 'shake') {
      clear(cardRef.current)
      // amp/dur stay at the preset's own defaults — the character is what the
      // page lets you feel, because it is what a caller actually chooses
      play('shake', cardRef.current, { shape })
      return
    }
    if (spec.kind === 'flyIn') {
      clear(cardRef.current)
      const from = ghostRef.current?.getBoundingClientRect()
      if (from) play('flyFrom', cardRef.current, { from })
      return
    }
    if (spec.kind === 'arrive') {
      clear(hudRef.current)
      play('hudIn', hudRef.current, { ...DIR_SHIFT[dir], dur: 480 })
      return
    }
    if (spec.kind === 'confetti') {
      const id = ++burstSeq
      setBursts((b) => [...b, { id, pieces: burst() }])
      window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), BURST_MS)
      return
    }
    if (spec.kind === 'slot' || spec.kind === 'badge') {
      // the slot holds its size and place; the preset only changes what is in it
      const el = spec.kind === 'slot' ? slotRef.current : badgeRef.current
      clear(el)
      setBusy(true)
      const anim = play(spec.name, el)
      if (anim) await anim.finished
      await wait(700)
      clear(el) // back to the resting state, ready for another run
      setBusy(false)
      return
    }
    if (spec.kind === 'fold') {
      const box = pairRef.current?.getBoundingClientRect()
      const mainFrom = foldMainRef.current?.getBoundingClientRect()
      const auxFrom = foldAuxRef.current?.getBoundingClientRect()
      const mainEl = pairRef.current?.querySelector<HTMLElement>('[data-main]')
      const auxEl = pairRef.current?.querySelector<HTMLElement>('[data-aux]')
      if (!box || !mainFrom || !auxFrom || !mainEl || !auxEl) return
      setBusy(true)
      clear(mainEl)
      clear(auxEl)
      // painted at their entry poses first — else the halves flash assembled
      mainEl.style.transform = enterPose(mainFrom, box)
      auxEl.style.transform = enterPose(auxFrom, box)
      await nextFrames()
      const a1 = play('foldIntoPair', mainEl, { from: mainFrom, box })
      const a2 = play('foldIntoPair', auxEl, {
        from: auxFrom,
        box,
        pose: PAIR_AUX_POSE,
        snap: true,
      })
      await Promise.all([a1?.finished, a2?.finished])
      await wait(900)
      clear(mainEl)
      clear(auxEl)
      mainEl.style.transform = ''
      auxEl.style.transform = PAIR_AUX_POSE // the pair's own resting pose
      setBusy(false)
      return
    }
    // travel: the card stands at "from", flies to "to" and returns
    clear(cardRef.current)
    setBusy(true)
    const from = cardRef.current?.getBoundingClientRect()
    const to = toRef.current?.getBoundingClientRect()
    if (!from || !to) return setBusy(false)
    // the discard lands with a turn/scatter — show jitter at the finish
    const j = spec.name === 'centerToDiscard' ? jitter() : null
    const params = j ? { from, to, rotate: j.rot, dx: j.dx, dy: j.dy } : { from, to }
    const anim = play(spec.name, cardRef.current, params)
    if (anim) await anim.finished
    await wait(700)
    clear(cardRef.current) // send the card home
    setBusy(false)
  }

  const isTravel = spec?.kind === 'travel'
  // the card is the demo body only for the forms that move a card
  const cardForms: Kind[] = ['flip', 'flyIn', 'shake', 'travel']
  const showCard = spec != null && cardForms.includes(spec.kind)
  const cardSlot = isTravel ? styles.slotLeft : styles.slotCenter

  return (
    <div className={styles.root}>
      <aside className={styles.catalog}>
        <p className={styles.hint}>
          {lang === 'ru' ? (
            <>
              Словарь анимаций — каждый кирпичик вызывается по имени: <code>play('name', el)</code>.
              Выбери пресет — пояснение и запуск сверху.
            </>
          ) : (
            <>
              Animation registry — each block is called by name: <code>play('name', el)</code>. Pick
              a preset — its explanation and launch are on top.
            </>
          )}
        </p>
        {GROUP_ORDER.map((group) => {
          const rows = ALL.filter((s) => s.group === group)
          if (rows.length === 0) return null
          return (
            <div key={group} className={styles.group}>
              <div className={styles.groupTitle}>{GROUP_LABELS.get(group)?.[lang] ?? group}</div>
              {rows.map((s) => (
                <button
                  type="button"
                  key={s.name}
                  className={`${styles.row} ${s.name === preset ? styles.rowActive : ''}`}
                  onClick={() => navigate(`/animations/${s.name}`)}
                >
                  <span className={styles.name}>{s.name}</span>
                  <span className={styles.rowDesc}>{s.desc[lang]}</span>
                </button>
              ))}
            </div>
          )
        })}
      </aside>

      <div className={styles.stageWrap}>
        {/* top area: title → description → divider → play */}
        <div className={styles.header}>
          <h2 className={styles.title}>{spec ? spec.name : ui.noPreset}</h2>
          {spec && (
            <div className={styles.desc}>
              <span className={styles.descMain}>{spec.desc[lang]}</span>
              <span className={styles.descDetail}>{spec.detail[lang]}</span>
            </div>
          )}
          <div className={styles.divider} />
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.playBtn}
              onClick={run}
              disabled={!spec || spec.kind === 'none' || busy}
            >
              ▶ play
            </button>

            {/* preset-specific parameters — only where the preset is meaningless
                without one: the direction it arrives from, the character it
                shakes with */}
            {spec?.kind === 'arrive' && (
              <div className={styles.params}>
                <span className={styles.paramLabel}>{ui.dirFrom}</span>
                {DIR_ORDER.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`${styles.chip} ${d === dir ? styles.chipActive : ''}`}
                    onClick={() => setDir(d)}
                  >
                    {ui.dirs[d]}
                  </button>
                ))}
              </div>
            )}
            {spec?.kind === 'shake' && (
              <div className={styles.params}>
                <span className={styles.paramLabel}>{ui.character}</span>
                {SHAPE_ORDER.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`${styles.chip} ${s === shape ? styles.chipActive : ''}`}
                    onClick={() => setShape(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.stage}>
          {!spec && <div className={styles.placeholder}>{ui.pickPreset}</div>}
          {spec?.kind === 'none' && <div className={styles.placeholder}>{ui.noDemo}</div>}

          {isTravel && spec?.from && <End end={spec.from} side="left" />}
          {isTravel && spec?.to && <End end={spec.to} side="right" anchorRef={toRef} />}
          {spec?.kind === 'flyIn' && (
            <div className={styles.ghost} ref={ghostRef}>
              {ui.source}
            </div>
          )}

          {/* HUD-слот: рамка стоит на месте, меняется только её содержимое */}
          {spec?.kind === 'slot' && (
            <div className={styles.hudSlot}>
              <div className={styles.slotBox}>
                <div ref={slotRef}>
                  <Typography base="mono-md" tk="tk-08">
                    {spec.name === 'rollIn' ? ui.slotLabelNext : ui.slotLabel}
                  </Typography>
                </div>
              </div>
            </div>
          )}

          {/* бейдж в зарезервированном слоте: соседи не сдвигаются */}
          {spec?.kind === 'badge' && (
            <div className={styles.hudSlot}>
              <div className={styles.badgeRow}>
                <Typography base="mono-sm" tk="tk-10">
                  ○ ○ ○
                </Typography>
                <span className={styles.badgeSlot}>
                  <span ref={badgeRef} className={styles.badge}>
                    <Typography as="span" base="mono-xs" tk="tk-10">
                      {ui.badgeLabel}
                    </Typography>
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* блок интерфейса приезжает на своё место */}
          {spec?.kind === 'arrive' && (
            <div className={styles.hudSlot}>
              <div className={styles.hudFrame}>
                <div ref={hudRef} className={styles.hudBlock}>
                  <Typography base="mono-sm" tk="tk-10">
                    {ui.hudLabel}
                  </Typography>
                </div>
              </div>
            </div>
          )}

          {/* складывание пары: две половины едут из своих мест в рамку пары */}
          {spec?.kind === 'fold' && (
            <div className={styles.foldStage}>
              <div className={styles.foldSrc} ref={foldMainRef}>
                <span className={styles.endLabel}>{ui.foldMain}</span>
              </div>
              <div className={styles.pairBox} ref={pairRef}>
                <CardPair main={DEMO} aux={CARDS[6]} />
              </div>
              <div className={styles.foldSrc} ref={foldAuxRef}>
                <span className={styles.endLabel}>{ui.foldAux}</span>
              </div>
            </div>
          )}

          {/* хлопушка: каждый залп — свой слой, свои частицы, свой старт */}
          {spec?.kind === 'confetti' && (
            <div className={styles.bursts}>
              {bursts.map((b) => (
                <Burst key={b.id} pieces={b.pieces} />
              ))}
            </div>
          )}

          {showCard && (
            <div className={`${styles.cardSlot} ${cardSlot}`}>
              <div ref={cardRef} className={styles.card}>
                <Card card={DEMO} faceDown={faceDown} interactive={false} width={150} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
