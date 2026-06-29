import { type CSSProperties, type Ref, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { jitter, play, presetNames, wait } from '@/animations'
import { CARDS } from '@/cards'
import Card from '@/primitives/Card'
import styles from './AnimationsStory.module.css'

// как показываем пресет: переворот на месте, влёт, тряска или перелёт откуда-куда
type Kind = 'flip' | 'flyIn' | 'shake' | 'travel'
// представление «места» в сцене (откуда/куда летит карта)
type Visual = 'hand' | 'center' | 'deck' | 'discard' | 'seat' | 'release' | 'source'

interface SceneEnd {
  label: string
  visual: Visual
}
interface Spec {
  name: string
  group: string
  desc: string
  // техническая суть: что под капотом (move/fade/scale, длительность, easing)
  detail: string
  kind: Kind
  from?: SceneEnd
  to?: SceneEnd
}

const DEMO = CARDS[1] // Security Bug

const SPECS: Spec[] = [
  {
    name: 'flipCard',
    group: 'Переворот',
    desc: 'Переворот карты лицо↔рубашка.',
    detail: 'rotateY 0↔180° · 420ms · ease · играет сам Card при смене faceDown',
    kind: 'flip',
  },
  {
    name: 'flyFrom',
    group: 'Появление',
    desc: 'FLIP-вылет: карта влетает «из» прошлого места в текущую позицию.',
    detail: 'старт из прошлого rect → translate(0) · 520ms · ease · появление из источника',
    kind: 'flyIn',
  },
  {
    name: 'playToCenter',
    group: 'Розыгрыш',
    desc: 'Выкладывание карты в центр стола (видно всем).',
    detail: 'move(from→to) · 480ms · ease · перелёт центр-в-центр + масштаб по ширине',
    kind: 'travel',
    from: { label: 'рука', visual: 'hand' },
    to: { label: 'центр стола', visual: 'center' },
  },
  {
    name: 'playToReleaseZone',
    group: 'Розыгрыш',
    desc: 'Карта в слот зоны релиза.',
    detail: 'move · 480ms · snap-кривая (лёгкое пружинистое приземление)',
    kind: 'travel',
    from: { label: 'рука', visual: 'hand' },
    to: { label: 'зона релиза', visual: 'release' },
  },
  {
    name: 'centerToDiscard',
    group: 'Розыгрыш',
    desc: 'Из центра в сброс.',
    detail: 'move · 420ms · ease · в паре с jitter() — разброс угла/смещения',
    kind: 'travel',
    from: { label: 'центр', visual: 'center' },
    to: { label: 'сброс', visual: 'discard' },
  },
  {
    name: 'gatherToDeck',
    group: 'Колоды',
    desc: 'Стопка летит к целевой колоде и приземляется.',
    detail: 'move · 520ms · ease · сбор сброса в новую колоду',
    kind: 'travel',
    from: { label: 'стопка сброса', visual: 'discard' },
    to: { label: 'колода', visual: 'deck' },
  },
  {
    name: 'absorbToDeck',
    group: 'Колоды',
    desc: 'Поглощение: летит в колоду и растворяется по ходу.',
    detail: 'move + fade(opacity→0) · 520ms · ease · слияние колод',
    kind: 'travel',
    from: { label: 'стопка', visual: 'deck' },
    to: { label: 'колода', visual: 'deck' },
  },
  {
    name: 'drawToCenter',
    group: 'Добор',
    desc: 'Карта выходит из колоды добора в центр стола.',
    detail: 'move · 480ms · ease · колода→центр (рубашкой вверх)',
    kind: 'travel',
    from: { label: 'колода добора', visual: 'deck' },
    to: { label: 'центр стола', visual: 'center' },
  },
  {
    name: 'dealToSeat',
    group: 'Добор',
    desc: 'Карта уходит к месту игрока и растворяется в скрытой руке.',
    detail: 'move + fade · 460ms · ease · в скрытую руку соперника',
    kind: 'travel',
    from: { label: 'центр', visual: 'center' },
    to: { label: 'место игрока', visual: 'seat' },
  },
  {
    name: 'returnToDeck',
    group: 'Добор',
    desc: 'Карта возвращается из центра в колоду с уменьшением.',
    detail: 'move · 480ms · ease · scale вниз до размера колоды',
    kind: 'travel',
    from: { label: 'центр', visual: 'center' },
    to: { label: 'колода', visual: 'deck' },
  },
  {
    name: 'shake',
    group: 'Фидбек',
    desc: 'Тряска влево-вправо — фидбек «поле не заполнено».',
    detail: 'translateX ±7→0 · 380ms · ease · разовый триггер по событию',
    kind: 'shake',
  },
]

const GROUP_ORDER = [
  'Переворот',
  'Появление',
  'Розыгрыш',
  'Колоды',
  'Добор',
  'Фидбек',
  'Без описания',
]

// пресеты словаря без описания — показываем, чтобы витрина не отставала от PRESETS
const KNOWN = new Set(SPECS.map((s) => s.name))
const EXTRA: Spec[] = presetNames()
  .filter((n) => !KNOWN.has(n))
  .map((name) => ({
    name,
    group: 'Без описания',
    desc: 'нет описания — добавь в SPECS',
    detail: '—',
    kind: 'travel' as Kind,
    from: { label: 'источник', visual: 'source' as Visual },
    to: { label: 'цель', visual: 'center' as Visual },
  }))

const ALL = [...SPECS, ...EXTRA]

// внутренняя «начинка» места: стопка колоды, разброс сброса, аватар места и т.п.
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
  // center / release / source — пустое «место», стиль задаёт рамка
  return null
}

// ширина «приземления» — задаёт масштаб прилёта (карта 150 → усадка к цели)
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
  const dashed = end.visual === 'center' || end.visual === 'source'
  return (
    <div className={`${styles.end} ${side === 'left' ? styles.endLeft : styles.endRight}`}>
      <span className={styles.endLabel}>{end.label}</span>
      <div
        className={`${styles.endBox} ${dashed ? styles.endDashed : ''} ${
          end.visual === 'release' ? styles.endRelease : ''
        }`}
      >
        <SceneVisual visual={end.visual} />
        {/* невидимый якорь — цель прилёта нужного размера (масштаб усадки) */}
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
    // biome-ignore lint/style/noNonNullAssertion: cardRef всегда привязан к карте
    const el = cardRef.current!
    for (const a of el.getAnimations()) a.cancel()

    if (spec.kind === 'flip') {
      setFaceDown((v) => !v) // Card сам играет flipCard через словарь
      return
    }
    if (spec.kind === 'shake') {
      play('shake', el)
      return
    }
    if (spec.kind === 'flyIn') {
      // biome-ignore lint/style/noNonNullAssertion: ghostRef есть при kind flyIn
      const from = ghostRef.current!.getBoundingClientRect()
      play('flyFrom', el, { from })
      return
    }
    // travel: карта стоит у «from», летит к «to» и возвращается
    setBusy(true)
    const from = el.getBoundingClientRect()
    // biome-ignore lint/style/noNonNullAssertion: toRef есть при kind travel
    const to = toRef.current!.getBoundingClientRect()
    // сброс ложится с разворотом/разбросом — показываем jitter в финале
    const j = spec.name === 'centerToDiscard' ? jitter() : null
    const params = j ? { from, to, rotate: j.rot, dx: j.dx, dy: j.dy } : { from, to }
    const anim = play(spec.name, el, params)
    if (anim) await anim.finished
    await wait(700)
    for (const a of el.getAnimations()) a.cancel() // вернуть карту домой
    setBusy(false)
  }

  const isTravel = spec?.kind === 'travel'
  const cardSlot = isTravel ? styles.slotLeft : styles.slotCenter

  return (
    <div className={styles.root}>
      <aside className={styles.catalog}>
        <p className={styles.hint}>
          Словарь анимаций — каждый кирпичик вызывается по имени: <code>play('name', el)</code>.
          Выбери пресет — пояснение и запуск сверху.
        </p>
        {GROUP_ORDER.map((group) => {
          const rows = ALL.filter((s) => s.group === group)
          if (rows.length === 0) return null
          return (
            <div key={group} className={styles.group}>
              <div className={styles.groupTitle}>{group}</div>
              {rows.map((s) => (
                <button
                  type="button"
                  key={s.name}
                  className={`${styles.row} ${s.name === preset ? styles.rowActive : ''}`}
                  onClick={() => navigate(`/animations/${s.name}`)}
                >
                  <span className={styles.name}>{s.name}</span>
                  <span className={styles.rowDesc}>{s.desc}</span>
                </button>
              ))}
            </div>
          )
        })}
      </aside>

      <div className={styles.stageWrap}>
        {/* верхняя область: заголовок → описание → дивайдер → play */}
        <div className={styles.header}>
          <h2 className={styles.title}>{spec ? spec.name : 'пресет не выбран'}</h2>
          {spec && (
            <div className={styles.desc}>
              <span className={styles.descMain}>{spec.desc}</span>
              <span className={styles.descDetail}>{spec.detail}</span>
            </div>
          )}
          <div className={styles.divider} />
          <div className={styles.controls}>
            <button type="button" className={styles.playBtn} onClick={run} disabled={!spec || busy}>
              ▶ play
            </button>
            {/* место под доп. кнопки конкретного пресета */}
          </div>
        </div>

        <div className={styles.stage}>
          {!spec && <div className={styles.placeholder}>выбери пресет слева</div>}

          {isTravel && spec?.from && <End end={spec.from} side="left" />}
          {isTravel && spec?.to && <End end={spec.to} side="right" anchorRef={toRef} />}
          {spec?.kind === 'flyIn' && (
            <div className={styles.ghost} ref={ghostRef}>
              источник
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
