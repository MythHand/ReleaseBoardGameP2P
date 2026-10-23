import { CARD_W, cardBoxIn } from '@release/ui'
import type { HeldCard, Rect } from '@release/ui/animations'
import type { RefObject } from 'react'
import { useCallback, useMemo, useRef } from 'react'

// Every node a flight aims at or leaves from, in one place. This started as
// `IntroRefs` inside the deal — it was already most of the registry, and the
// deal was only its first consumer. A second consumer is what turns "the refs
// the intro needs" into "the anchors of the board", so it moves out here and
// the intro becomes one caller among others.
//
// It is a DOM registry and nothing else: it holds no game state and mirrors
// none. That is why a hand card is reached by INDEX rather than by uid — a uid
// lookup would make the registry depend on the very hand it is meant to be
// independent of. A caller already holds the hand it planned against, and
// resolves the index there.
/** a card of our fan, as it is drawn: its card box and the pose it stands in */
export interface HandCard {
  box: Rect
  /** its tilt in the fan, deg — 0 when it stands straight */
  rot: number
  /** …the same tilt as a carrier's pose to rise in, absent when straight */
  pose?: string
}

/**
 * The card standing in one slot of our fan, read off the slot as it is drawn
 * (`BoardAnchors.handCardAt`). A pure rotation and scale leave the card's centre
 * where it was, so the box is centred on the slot's bounding rect.
 */
export function handCardOf(slot: HTMLElement | null): HandCard | null {
  if (!slot) return null
  const look = getComputedStyle(slot).transform
  const m =
    look && look !== 'none' && typeof DOMMatrixReadOnly !== 'undefined'
      ? new DOMMatrixReadOnly(look)
      : null
  const scale = m ? Math.hypot(m.a, m.b) : 1
  const rot = m ? (Math.atan2(m.b, m.a) * 180) / Math.PI : 0
  const box = cardBoxIn(slot.getBoundingClientRect(), CARD_W * scale)
  return rot ? { box, rot, pose: `rotate(${rot}deg)` } : { box, rot }
}

export interface BoardAnchors {
  rail: RefObject<HTMLDivElement | null>
  bg: RefObject<HTMLDivElement | null>
  decks: RefObject<HTMLDivElement | null>
  discard: RefObject<HTMLDivElement | null>
  seats: RefObject<HTMLDivElement | null>
  dock: RefObject<HTMLDivElement | null>
  zone: RefObject<HTMLDivElement | null>
  /** the attack slot — `centre` IS it, kept under its old name because every
   *  existing flight already aims there */
  centre: RefObject<HTMLDivElement | null>
  /** the release standing at the centre, waiting for its cost to be paid */
  stage: RefObject<HTMLDivElement | null>
  /** the card paying that cost, held open beside it */
  cost: RefObject<HTMLDivElement | null>
  /** the defender's own Sudo, waiting for the defence it will enhance */
  sudo: RefObject<HTMLDivElement | null>
  /** the defence lying over the attack */
  cover: RefObject<HTMLDivElement | null>
  hand: RefObject<HTMLDivElement | null>
  /** the discard's CARD box — what a flight into the heap aims at */
  discardBox: RefObject<HTMLDivElement | null>
  /** the AI trigger — the cause, standing left of the card it pulled */
  cause: RefObject<HTMLDivElement | null>
  /** the AI card itself — wider than the rest, because the table reads it */
  effect: RefObject<HTMLDivElement | null>
  /** what an AI effect asked for: the card given up, standing open beside it */
  picked: RefObject<HTMLDivElement | null>
  /** the events pile's CARD box — where an event card goes home */
  eventsBox: RefObject<HTMLDivElement | null>
  seatOf: (player: string) => HTMLElement | null
  /** a card-sized box centred on a seat: a seat is far wider than a card (I6) */
  seatBox: (player: string) => Rect | null
  handSlotAt: (index: number) => HTMLElement | null
  /**
   * WHERE A CARD OF OUR FAN STANDS, as it is drawn right now — what a flight out
   * of the fan rises on. A slot is rotated, so its bounding rect is the box
   * AROUND the tilted card: a carrier raised on it started bigger and square,
   * and the card jumped on the first frame (I6). Read off the slot's own
   * transform, so a card straightened and lifted under the cursor reads as it
   * stands.
   */
  handCardAt: (index: number) => HandCard | null
  releaseSlot: (player: string, slot: string) => HTMLElement | null
  bindSeat: (player: string, el: HTMLElement | null) => void
  bindReleaseSlot: (player: string, slot: string, el: HTMLElement | null) => void
  /** a draw pile's CARD box, by the index the engine names in `drawn.pile` */
  pileBox: (index: number) => HTMLElement | null
  bindPile: (index: number, el: HTMLDivElement | null) => void
  /**
   * A CARD IN A GESTURE'S HANDS, by its uid — under the cursor, or in a flight
   * the gesture started — for the answer that has to carry it on when someone
   * else answered the decision (`HeldCard`). Null when no gesture holds it.
   */
  heldCard: (uid: string) => HeldCard | null
  /**
   * What one holder holds right now, or null once it holds nothing: the fan,
   * the zone pull, a gesture's own flights. By the holder rather than by the
   * card, so a holder letting go never needs to remember what it held.
   */
  hold: (holder: string, held: HeldCard | null) => void
}

export function useBoardAnchors(): BoardAnchors {
  const rail = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const decks = useRef<HTMLDivElement>(null)
  const discard = useRef<HTMLDivElement>(null)
  const seats = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const centre = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const cost = useRef<HTMLDivElement>(null)
  const sudo = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLDivElement>(null)
  const hand = useRef<HTMLDivElement>(null)
  const discardBox = useRef<HTMLDivElement>(null)
  const cause = useRef<HTMLDivElement>(null)
  const effect = useRef<HTMLDivElement>(null)
  const picked = useRef<HTMLDivElement>(null)
  const eventsBox = useRef<HTMLDivElement>(null)
  const seatEls = useRef<Record<string, HTMLElement | null>>({})
  const slotEls = useRef<Record<string, HTMLElement | null>>({})
  const pileEls = useRef<Record<number, HTMLDivElement | null>>({})
  // Not a node registry like the rest, and the one place here keyed by uid: a
  // gesture names its own card, so nothing here reads the hand to find it.
  const holders = useRef<Record<string, HeldCard>>({})

  const seatOf = useCallback((player: string) => seatEls.current[player] ?? null, [])
  const bindSeat = useCallback((player: string, el: HTMLElement | null) => {
    seatEls.current[player] = el
  }, [])
  const bindReleaseSlot = useCallback((player: string, slot: string, el: HTMLElement | null) => {
    slotEls.current[`${player}:${slot}`] = el
  }, [])
  const releaseSlot = useCallback(
    (player: string, slot: string) => slotEls.current[`${player}:${slot}`] ?? null,
    [],
  )
  const seatBox = useCallback((player: string): Rect | null => {
    const el = seatEls.current[player]
    return el ? cardBoxIn(el.getBoundingClientRect(), CARD_W) : null
  }, [])
  // The fan marks its slots itself; asking the DOM keeps this in step with
  // whatever Hand does with them, instead of holding a second list of nodes.
  const handSlotAt = useCallback(
    (index: number) =>
      hand.current?.querySelectorAll<HTMLElement>('[data-hand-slot]')[index] ?? null,
    [],
  )
  const handCardAt = useCallback((index: number) => handCardOf(handSlotAt(index)), [handSlotAt])
  const pileBox = useCallback((index: number) => pileEls.current[index] ?? null, [])
  // A merge takes piles off the table, so an unbound index must answer null
  // rather than keep a node that is no longer rendered.
  const bindPile = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) pileEls.current[index] = el
    else delete pileEls.current[index]
  }, [])

  // A CARD LET GO OF, OR SENT HOME, IS NO LONGER HELD — and the registry says
  // so itself, rather than each holder remembering to. A flight handed to the
  // keeper's answer used to stay registered after the answer let go of it, its
  // node long gone; when the same card came back into the hand, that stale
  // entry was found ahead of the gesture now holding it, and the next answer
  // could not take the card off the cursor (ditayler, #266). Only the entry
  // that was let go of is dropped: a holder may already hold its next card.
  const hold = useCallback((holder: string, held: HeldCard | null) => {
    if (!held) {
      delete holders.current[holder]
      return
    }
    const forget = () => {
      if (holders.current[holder] === own) delete holders.current[holder]
    }
    const own: HeldCard = {
      ...held,
      release: () => {
        forget()
        held.release()
      },
      home: () => {
        forget()
        held.home()
      },
    }
    holders.current[holder] = own
  }, [])
  const heldCard = useCallback(
    (uid: string) => Object.values(holders.current).find((h) => h.uid === uid) ?? null,
    [],
  )

  // One identity for the life of the mount: every consumer takes this through a
  // ref into a long-running sequence, and a fresh object per render would arm
  // those against a stale registry.
  return useMemo(
    () => ({
      rail,
      bg,
      decks,
      discard,
      seats,
      dock,
      zone,
      centre,
      stage,
      cost,
      sudo,
      cover,
      hand,
      discardBox,
      cause,
      effect,
      picked,
      eventsBox,
      seatOf,
      seatBox,
      handSlotAt,
      handCardAt,
      releaseSlot,
      bindSeat,
      bindReleaseSlot,
      pileBox,
      bindPile,
      heldCard,
      hold,
    }),
    [
      seatOf,
      seatBox,
      handSlotAt,
      handCardAt,
      releaseSlot,
      bindSeat,
      bindReleaseSlot,
      pileBox,
      bindPile,
      heldCard,
      hold,
    ],
  )
}
