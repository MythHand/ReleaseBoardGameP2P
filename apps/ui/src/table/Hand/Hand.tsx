import type React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import { CARD_W, handStep, slotPlacement } from './fan'
import styles from './Hand.module.css'

// Геометрия веера (наклон/дуга/шаг/ширина) — в едином модуле ./fan.
// handStep ре-экспортируем, чтобы потребители не зависели от пути модуля.
export { handStep } from './fan'

// Ховер: наведённая карта НЕ увеличивается на месте и НЕ выходит на верхний
// слой — только деликатный подъём + расступание соседей. Читаемость даёт
// отдельный зум-превью (единая модель для всех рук; это и убирает рывок при
// захвате — карта в руке и летящая одного размера).
const HOVER_LIFT = 28 // подъём наведённой карты
const NEIGHBOR_PUSH = 36 // насколько соседи расступаются

// --card-aspect (368 / 515) as width/height and its inverse.
const CARD_WH = 368 / 515
const CARD_H = CARD_W / CARD_WH // card height at CARD_W — for the drag flyer
// How far above the hand's top edge still counts as "over the hand" (reorder);
// pulling further up = playing the card onto the table.
const BAND_PAD = 32
// how long a card takes to glide back into the hand (reorder settle / rejected
// return) — a readable motion, not an instant snap
const SETTLE_MS = 340
// pointer travel (px) that turns a press into a drag; below it a release is a
// click (→ onCardClick). Lets click-to-play (arrow flows) and drag coexist.
const DRAG_THRESHOLD = 6

// Hover zoom preview — a separate enlarged card ABOVE the hand, centred over it,
// in the upper band with air from the screen edges (Hearthstone-style readability
// that never resizes the physical card you grab).
const ZOOM_TOP_AIR = 32 // min gap from the top edge
const ZOOM_GAP = 44 // gap between the preview and the hand (sits a touch higher)
const ZOOM_MIN_H = 240
const ZOOM_MAX_H = 460

export interface HandItem {
  uid: string
  card: CardType
}

// Per-card state — mirrors the engine's answer (PlayerView.playable / frozen);
// the Hand never computes legality, it only reflects it.
export type HandCardState = 'idle' | 'playable' | 'selected' | 'disabled'

// Card face state passed to Card (glow). `disabled` is handled by the Hand's own
// dim wrapper (a transitioned filter), so it never reaches Card as `disabled`.
type FaceState = 'idle' | 'playable' | 'selected'

// Per-slot render context — everything Hand computed for that slot's face, so a
// custom renderer can reproduce (or replace) the default face.
export interface HandFaceContext {
  faceDown: boolean
  tilt: boolean
  width: number
  state: FaceState
  accent?: string
}

// Where a played card was released — enough for the consumer to pick the intent
// and continue the flight from where the Hand's flyer left off.
export interface HandPlayDrop {
  x: number
  y: number
  rect?: DOMRect
}

// Default face — the flat-PNG Card. A consumer can override via `renderFace`
// (e.g. the playground swapping in the composed CardParallax face).
function defaultFace(item: HandItem, ctx: HandFaceContext): React.ReactNode {
  return (
    <Card
      card={item.card}
      faceDown={ctx.faceDown}
      interactive={false}
      tilt={ctx.tilt}
      width={ctx.width}
      state={ctx.state}
      accent={ctx.accent}
    />
  )
}

interface HandProps {
  items: HandItem[]
  faceDown?: boolean
  // индекс «вставочного» промежутка: веер раскладывается как на n+gapSize карт,
  // оставляя слоты gapAt…gapAt+gapSize-1 пустыми (под прилетающие карты).
  // null — обычная рука.
  gapAt?: number | null
  // ширина промежутка в картах (по умолчанию 1). Больше единицы нужно, когда в
  // руку одновременно возвращается несколько карт (отмена сборки комбо) — веер
  // должен раздвинуться заранее сразу под все, иначе карты сядут внахлёст и
  // соседи разъедутся уже ПОСЛЕ приземления.
  gapSize?: number
  // клик по карте (для розыгрыша): отдаёт индекс, DOM-элемент слота и событие.
  // Игнорируется в drag-режиме (когда задан onPlay/onReorder).
  onCardClick?: (index: number, el: HTMLElement, e: React.MouseEvent) => void
  // подсветка карты по индексу: вернуть цвет свечения (цель стрелки) или undefined
  accentAt?: (index: number) => string | undefined
  // состояние карты по индексу — из движка (PlayerView). idle по умолчанию.
  stateAt?: (index: number) => HandCardState
  // ===== drag-режим (canonical «взять-потащить») — включается, если задан
  // любой из колбэков ниже. Ховер и внутренняя перестановка живут в Hand; розыгрыш
  // (карта уходит из руки) отдаётся наружу — intent выбирает потребитель. =====
  // карту отпустили ВНЕ руки (на стол): вернуть true, если розыгрыш ПРИНЯТ
  // (потребитель забирает карту). false/undefined → карта уходит обратно в руку
  // (нельзя «уронить в никуда»). Валидность цели решает потребитель.
  onPlay?: (uid: string, drop: HandPlayDrop) => boolean
  // карту отпустили ВНУТРИ руки: локальная перестановка на индекс toIndex.
  onReorder?: (uid: string, toIndex: number) => void
  // переопределение отрисовки лицевой стороны слота (по умолчанию — PNG Card)
  renderFace?: (item: HandItem, ctx: HandFaceContext) => React.ReactNode
}

interface DragState {
  uid: string
  card: CardType
}

interface ZoomState {
  uid: string
  card: CardType
  left: number
  top: number
  width: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Рука веером. Ховер поднимает/читает карту и раздвигает соседей;
 * добавление/удаление карт плавно переукладывает веер (CSS-transition).
 * gapAt (+ gapSize) открывает промежуток под вставку — соседние карты разъезжаются.
 * В drag-режиме (onPlay/onReorder) карту можно взять мышкой: перетащить внутри
 * руки — переставить; вытащить на стол — разыграть (отдаётся наружу).
 */
export default function Hand({
  items,
  faceDown = false,
  gapAt = null,
  gapSize = 1,
  onCardClick,
  accentAt,
  stateAt,
  onPlay,
  onReorder,
  renderFace = defaultFace,
}: HandProps) {
  // ховер по UID (не по индексу) — при удалении карты индекс «съезжает» на
  // соседа и та вспыхивает фантомом; uid этого не допускает.
  const [hoveredUid, setHoveredUid] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  // куда ляжет карта при перестановке (слот в веере); null — тащим на стол
  const [preview, setPreview] = useState<number | null>(null)
  // отдельный зум-превью наведённой карты (над рукой)
  const [zoomView, setZoomView] = useState<ZoomState | null>(null)
  const [zoomShown, setZoomShown] = useState(false) // for the fade in/out

  const handRef = useRef<HTMLDivElement>(null)
  const flyerRef = useRef<HTMLDivElement>(null)
  const grab = useRef<{ fracX: number; fracY: number } | null>(null)
  const cursor = useRef({ x: 0, y: 0 })
  const zoomHide = useRef<number | null>(null)

  const n = items.length
  const dragEnabled = Boolean(onPlay ?? onReorder)
  // ховер подавлен во время перетаскивания
  const hovered = drag ? null : hoveredUid
  const hoveredIndex = hovered ? items.findIndex((it) => it.uid === hovered) : -1

  // индекс слота в веере, куда целится курсор (для перестановки)
  const slotUnderCursor = (clientX: number): number => {
    const hr = handRef.current?.getBoundingClientRect()
    if (!hr) return 0
    const step = handStep(n)
    return clamp(Math.round((clientX - (hr.left + hr.width / 2)) / step + (n - 1) / 2), 0, n - 1)
  }
  const inBand = (clientY: number): boolean => {
    const hr = handRef.current?.getBoundingClientRect()
    return hr ? clientY >= hr.top - BAND_PAD : false
  }

  // begin the actual drag (grab point from the press coords, base fan geometry —
  // so grabbing an enlarged hovered card doesn't offset the pick-up)
  function beginDrag(i: number, downX: number, downY: number) {
    const item = items[i]
    const hr = handRef.current?.getBoundingClientRect()
    if (!hr) return
    const base = slotPlacement(i, n)
    const cardLeft = hr.left + hr.width / 2 + base.x - CARD_W / 2
    const cardTop = hr.bottom + base.y - CARD_H
    grab.current = {
      fracX: clamp((downX - cardLeft) / CARD_W, 0, 1),
      fracY: clamp((downY - cardTop) / CARD_H, 0, 1),
    }
    setHoveredUid(null) // don't let the pick-up's hover linger after the drag ends
    setDrag({ uid: item.uid, card: item.card })
    setPreview(inBand(downY) ? i : null)
  }

  // press on a card: without drag-mode → a plain click (onCardClick). With
  // drag-mode → arm; move past the threshold turns it into a drag, a release
  // before that is a click. So click-to-play and drag-to-reorder coexist.
  function onSlotDown(i: number, el: HTMLElement, e: React.MouseEvent) {
    if (drag) return
    if (!dragEnabled) {
      onCardClick?.(i, el, e)
      return
    }
    e.preventDefault() // no text selection on press
    const downX = e.clientX
    const downY = e.clientY
    const teardown = () => {
      window.removeEventListener('mousemove', armMove)
      window.removeEventListener('mouseup', armUp)
    }
    const armMove = (me: MouseEvent) => {
      if (Math.hypot(me.clientX - downX, me.clientY - downY) < DRAG_THRESHOLD) return
      teardown()
      cursor.current = { x: me.clientX, y: me.clientY }
      beginDrag(i, downX, downY)
    }
    const armUp = () => {
      teardown()
      onCardClick?.(i, el, e) // released without moving → a click
    }
    window.addEventListener('mousemove', armMove)
    window.addEventListener('mouseup', armUp)
  }

  // drag lifecycle: the flyer follows the cursor; release inside the hand →
  // reorder, outside → play
  // biome-ignore lint/correctness/useExhaustiveDependencies: drag is the trigger; handlers use the closures captured when the drag began
  useEffect(() => {
    if (!drag) return
    const place = () => {
      const el = flyerRef.current
      const g = grab.current
      if (el && g) {
        el.style.left = `${cursor.current.x - g.fracX * CARD_W}px`
        el.style.top = `${cursor.current.y - g.fracY * CARD_H}px`
      }
    }
    place()
    const onMove = (e: MouseEvent) => {
      cursor.current = { x: e.clientX, y: e.clientY }
      place()
      setPreview(inBand(e.clientY) ? slotUnderCursor(e.clientX) : null)
    }
    // glide the flyer into a hand slot, then commit — the "back into the hand"
    // motion, used both for reordering and for returning a rejected play
    const settleInto = (targetIndex: number, commit?: () => void) => {
      setPreview(targetIndex) // hold the gap where it lands
      const hr = handRef.current?.getBoundingClientRect()
      const el = flyerRef.current
      if (hr && el) {
        const base = slotPlacement(targetIndex, n)
        // drop into the target slot's layer NOW, so it glides back BETWEEN the
        // cards (tucks under the right neighbours) instead of riding on top
        el.style.zIndex = `${base.z}`
        el.style.transition =
          `left ${SETTLE_MS}ms var(--ease-out), top ${SETTLE_MS}ms var(--ease-out), ` +
          `transform ${SETTLE_MS}ms var(--ease-out)`
        el.style.left = `${hr.left + hr.width / 2 + base.x - CARD_W / 2}px`
        el.style.top = `${hr.bottom + base.y - CARD_H}px`
        el.style.transform = `rotate(${base.rotate}deg)`
      }
      window.setTimeout(() => {
        commit?.()
        setDrag(null)
        setPreview(null)
      }, SETTLE_MS)
    }

    const onUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (inBand(e.clientY)) {
        const to = slotUnderCursor(e.clientX)
        settleInto(to, () => onReorder?.(drag.uid, to))
        return
      }
      // out of the hand → play, but only if the consumer accepts the drop;
      // otherwise the card glides back to where it came from (never vanishes)
      const accepted =
        onPlay?.(drag.uid, {
          x: e.clientX,
          y: e.clientY,
          rect: flyerRef.current?.getBoundingClientRect(),
        }) === true
      if (accepted) {
        setDrag(null)
        setPreview(null)
      } else {
        settleInto(items.findIndex((it) => it.uid === drag.uid))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag])

  // hover zoom preview: a separate enlarged card centred above the hand, sized to
  // the free band above it (with air from the top). Hidden while dragging.
  useLayoutEffect(() => {
    if (zoomHide.current) {
      clearTimeout(zoomHide.current)
      zoomHide.current = null
    }
    // no zoom for a face-down hand (a card back has nothing to read) or mid-drag
    if (faceDown || drag || !hoveredUid) {
      setZoomShown(false)
      zoomHide.current = window.setTimeout(() => setZoomView(null), 220)
      return
    }
    const item = items.find((it) => it.uid === hoveredUid)
    const hr = handRef.current?.getBoundingClientRect()
    if (!item || !hr) return
    const h = clamp(hr.top - ZOOM_TOP_AIR - ZOOM_GAP, ZOOM_MIN_H, ZOOM_MAX_H)
    const w = h * CARD_WH
    setZoomView({
      uid: item.uid,
      card: item.card,
      left: hr.left + hr.width / 2 - w / 2,
      top: hr.top - ZOOM_GAP - h,
      width: w,
    })
    const id = requestAnimationFrame(() => setZoomShown(true))
    return () => cancelAnimationFrame(id)
  }, [hoveredUid, drag, items, faceDown])

  // placement per uid — with the dragged card lifted out and (in-band) a gap at
  // `preview`; otherwise the usual layout (with optional insert gapAt).
  const placement = new Map<string, { slot: number; total: number }>()
  if (drag) {
    const rest = items.filter((it) => it.uid !== drag.uid)
    const total = preview == null ? n - 1 : n
    rest.forEach((it, k) => {
      const slot = preview != null && k >= preview ? k + 1 : k
      placement.set(it.uid, { slot, total })
    })
  } else {
    const gap = gapAt == null ? 0 : Math.max(1, Math.round(gapSize))
    const total = n + gap
    items.forEach((it, i) => {
      placement.set(it.uid, { slot: gapAt != null && i >= gapAt ? i + gap : i, total })
    })
  }

  return (
    <div className={styles.hand} ref={handRef}>
      {items.map((item, i) => {
        if (drag?.uid === item.uid) return null // lifted onto the flyer
        const p = placement.get(item.uid)
        if (!p) return null
        const base = slotPlacement(p.slot, p.total)
        let { rotate, x, y } = base
        const z = base.z

        // hover: gentle lift + straighten, neighbours part — that's all. No
        // in-place scale, no jump to the top layer (card stays in its fan layer;
        // readability is on the zoom preview).
        if (hoveredIndex >= 0 && gapAt == null && !drag) {
          if (hoveredIndex === i) {
            rotate = 0
            y -= HOVER_LIFT
          } else {
            const dir = i < hoveredIndex ? -1 : 1
            x += dir * (NEIGHBOR_PUSH / Math.abs(i - hoveredIndex))
          }
        }

        const transform = `translateX(-50%) translateX(${x}px) translateY(${y}px) rotate(${rotate}deg)`
        const state = stateAt?.(i) ?? (accentAt?.(i) ? 'selected' : 'idle')
        const faceState: FaceState = state === 'disabled' ? 'idle' : state

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only hover-spread / drag pick-up on non-interactive cards; no keyboard affordance implied
          <div
            key={item.uid}
            className={`${styles.slot} ${dragEnabled || onCardClick ? styles.clickable : ''}`}
            style={{ transform, zIndex: z }}
            onMouseEnter={drag ? undefined : () => setHoveredUid(item.uid)}
            onMouseLeave={
              drag ? undefined : () => setHoveredUid((h) => (h === item.uid ? null : h))
            }
            onMouseDown={
              dragEnabled || onCardClick ? (e) => onSlotDown(i, e.currentTarget, e) : undefined
            }
          >
            {/* dim wrapper — Hand owns the (transitioned) grey-out for disabled */}
            <div className={styles.faceWrap} data-state={state}>
              {renderFace(item, {
                faceDown,
                tilt: hoveredIndex === i && !drag,
                width: CARD_W,
                state: faceState,
                accent: accentAt?.(i),
              })}
            </div>
          </div>
        )
      })}

      {/* hover zoom preview — a separate enlarged card above the hand (readability
          without ever resizing the physical card you grab) */}
      {zoomView && (
        <div
          className={styles.zoom}
          data-shown={zoomShown}
          style={{ left: zoomView.left, top: zoomView.top, width: zoomView.width }}
          aria-hidden="true"
        >
          {renderFace(
            { uid: zoomView.uid, card: zoomView.card },
            { faceDown, tilt: false, width: zoomView.width, state: 'idle' },
          )}
        </div>
      )}

      {/* the card being dragged — rides above the fan, follows the cursor */}
      {drag && (
        <div className={styles.flyer} ref={flyerRef} style={{ width: CARD_W }}>
          {renderFace(
            { uid: drag.uid, card: drag.card },
            { faceDown, tilt: false, width: CARD_W, state: 'idle' },
          )}
        </div>
      )}
    </div>
  )
}
