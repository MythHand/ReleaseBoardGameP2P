import { useRef, useState } from 'react'
import { play, type Scatter, wait } from '@/animations'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card from '@/primitives/Card'
import Pile from '@/primitives/Pile'
import Typography from '@/primitives/Typography'
import Hand from '@/table/Hand'
import type { HandItem, HandPlayDrop } from '@/table/Hand/Hand'
import { pick, useLang } from '../../Playground/lang'
import HoverSelect from '../controls/HoverSelect'
import { reorderHand } from '../interactive/reorderHand'
import { useDiscardExit } from '../interactive/useDiscardExit'
import { useFlyer } from '../interactive/useFlyer'
import styles from './HandLimitStory.module.css'

// Hand limit — discarding down to the end-of-turn hand limit (the `handLimit`
// pending). The canonical Hand, plus the one rule that drives it: while the hand
// is OVER the limit a card can be pulled out of the fan to discard it; at or
// under the limit the fan rejects the drop and the card glides back.
//
// The discarded cards do NOT go to the heap one by one. They build a GRID at the
// centre — open, so the opponents read the whole cost of the turn — and only when
// the last excess card lands does the finished grid leave for the discard. The
// count is known before the first card moves (excess = hand − limit), so the grid
// shape is chosen upfront and every card flies straight to its own cell. Nothing
// waits on anything: the hand is never blocked by a flight.

// hand filler — ordinary (non-trigger) base cards; the AI / Error 503 triggers
// can never sit in a hand (rules: setup returns them to the deck)
const HAND_POOL = CARDS.filter((c) => c.deck === 'base' && c.category !== 'trigger')

// end-of-turn hand limit variants (rules → "Лимит карт в руке"): Base = no
// limit, 8 bit = 8, Memory Problem = 5
const LIMITS = [5, 8, Number.POSITIVE_INFINITY]
// hand sizes to deal — also the screen reset (re-deals and empties the discard)
const SIZES = [4, 6, 9, 13]

const GRID_HOLD = 1500 // the finished grid is held open before it leaves
const CLEAR_STEP = 90 // per-card stagger, grid → discard

// Grid shape by card count. Driven by the known count, not grown card by card:
// 1–4 one row, then two rows of 3 / 4 / 5, and three rows past 10. Ten cards to
// discard is already anomalous for the game's mechanics, so 15 is ample headroom.
function gridOf(n: number): { cols: number; rows: number } {
  if (n <= 4) return { cols: Math.max(n, 1), rows: 1 }
  if (n <= 6) return { cols: 3, rows: 2 }
  if (n <= 8) return { cols: 4, rows: 2 }
  if (n <= 10) return { cols: 5, rows: 2 }
  return { cols: Math.ceil(n / 3), rows: 3 }
}
// the taller the grid, the smaller the card — a wide grid must stay on screen
// without ever shrinking a small, readable one
const GRID_CARD_W = [150, 132, 116]

// a card at rest in the discard — carries its own scatter (tilt + offset)
interface DiscardEntry extends Scatter {
  card: CardType
}
// a card that has landed in the grid, in its own cell
interface Placed {
  card: CardType
  slot: number
}

const makeHand = (n: number): HandItem[] =>
  HAND_POOL.slice(0, n).map((card, i) => ({ uid: `h${i}`, card }))

export default function HandLimitStory() {
  const { lang } = useLang()
  const [limit, setLimit] = useState(5)
  const [size, setSize] = useState(9)
  const [hand, setHand] = useState<HandItem[]>(() => makeHand(9))
  const [discard, setDiscard] = useState<DiscardEntry[]>([])
  // the open grid at the centre: `cells` is its fixed size for this turn (0 = no
  // grid yet), `placed` are the cards that have already landed in it
  const [cells, setCells] = useState(0)
  const [placed, setPlaced] = useState<Placed[]>([])

  const discardRef = useRef<HTMLDivElement>(null)
  const { send: sendToDiscard } = useDiscardExit(discardRef, (cards) =>
    setDiscard((d) => [...d, ...cards]),
  )
  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  // the cards in transit — several are in the air at once, so each carries its own
  // key. Discarding is "think, then dump fast": a flight must never gate the next drag.
  const { overlay: flyerOverlay, raise, drop } = useFlyer()
  const flightSeq = useRef(0)
  const taken = useRef(0) // cells already claimed by a flight (in flight or landed)
  const landed = useRef(0) // cells actually filled — the last one flushes the grid
  const runId = useRef(0) // bumped on reset — a flight from a previous deal stops committing
  // grid size and contents mirrored as refs: the flights run across several
  // awaits and must not read a stale render's state (I8)
  const cellsRef = useRef(0)
  const placedRef = useRef<Placed[]>([])

  const excess = Math.max(0, hand.length - limit)
  const grid = gridOf(cells)
  const cardW = GRID_CARD_W[grid.rows - 1]
  cellsRef.current = cells
  placedRef.current = placed

  // deal N cards — doubles as the screen reset (empties the discard and the grid,
  // so re-picking the same size replays the scene from scratch). Changing the
  // limit resets the same way: the grid is sized for one turn's excess, and that
  // number is exactly what the limit decides.
  const reset = (n: number, nextLimit: number) => {
    runId.current += 1
    taken.current = 0
    landed.current = 0
    cellRefs.current = []
    drop()
    setSize(n)
    setLimit(nextLimit)
    setHand(makeHand(n))
    setDiscard([])
    setPlaced([])
    setCells(0)
  }

  // the finished grid leaves for the discard, card by card with a short stagger
  const flushGrid = async (run: number) => {
    await wait(GRID_HOLD)
    if (runId.current !== run) return
    // the finished grid leaves through the shared step: every card on its own,
    // staggered, each flying the cell element it already occupies
    await sendToDiscard(
      placedRef.current.map((p) => ({
        key: `g${p.slot}`,
        card: p.card,
        node: cellRefs.current[p.slot],
        layer: p.slot,
        delay: p.slot * CLEAR_STEP,
      })),
    )
    if (runId.current !== run) return
    taken.current = 0
    landed.current = 0
    cellRefs.current = []
    setPlaced([])
    setCells(0)
  }

  // one card: hand → its own cell in the grid.
  // I8 — the card, its slot and its source rect come in as arguments.
  const flyToCell = async (card: CardType, slot: number, fromRect?: DOMRect) => {
    const run = runId.current
    const id = ++flightSeq.current
    if (!fromRect) return
    const key = `f${id}`
    // raising also lets the grid cells mount before they are measured
    const [el] = await raise([{ key, card, at: fromRect }])
    if (runId.current !== run) return
    const to = cellRefs.current[slot]?.getBoundingClientRect()
    if (el && to) {
      const anim = play('playToCenter', el, { from: fromRect, to })
      if (anim) await anim.finished
    }
    if (runId.current !== run) return
    // the real card takes over the cell as the flyer unmounts (same commit — no gap)
    drop(key)
    setPlaced((p) => [...p, { card, slot }])
    landed.current += 1
    if (landed.current === cellsRef.current) void flushGrid(run)
  }

  // pulled out of the fan → into the grid, but only while the hand is over the
  // limit; otherwise the drop is rejected and the Hand glides the card back
  const onPlay = (uid: string, dropped: HandPlayDrop): boolean => {
    if (hand.length <= limit) return false
    const card = hand.find((it) => it.uid === uid)?.card
    if (!card) return false
    // the first card of the turn fixes the grid: the count is known upfront
    if (cellsRef.current === 0) {
      cellsRef.current = excess
      setCells(excess)
    }
    const slot = taken.current++
    setHand((h) => h.filter((it) => it.uid !== uid))
    void flyToCell(card, slot, dropped.rect)
    return true
  }

  const limitLabel = (n: number) => (Number.isFinite(n) ? String(n) : '∞')

  return (
    <div className={styles.root}>
      <div className={styles.bar}>
        <HoverSelect
          label={pick(lang, { ru: 'лимит руки', en: 'hand limit' })}
          value={String(limit)}
          options={LIMITS.map((n) => ({ value: String(n), label: limitLabel(n) }))}
          onChange={(v) => reset(size, Number(v))}
        />
        <HoverSelect
          label={pick(lang, { ru: 'раздать карт', en: 'deal cards' })}
          value={String(size)}
          options={SIZES.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => reset(Number(v), limit)}
        />
        <div className={styles.readout} data-over={excess > 0}>
          <Typography base="mono-xs">
            {pick(lang, { ru: 'в руке', en: 'in hand' })}: <b>{hand.length}</b>
            {' · '}
            {pick(lang, { ru: 'лимит', en: 'limit' })}: <b>{limitLabel(limit)}</b>
            {excess > 0 && (
              <>
                {' · '}
                {pick(lang, { ru: 'сбросить', en: 'to discard' })}: <b>{excess}</b>
              </>
            )}
          </Typography>
        </div>
      </div>

      {/* the open grid at the centre — the turn's discard, laid out for everyone
          to read; empty cells show the shape that is being filled */}
      {cells > 0 && (
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${grid.cols}, ${cardW}px)` }}
        >
          {Array.from({ length: cells }, (_, i) => {
            const card = placed.find((p) => p.slot === i)?.card
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: the cells are a fixed grid, the index IS the slot
                key={i}
                className={styles.cell}
                ref={(el) => {
                  cellRefs.current[i] = el
                }}
              >
                {card ? (
                  <Card card={card} interactive={false} width="100%" />
                ) : (
                  <span className={styles.cellEmpty} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* discard — right of centre; cards land scattered (a tossed heap) */}
      <div className={styles.discard}>
        <Pile
          heap={discard}
          count={discard.length}
          width={116}
          boxRef={discardRef}
          logoVariant={lang}
          label={pick(lang, { ru: 'сброс', en: 'discard' })}
        />
      </div>

      {/* hand — bottom-centre; over the limit every card is a valid discard.
          Never blocked by a flight in progress: the next card can be pulled out
          while the previous one is still on its way to its cell. */}
      <div className={styles.you}>
        <div className={styles.hint}>
          <Typography base="mono-xs">
            {excess > 0
              ? pick(lang, {
                  ru: 'вытащи карту из руки — она встанет в сетку сброса',
                  en: 'pull a card out of the hand — it takes a cell in the grid',
                })
              : pick(lang, {
                  ru: 'лимит соблюдён — сбрасывать нечего',
                  en: 'within the limit — nothing to discard',
                })}
          </Typography>
        </div>
        <Hand
          items={hand}
          stateAt={excess > 0 ? () => 'playable' : undefined}
          // any card is a valid discard — one uniform colour, not the per-category
          // accent (which would read as "this type is what fits"). The hue is the
          // context of the move: this pick COSTS a card, so it reads as a loss.
          accentAt={excess > 0 ? () => 'var(--danger-accent)' : undefined}
          onReorder={(uid, to) => setHand((h) => reorderHand(h, uid, to))}
          onPlay={onPlay}
        />
      </div>

      {/* the cards on their way to a cell — several can be in the air at once */}
      {flyerOverlay}
    </div>
  )
}
