import { useMemo, useRef, useState } from 'react'
import { nextFrames, play, wait } from '@/animations'
import { CARDS, cardById } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import Pile from '@/primitives/Pile'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { SEAT_COPY_RU } from '@/table/Seat/Seat'
import HoverSelect from '../controls/HoverSelect'
import styles from './DrawCardStory.module.css'
import { useHandInsert } from './useHandInsert'

// Сцена «взятие карты из колоды». Одиночный добор:
//   колода → центр (рубашкой вверх) → развилка.
//   обычная карта → адресат: игрок (переворот + ложится в руку) / соперник
//     (рубашкой вверх к его месту, dealToSeat);
//   триггер (Error 503 / AI) → переворачивается в центре ДЛЯ ВСЕХ и остаётся;
//     AI — дополнительно тянет карту из AI-колоды рядом (эффект — сторона логики).
// Мультидобор — следующим этапом.

const BASE = CARDS.filter((c) => c.deck === 'base')
const AI_DECK = CARDS.filter((c) => c.deck === 'ai')
const CARD_ASPECT = 1.4 // высота/ширина карты
const AI_HOLD = 4000 // задержка на столе при раскрытом AI-эффекте (4с)
const FLIP_MS = 420 // длительность flipCard — даём проиграть перевороту на месте

const ERROR_503 = 'trigger-error-503'
const AI_TRIGGER = 'trigger-ai'
// «случайная обычная» тянется из этого пула (3 любые обычные карты)
const ORDINARY_POOL = ['attack-security-bug', 'operation-git-branch', 'release-frontend']

type Forced = 'error503' | 'ai' | 'ordinary'
const FORCED_OPTIONS = [
  { value: 'error503', label: 'Error 503' },
  { value: 'ai', label: 'AI-триггер' },
  { value: 'ordinary', label: 'случайная обычная' },
]
const DECK_COUNTS = [1, 2, 3, 4]

const EMPTY_RELEASE: ReleaseSlots = { frontend: undefined, backend: undefined, database: undefined }

interface Opp {
  id: string
  name: string
  handCount: number
}
const INITIAL_OPPONENTS: Opp[] = [
  { id: 'p2', name: 'kernel_panic', handCount: 5 },
  { id: 'p3', name: 'segfault', handCount: 7 },
]

let uidSeq = 0
const nextUid = () => `d${++uidSeq}`
const makeHand = (): HandItem[] => BASE.slice(0, 6).map((card, i) => ({ uid: `h${i}`, card }))

function resolveForced(forced: Forced): CardType | undefined {
  if (forced === 'error503') return cardById(ERROR_503)
  if (forced === 'ai') return cardById(AI_TRIGGER)
  return cardById(ORDINARY_POOL[Math.floor(Math.random() * ORDINARY_POOL.length)])
}
const resolveAiCard = (): CardType | undefined =>
  AI_DECK[Math.floor(Math.random() * AI_DECK.length)]

// не-триггер карты добора (для остальных позиций мультидобора — просто в руку)
const NON_TRIGGER = BASE.filter((c) => c.category !== 'trigger')
const randomNonTrigger = (): CardType => NON_TRIGGER[Math.floor(Math.random() * NON_TRIGGER.length)]

// верхняя «карточная» область ячейки Pile (под картой у Pile есть подпись —
// поэтому rect ячейки выше самой карты; целимся в карту, а не в центр ячейки)
function cardAreaOf(cell: DOMRect) {
  return { left: cell.left, top: cell.top, width: cell.width, height: cell.width * CARD_ASPECT }
}

export default function DrawCardStory() {
  const [deckCount, setDeckCount] = useState(1)
  const [forced, setForced] = useState<Forced>('ordinary')
  const [forcedAt, setForcedAt] = useState(1) // на каком по счёту доборе вылезет форс-карта
  const [drawer, setDrawer] = useState('you')
  const [opponents, setOpponents] = useState<Opp[]>(INITIAL_OPPONENTS)
  const [hand, setHand] = useState<HandItem[]>(makeHand)
  // seq — идентификатор полёта: разные полёты = разные key у флайера, чтобы
  // React не переиспользовал Card (иначе смена faceDown крутит флип в полёте)
  const [flyer, setFlyer] = useState<{ card: CardType; faceDown: boolean; seq: number } | null>(
    null,
  )
  const [centerCard, setCenterCard] = useState<CardType | null>(null) // раскрытый триггер в центре
  const [aiCard, setAiCard] = useState<CardType | null>(null) // карта из AI-колоды рядом
  const [discard, setDiscard] = useState<{ top: CardType | null; count: number }>({
    top: null,
    count: 0,
  })
  // уходящие карты при разрешении AI (триггер → сброс, эффект → колода)
  const [outs, setOuts] = useState<{ key: string; card: CardType; faceDown: boolean }[]>([])
  const [busy, setBusy] = useState(false)

  const nextCard = useMemo(() => resolveForced(forced), [forced])

  const deckRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const seatRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const centerRef = useRef<HTMLDivElement>(null) // staging / Error 503 — в центре
  const causeRef = useRef<HTMLDivElement>(null) // AI-триггер (причина) — слева, обычный размер
  const effectRef = useRef<HTMLDivElement>(null) // AI-эффект (главная) — крупнее, в центре
  const aiRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const outRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const handRef = useRef<HTMLDivElement>(null)
  const flightSeq = useRef(0)

  const {
    gapAt,
    overlay,
    insert,
    reset: resetInsert,
  } = useHandInsert(handRef, (card, gap) => {
    setHand((h) => {
      const copy = [...h]
      copy.splice(gap, 0, { uid: nextUid(), card })
      return copy
    })
  })

  const drawerOptions = [
    { value: 'you', label: 'игрок' },
    ...opponents.map((o) => ({ value: o.id, label: o.name })),
  ]

  // игрок: остановка в центре → переворот лицом вверх → ложится в руку
  const toPlayerHand = async (card: CardType) => {
    await wait(220)
    setFlyer((f) => (f ? { ...f, faceDown: false } : f))
    await wait(560) // даём flipCard проиграть (420) + пауза
    const r = flyerRef.current?.getBoundingClientRect()
    setFlyer(null)
    if (r) insert(card, { left: r.left, top: r.top, width: r.width, height: r.height }, hand.length)
  }

  // соперник: уходит к его месту рубашкой вверх и тонет в скрытой руке
  const toOpponent = async (oppId: string) => {
    await wait(160)
    const el = flyerRef.current
    const seatRect = seatRefs.current[oppId]?.getBoundingClientRect()
    const fromRect = el?.getBoundingClientRect()
    if (el && seatRect && fromRect) {
      // целимся в карточную область у места соперника с лёгким уменьшением
      // (а не в широкий Seat — иначе карта раздувается до его ширины)
      const w = fromRect.width * 0.7
      const to = {
        left: seatRect.left + seatRect.width / 2 - w / 2,
        top: seatRect.top + seatRect.height / 2 - (w * CARD_ASPECT) / 2,
        width: w,
        height: w * CARD_ASPECT,
      }
      const anim = play('dealToSeat', el, { from: fromRect, to })
      if (anim) await anim.finished
    }
    setOpponents((os) => os.map((o) => (o.id === oppId ? { ...o, handCount: o.handCount + 1 } : o)))
    setFlyer(null)
  }

  // триггер (Error 503 / AI): переворачивается в центре для всех и остаётся
  const revealForAll = async (card: CardType) => {
    await wait(220)
    setFlyer((f) => (f ? { ...f, faceDown: false } : f))
    await wait(560) // даём flipCard проиграть + пауза
    setCenterCard(card) // карта остаётся раскрытой в центре
    setFlyer(null)
  }

  // AI: тянется карта из AI-колоды в центр КАК ГЛАВНАЯ — крупнее триггера
  // (триггер при этом стоит слева как причина). Эффект — сторона логики, потом.
  const drawAiEffect = async (): Promise<CardType | undefined> => {
    const ai = resolveAiCard()
    const aiCell = aiRef.current?.getBoundingClientRect()
    const toRect = effectRef.current?.getBoundingClientRect()
    if (!ai) return undefined
    setFlyer({ card: ai, faceDown: true, seq: ++flightSeq.current })
    await nextFrames()
    const el = flyerRef.current
    if (el && aiCell && toRect) {
      const from = cardAreaOf(aiCell)
      el.style.left = `${from.left}px`
      el.style.top = `${from.top}px`
      el.style.width = `${from.width}px`
      // целимся в крупный слот эффекта — карта приходит увеличенной
      const anim = play('drawToCenter', el, { from, to: toRect })
      if (anim) await anim.finished
      for (const a of el.getAnimations()) a.cancel()
      el.style.left = `${toRect.left}px`
      el.style.top = `${toRect.top}px`
      el.style.width = `${toRect.width}px`
    }
    await wait(160)
    setFlyer((f) => (f ? { ...f, faceDown: false } : f))
    await wait(560)
    setAiCard(ai)
    setFlyer(null)
    return ai
  }

  // триггер уходит в сброс (как был, лицом вверх)
  const leaveTrigger = async (fromRect?: DOMRect, discardRect?: DOMRect) => {
    const el = outRefs.current.trig
    if (!el || !fromRect || !discardRect) return
    const anim = play('centerToDiscard', el, { from: fromRect, to: cardAreaOf(discardRect) })
    if (anim) await anim.finished
  }

  // эффект сперва переворачивается рубашкой НА МЕСТЕ (консистентно с вводом карт
  // в игру), и эта задержка разводит траектории; затем возвращается в AI-колоду
  // с уменьшением до размера колоды (returnToDeck)
  const leaveEffect = async (fromRect?: DOMRect, deckRect?: DOMRect) => {
    setOuts((os) => os.map((o) => (o.key === 'eff' ? { ...o, faceDown: true } : o)))
    await wait(FLIP_MS)
    const el = outRefs.current.eff
    if (!el || !fromRect || !deckRect) return
    const anim = play('returnToDeck', el, { from: fromRect, to: cardAreaOf(deckRect) })
    if (anim) await anim.finished
  }

  // разрешение AI: пауза на столе → триггер в сброс и эффект в колоду
  // (одновременный старт, эффект со стаггером от переворота)
  const resolveAi = async (trig: CardType, eff: CardType) => {
    await wait(AI_HOLD)
    const causeRect = causeRef.current?.getBoundingClientRect()
    const effectRect = effectRef.current?.getBoundingClientRect()
    const discardRect = discardRef.current?.getBoundingClientRect()
    const aiDeckRect = aiRef.current?.getBoundingClientRect()
    // статичные карты становятся флайерами на своих местах
    setOuts([
      { key: 'trig', card: trig, faceDown: false },
      { key: 'eff', card: eff, faceDown: false },
    ])
    setCenterCard(null)
    setAiCard(null)
    await nextFrames()
    const tEl = outRefs.current.trig
    if (tEl && causeRect) {
      tEl.style.left = `${causeRect.left}px`
      tEl.style.top = `${causeRect.top}px`
      tEl.style.width = `${causeRect.width}px`
    }
    const eEl = outRefs.current.eff
    if (eEl && effectRect) {
      eEl.style.left = `${effectRect.left}px`
      eEl.style.top = `${effectRect.top}px`
      eEl.style.width = `${effectRect.width}px`
    }
    await Promise.all([leaveTrigger(causeRect, discardRect), leaveEffect(effectRect, aiDeckRect)])
    setOuts([])
    setDiscard((d) => ({ top: trig, count: d.count + 1 }))
  }

  // один добор: конкретная карта из конкретной колоды → центр → развилка.
  // busy/очистку центра ведёт вызывающий (draw / drawBatch). Возвращает, можно
  // ли тянуть дальше: false — триггер ждёт своей (игровой) логики, пачка стоп.
  const drawOne = async (card: CardType, deckIndex: number): Promise<boolean> => {
    const isAi = card.id === AI_TRIGGER
    const deckCell = deckRefs.current[deckIndex]?.getBoundingClientRect()
    // AI-триггер садится слева (как причина), остальное — в центр
    const stageRect = (isAi ? causeRef : centerRef).current?.getBoundingClientRect()

    // 1) колода → staging (рубашкой вверх) через пресет drawToCenter
    setFlyer({ card, faceDown: true, seq: ++flightSeq.current })
    await nextFrames()
    const el = flyerRef.current
    if (el && deckCell && stageRect) {
      const from = cardAreaOf(deckCell)
      el.style.left = `${from.left}px`
      el.style.top = `${from.top}px`
      el.style.width = `${from.width}px`
      const anim = play('drawToCenter', el, { from, to: stageRect })
      if (anim) await anim.finished
      // фиксируем флайер на месте (identity), чтобы следующий полёт стартовал отсюда
      for (const a of el.getAnimations()) a.cancel()
      el.style.left = `${stageRect.left}px`
      el.style.top = `${stageRect.top}px`
      el.style.width = `${stageRect.width}px`
    }

    // 2) развилка по типу карты
    if (card.category === 'trigger') {
      await revealForAll(card)
      if (isAi) {
        const eff = await drawAiEffect()
        // пауза → триггер в сброс, эффект обратно в колоду
        if (eff) await resolveAi(card, eff)
        return true // AI отыграл — можно тянуть дальше
      }
      // Error 503: остаётся раскрытым, разрешение — игровая логика (нет фикс.
      // сценария) → пачка ждёт его завершения, дальше пока не тянем
      return false
    }
    if (drawer === 'you') await toPlayerHand(card)
    else await toOpponent(drawer)
    return true
  }

  // одиночный добор форс-карты из конкретной колоды (клик по колоде)
  const draw = async (deckIndex: number) => {
    if (busy || !nextCard) return
    setBusy(true)
    setCenterCard(null)
    setAiCard(null)
    await drawOne(nextCard, deckIndex)
    setBusy(false)
  }

  // мультидобор (кнопка): по карте из каждой колоды, по очереди. Форс-карта —
  // на позиции «очередь», остальные позиции — случайные не-триггер карты.
  const drawBatch = async () => {
    if (busy) return
    setBusy(true)
    setCenterCard(null)
    setAiCard(null)
    const forcedCard = resolveForced(forced)
    const seq: CardType[] = Array.from({ length: deckCount }, (_, i) =>
      i + 1 === forcedAt ? (forcedCard ?? randomNonTrigger()) : randomNonTrigger(),
    )
    for (let i = 0; i < seq.length; i++) {
      // триггер без отыгранной логики останавливает пачку (дальше не тянем)
      const canContinue = await drawOne(seq[i], i)
      if (!canContinue) break
    }
    setBusy(false)
  }

  const reset = () => {
    setOpponents(INITIAL_OPPONENTS)
    setHand(makeHand())
    setFlyer(null)
    setCenterCard(null)
    setAiCard(null)
    setDiscard({ top: null, count: 0 })
    setOuts([])
    setBusy(false)
    resetInsert()
  }

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <button type="button" className={styles.btn} onClick={reset}>
          сброс
        </button>
        <HoverSelect
          label="колод добора"
          value={String(deckCount)}
          options={DECK_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => {
            const n = Number(v)
            setDeckCount(n)
            if (forcedAt > n) setForcedAt(n) // подрезаем позицию под число колод
          }}
        />
        <HoverSelect label="тянет" value={drawer} options={drawerOptions} onChange={setDrawer} />
        <HoverSelect
          label="вытянется"
          value={forced}
          options={FORCED_OPTIONS}
          onChange={(v) => setForced(v as Forced)}
        />
        {deckCount > 1 && (
          <HoverSelect
            label="очередь"
            value={String(forcedAt)}
            options={Array.from({ length: deckCount }, (_, i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
            onChange={(v) => setForcedAt(Number(v))}
          />
        )}
        {nextCard && (
          <div className={styles.preview}>
            <span className={styles.previewLabel}>следующая</span>
            <Card card={nextCard} interactive={false} width="46px" />
          </div>
        )}
      </div>

      {/* соперники — сверху, как на столе */}
      <div className={styles.opponents}>
        {opponents.map((o) => (
          <div
            key={o.id}
            ref={(el) => {
              seatRefs.current[o.id] = el
            }}
          >
            <Seat
              player={{ id: o.id, name: o.name, handCount: o.handCount, release: EMPTY_RELEASE }}
              copy={SEAT_COPY_RU}
            />
          </div>
        ))}
      </div>

      {/* центр стола — staging добора; Error 503 остаётся тут (для всех) */}
      <div className={styles.center} ref={centerRef}>
        {centerCard && centerCard.id !== AI_TRIGGER && (
          <Card card={centerCard} interactive={false} width="100%" />
        )}
      </div>

      {/* AI-триггер (причина) — слева от центра, обычный размер */}
      <div className={styles.causeSlot} ref={causeRef} aria-hidden={centerCard?.id !== AI_TRIGGER}>
        {centerCard?.id === AI_TRIGGER && (
          <Card card={centerCard} interactive={false} width="100%" />
        )}
      </div>

      {/* AI-эффект (главная) — в центре, крупнее */}
      <div className={styles.effectSlot} ref={effectRef} aria-hidden={!aiCard}>
        {aiCard && <Card card={aiCard} interactive={false} width="100%" />}
      </div>

      {/* колоды добора (клик — тянем карту) + колода событий AI */}
      <div className={styles.decks}>
        {Array.from({ length: deckCount }, (_, i) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only добор кликом по колоде; sandbox story
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: колоды — позиционные ячейки сцены, без стабильного id
            key={`deck-${i}`}
            ref={(el) => {
              deckRefs.current[i] = el
            }}
            className={`${styles.deck} ${styles.drawable}`}
            onMouseDown={() => draw(i)}
          >
            <Pile label="колода" deck="base" count={40} width="150px" countPos="tl" />
          </div>
        ))}
        <div className={styles.ai} ref={aiRef}>
          <Pile label="события" deck="ai" count={12} width="150px" countPos="tl" />
        </div>
      </div>

      {/* кнопка добора — под колодами (колоды не двигаем) */}
      <button type="button" className={styles.drawBtn} onClick={drawBatch} disabled={busy}>
        добрать
      </button>

      {/* сброс — справа, как на столе */}
      <div className={styles.discard} ref={discardRef}>
        <Pile label="сброс" topCard={discard.top} count={discard.count} width="116px" />
      </div>

      {/* рука игрока — снизу веером */}
      <div className={styles.handWrap} ref={handRef}>
        <Hand items={hand} gapAt={gapAt} />
      </div>

      {/* летящая карта добора — key по seq: новый полёт = свежий Card (без флипа) */}
      {flyer && (
        <div key={flyer.seq} className={styles.flyer} ref={flyerRef}>
          <Card card={flyer.card} faceDown={flyer.faceDown} interactive={false} width="100%" />
        </div>
      )}

      {/* уходящие карты при разрешении AI (триггер → сброс, эффект → колода) */}
      {outs.map((o) => (
        <div
          key={o.key}
          className={styles.flyer}
          ref={(el) => {
            outRefs.current[o.key] = el
          }}
        >
          <Card card={o.card} faceDown={o.faceDown} interactive={false} width="100%" />
        </div>
      ))}
      {overlay}
    </div>
  )
}
