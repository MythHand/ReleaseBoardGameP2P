import { type CSSProperties, type Ref, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { jitter, play, presetNames, wait } from '@/animations'
import { CARDS } from '@/cards'
import Card from '@/primitives/Card'
import { type Lang, useLang } from '../../Playground/lang'
import styles from './AnimationsStory.module.css'

// Language: preset names, timings and terms (move/rotateY/ms/ease/fade/FLIP…)
// stay English in both languages; descriptive prose is bilingual via useLang().
type Loc = Record<Lang, string>

// how a preset is shown: flip in place, fly-in, shake or a from→to travel
type Kind = 'flip' | 'flyIn' | 'shake' | 'travel'
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
      ru: 'move · 480ms · snap-кривая (лёгкое пружинистое приземление)',
      en: 'move · 480ms · snap curve (a light springy landing)',
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
      ru: 'move · 420ms · ease · в паре с jitter() — разброс угла/смещения',
      en: 'move · 420ms · ease · paired with jitter() — angle/offset scatter',
    },
    kind: 'travel',
    from: { label: { ru: 'центр', en: 'center' }, visual: 'center' },
    to: { label: { ru: 'сброс', en: 'discard' }, visual: 'discard' },
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
    name: 'shake',
    group: 'Фидбек',
    desc: {
      ru: 'Тряска влево-вправо — фидбек «поле не заполнено».',
      en: 'Left-right shake — the "field is empty" feedback.',
    },
    detail: {
      ru: 'translateX ±7→0 · 380ms · ease · разовый триггер по событию',
      en: 'translateX ±7→0 · 380ms · ease · a one-shot event trigger',
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
  'Фидбек',
  'Без описания',
]
const GROUP_LABELS = new Map<string, Loc>([
  ['Переворот', { ru: 'Переворот', en: 'Flip' }],
  ['Появление', { ru: 'Появление', en: 'Appear' }],
  ['Розыгрыш', { ru: 'Розыгрыш', en: 'Play' }],
  ['Колоды', { ru: 'Колоды', en: 'Decks' }],
  ['Добор', { ru: 'Добор', en: 'Draw' }],
  ['Фидбек', { ru: 'Фидбек', en: 'Feedback' }],
  ['Без описания', { ru: 'Без описания', en: 'Undescribed' }],
])

// registry presets without a description — shown so the showcase keeps up with PRESETS
const KNOWN = new Set(SPECS.map((s) => s.name))
const EXTRA: Spec[] = presetNames()
  .filter((n) => !KNOWN.has(n))
  .map((name) => ({
    name,
    group: 'Без описания',
    desc: { ru: 'нет описания — добавь в SPECS', en: 'no description — add it to SPECS' },
    detail: { ru: '—', en: '—' },
    kind: 'travel' as Kind,
    from: { label: { ru: 'источник', en: 'source' }, visual: 'source' as Visual },
    to: { label: { ru: 'цель', en: 'target' }, visual: 'center' as Visual },
  }))

const ALL = [...SPECS, ...EXTRA]

// Section headings, hint and placeholders.
const UI = {
  ru: { noPreset: 'пресет не выбран', pickPreset: 'выбери пресет слева', source: 'источник' },
  en: { noPreset: 'no preset selected', pickPreset: 'pick a preset on the left', source: 'source' },
}

// the inner "filling" of a place: deck pile, discard scatter, seat avatar, etc.
function SceneVisual({ visual }: { visual: Visual }) {
  if (visual === 'deck') {
    return (
      <div className={styles.deck}>
        <Card card={DEMO} faceDown interactive={false} width="96px" />
        <Card card={DEMO} faceDown interactive={false} width="96px" />
        <Card card={DEMO} faceDown interactive={false} width="96px" />
      </div>
    )
  }
  if (visual === 'discard') {
    return (
      <div className={styles.discard}>
        <Card card={CARDS[3]} interactive={false} width="96px" />
        <Card card={CARDS[5]} interactive={false} width="96px" />
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
  const [faceDown, setFaceDown] = useState(false)
  const [busy, setBusy] = useState(false)

  const spec = ALL.find((s) => s.name === preset)

  const run = async () => {
    if (!spec || busy) return
    // biome-ignore lint/style/noNonNullAssertion: cardRef is always bound to the card
    const el = cardRef.current!
    for (const a of el.getAnimations()) a.cancel()

    if (spec.kind === 'flip') {
      setFaceDown((v) => !v) // Card plays flipCard itself via the registry
      return
    }
    if (spec.kind === 'shake') {
      play('shake', el)
      return
    }
    if (spec.kind === 'flyIn') {
      // biome-ignore lint/style/noNonNullAssertion: ghostRef exists for kind flyIn
      const from = ghostRef.current!.getBoundingClientRect()
      play('flyFrom', el, { from })
      return
    }
    // travel: the card stands at "from", flies to "to" and returns
    setBusy(true)
    const from = el.getBoundingClientRect()
    // biome-ignore lint/style/noNonNullAssertion: toRef exists for kind travel
    const to = toRef.current!.getBoundingClientRect()
    // the discard lands with a turn/scatter — show jitter at the finish
    const j = spec.name === 'centerToDiscard' ? jitter() : null
    const params = j ? { from, to, rotate: j.rot, dx: j.dx, dy: j.dy } : { from, to }
    const anim = play(spec.name, el, params)
    if (anim) await anim.finished
    await wait(700)
    for (const a of el.getAnimations()) a.cancel() // send the card home
    setBusy(false)
  }

  const isTravel = spec?.kind === 'travel'
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
            <button type="button" className={styles.playBtn} onClick={run} disabled={!spec || busy}>
              ▶ play
            </button>
            {/* space for preset-specific extra buttons */}
          </div>
        </div>

        <div className={styles.stage}>
          {!spec && <div className={styles.placeholder}>{ui.pickPreset}</div>}

          {isTravel && spec?.from && <End end={spec.from} side="left" />}
          {isTravel && spec?.to && <End end={spec.to} side="right" anchorRef={toRef} />}
          {spec?.kind === 'flyIn' && (
            <div className={styles.ghost} ref={ghostRef}>
              {ui.source}
            </div>
          )}

          {spec && (
            <div className={`${styles.cardSlot} ${cardSlot}`}>
              <div ref={cardRef} className={styles.card}>
                <Card card={DEMO} faceDown={faceDown} interactive={false} width="150px" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
