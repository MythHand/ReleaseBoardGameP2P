import { type CardData, cardById } from '@release/ui'
import type { BoardState, CentreOperation } from '~/entities/game/board'
import { type Filed, withLanded, withoutLanded, withoutTopCopy, withStandIn } from './toHeap'

// ONE CARD, ONE PLACE (#168; docs/animations/beat-copies.md §5).
//
// A card is drawn in exactly one place in every frame. The board draws a place
// from the state a beat publishes, and one physical place is often several
// fields of that state at once: our own card put out at the centre is in the
// hand AND in `shown`; an attack waiting for its answer is the pending that
// owes the answer; a standing AI cause is beside its own copy in the heap. A
// beat that clears the one field it knows leaves the card drawn from the other
// — twice while its carrier flies, or back where it came from for a frame. That
// is the board's most repeated defect, and every beat used to write the clearing
// out for itself.
//
// So the places live HERE, once. A beat says where the card stands, or where it
// lands, and this takes it off — or puts it on — every field that draws that
// place. And the two moments that must share one commit with the carrier are
// one call each: `liftOff` in the run the carrier goes up in, `setDown` in the
// run it comes down in.

type Slot = 'frontend' | 'backend' | 'database' | 'monitoring'

/** Where a card is drawn, as a beat names it. */
export type Place =
  // our own fan, by the card's uid
  | { kind: 'hand'; uid: string }
  // put out at the centre by a player, by uid (resolution.md §1)
  | { kind: 'shown'; player: string; uid: string }
  // an opponent's closed hand: only its count is drawn
  | { kind: 'seat'; player: string; count?: number }
  // standing at the centre, by the card's id: an attack and what covers it,
  // the 503 alarm, the AI effect, the AI cause, an operation
  | { kind: 'centre'; card: string }
  // a release zone's slot, with what rides under the card there
  | { kind: 'zone'; player: string; slot: Slot }
  // a System Upgrade row, by the seat whose answer stands there — one per seat
  | { kind: 'upgrade'; player: string }
  // the discard heap, by the `discarded` event the card lies on…
  | { kind: 'heap'; eventId: number }
  // …or, taken back out, by the card alone: its topmost copy (`withoutTopCopy`)
  | { kind: 'heap'; card: string }
  // a draw pile's count
  | { kind: 'pile'; pile: number }
  // the events deck's count
  | { kind: 'events' }

const without = <T extends object, K extends keyof T>(o: T | undefined, key: K) => {
  if (!o || !(key in o)) return o
  const next = { ...o }
  delete next[key]
  return next
}

/** The board with the card taken off every field that draws this place. */
export function withoutCard(board: BoardState, place: Place): BoardState {
  switch (place.kind) {
    case 'hand':
    case 'shown': {
      // one card, two fields when it is ours: the hand that holds it and the
      // centre it was put out at — whichever of them the beat named
      const ours = place.kind === 'hand' || place.player === board.selfId
      const hand = ours ? board.you.hand.filter((c) => c.uid !== place.uid) : board.you.hand
      const shown = board.shown?.filter((s) => s.uid !== place.uid)
      if (hand.length === board.you.hand.length && shown?.length === board.shown?.length)
        return board
      return { ...board, you: { ...board.you, hand }, shown }
    }
    case 'seat':
      // nobody there, or nothing left to take: the board as it was, so a beat
      // never publishes a table that did not change
      if (!board.opponents.some((o) => o.id === place.player && o.handCount > 0)) return board
      return {
        ...board,
        opponents: board.opponents.map((o) =>
          o.id === place.player
            ? { ...o, handCount: Math.max(0, o.handCount - (place.count ?? 1)) }
            : o,
        ),
      }
    case 'centre':
      return withoutAtCentre(board, place.card)
    case 'zone':
      return withoutInZone(board, place.player, place.slot)
    case 'upgrade': {
      // the row IS the pending's `thrown`: the answer leaves it, the System
      // Upgrade itself goes on
      const pending = board.pending
      if (pending?.kind !== 'systemUpgrade') return board
      const thrown = pending.thrown.filter((t) => t.player !== place.player)
      if (thrown.length === pending.thrown.length) return board
      return { ...board, pending: { ...pending, thrown } }
    }
    case 'heap':
      return 'eventId' in place
        ? withoutLanded(board, [{ eventId: place.eventId }])
        : withoutTopCopy(board, place.card)
    case 'pile': {
      const main = board.decks.main
      if ((main[place.pile] ?? 0) <= 0) return board
      return {
        ...board,
        decks: { ...board.decks, main: main.map((n, i) => (i === place.pile ? n - 1 : n)) },
      }
    }
    case 'events':
      if (board.decks.events <= 0) return board
      return { ...board, decks: { ...board.decks, events: board.decks.events - 1 } }
  }
}

// EVERY FIELD THE CENTRE IS DRAWN FROM, for one card (`_Board.tsx`: the centre
// attack, the cover, the alarm, the AI effect and cause, the operation).
function withoutAtCentre(board: BoardState, card: string): BoardState {
  let next = board
  const pending = board.pending
  const sudo = card === 'support-sudo'
  if (pending?.kind === 'defend') {
    // the attack IS the pending's render: when it leaves, the answer it owed has
    // been given, and nothing is drawn of it any more
    if (pending.attackCard === card) next = { ...next, pending: null }
    else if (sudo && pending.sudo) next = { ...next, pending: { ...pending, sudo: false } }
  } else if (
    pending?.kind === 'stealCard' ||
    pending?.kind === 'requestCard' ||
    pending?.kind === 'giveCard'
  ) {
    // the transfer goes on; only the cards standing over it leave
    let p = pending
    if (p.attack === card) p = { ...p, attack: undefined, sudo: false } as typeof p
    else if (sudo && p.sudo && p.attack) p = { ...p, sudo: false }
    if (p.cover === card) p = { ...p, cover: undefined, coverSudo: false }
    else if (sudo && p.coverSudo) p = { ...p, coverSudo: false }
    if (p !== pending) next = { ...next, pending: p }
  } else if (pending?.kind === 'neutralize503' || pending?.kind === 'crush') {
    // the alarm and the AI effect standing for it
    if ((pending.kind === 'neutralize503' && pending.card === card) || pending.source === card)
      next = { ...next, pending: null }
  }
  if (next.centreAttack?.card === card) next = { ...next, centreAttack: undefined }
  else if (sudo && next.centreAttack?.sudo)
    next = { ...next, centreAttack: { ...next.centreAttack, sudo: false } }
  if (next.centreCover?.card === card) next = { ...next, centreCover: undefined }
  else if (sudo && next.centreCover?.sudo)
    next = { ...next, centreCover: { ...next.centreCover, sudo: false } }
  // an operation leaves WITH the Sudo standing beside it — one play, and the
  // Sudo has no place of its own once the card it paid for is gone. A lone Sudo
  // named here is an attack's or a defence's, never the operation's.
  if (next.centreOperation?.card === card) next = { ...next, centreOperation: undefined }
  // the AI cause stands beside its own copy in the heap, which the board leaves
  // out while it stands — so leaving the centre, it leaves the heap too, until
  // its flight lands it there (`withoutAiCause`, aiCauseExit.ts)
  const cause = next.aiCause
  if (cause?.card === card) {
    next = withoutLanded({ ...next, aiCause: undefined }, [{ eventId: cause.eventId }])
  }
  return next
}

function withoutInZone(board: BoardState, player: string, slot: Slot): BoardState {
  if (player === board.selfId) {
    const you = board.you
    if (!you.release[slot] && !you.support?.[slot]) return board
    return {
      ...board,
      you: {
        ...you,
        release: { ...you.release, [slot]: null },
        support: you.support ? { ...you.support, [slot]: null } : you.support,
        releaseUid: without(you.releaseUid, slot),
        releaseEvent: without(you.releaseEvent, slot),
        releaseId: without(you.releaseId, slot),
      },
    }
  }
  return {
    ...board,
    opponents: board.opponents.map((o) =>
      o.id === player
        ? {
            ...o,
            release: { ...o.release, [slot]: null },
            support: o.support ? { ...o.support, [slot]: null } : o.support,
            releaseEvent: without(o.releaseEvent, slot),
            releaseId: without(o.releaseId, slot),
          }
        : o,
    ),
  }
}

/** Where a card lands, as a beat names it, and the card itself. */
export type Landing =
  | { kind: 'hand'; uid: string; card: string; at?: number }
  | { kind: 'shown'; player: string; uid: string; card: string }
  | { kind: 'seat'; player: string; count?: number }
  | {
      kind: 'zone'
      player: string
      slot: Slot
      card: string
      under?: string
      uid?: string
      // an AI release: the rules card it stands for (`releaseId`) and its own
      // events-deck card (`releaseEvent`) — the two marks `withoutInZone` clears
      ai?: { id: string; event: string }
    }
  | { kind: 'heap'; filed: Filed[] }
  // a card banked with no `discarded` event of its own: the heap's top stand-in
  | { kind: 'heapTop'; card: string; count: number; banked?: number }
  | { kind: 'pile'; pile: number; count?: number }
  | { kind: 'events'; count?: number }
  | {
      kind: 'centre'
      attack?: { card: string; sudo: boolean }
      cover?: { card: string; sudo: boolean }
      operation?: CentreOperation
    }

const data = (id: string): CardData | undefined => cardById(id) ?? undefined

/** The board with the card drawn where it has landed. */
export function withCard(board: BoardState, to: Landing): BoardState {
  switch (to.kind) {
    case 'hand': {
      const card = data(to.card)
      if (!card || board.you.hand.some((c) => c.uid === to.uid)) return board
      const hand = [...board.you.hand]
      hand.splice(to.at ?? hand.length, 0, { uid: to.uid, card })
      return { ...board, you: { ...board.you, hand } }
    }
    case 'shown': {
      const card = data(to.card)
      if (!card || board.shown?.some((s) => s.uid === to.uid)) return board
      return { ...board, shown: [...(board.shown ?? []), { player: to.player, uid: to.uid, card }] }
    }
    case 'seat':
      return {
        ...board,
        opponents: board.opponents.map((o) =>
          o.id === to.player ? { ...o, handCount: o.handCount + (to.count ?? 1) } : o,
        ),
      }
    case 'zone': {
      const card = data(to.card)
      if (!card) return board
      const under = to.under ? (data(to.under) ?? null) : null
      const ai = to.ai
      const marked = <T extends { releaseId?: object; releaseEvent?: object }>(owner: T) =>
        ai
          ? {
              releaseId: { ...owner.releaseId, [to.slot]: ai.id },
              releaseEvent: { ...owner.releaseEvent, [to.slot]: ai.event },
            }
          : {}
      if (to.player === board.selfId) {
        const you = board.you
        return {
          ...board,
          you: {
            ...you,
            release: { ...you.release, [to.slot]: card },
            support: under ? { ...you.support, [to.slot]: under } : you.support,
            releaseUid: to.uid ? { ...you.releaseUid, [to.slot]: to.uid } : you.releaseUid,
            ...marked(you),
          },
        }
      }
      return {
        ...board,
        opponents: board.opponents.map((o) =>
          o.id === to.player
            ? {
                ...o,
                release: { ...o.release, [to.slot]: card },
                support: under ? { ...o.support, [to.slot]: under } : o.support,
                ...marked(o),
              }
            : o,
        ),
      }
    }
    case 'heap':
      return withLanded(board, to.filed)
    case 'heapTop':
      return withStandIn(board, to)
    case 'pile':
      return {
        ...board,
        decks: {
          ...board.decks,
          main: board.decks.main.map((n, i) => (i === to.pile ? n + (to.count ?? 1) : n)),
        },
      }
    case 'events':
      return { ...board, decks: { ...board.decks, events: board.decks.events + (to.count ?? 1) } }
    case 'centre':
      return {
        ...board,
        ...(to.attack ? { centreAttack: to.attack } : {}),
        ...(to.cover ? { centreCover: to.cover } : {}),
        ...(to.operation ? { centreOperation: to.operation } : {}),
      }
  }
}

/** A beat's run, as far as this needs it (`BeatRun`). */
interface Run {
  base: BoardState
  publish: (state: BoardState) => void
}

/**
 * THE CARD GOES UP: off every place it stands in, and the gesture that held it
 * lets go — in the run its carrier is raised in, before anything is awaited.
 * The run's base moves with the publish, so everything later in the beat builds
 * on the board without it.
 */
export function liftOff(
  run: Run,
  from: Place[],
  gesture?: { release: () => void } | null,
): BoardState {
  const next = from.reduce(withoutCard, run.base)
  if (next !== run.base) {
    run.base = next
    run.publish(next)
  }
  gesture?.release()
  return next
}

/**
 * THE CARD COMES DOWN: drawn where it landed, and only then is its carrier taken
 * down — one run, nothing awaited between, so the frame the carrier goes is the
 * frame the place has it.
 */
export function setDown(run: Run, to: Landing[], drop?: () => void): BoardState {
  const next = to.reduce(withCard, run.base)
  if (next !== run.base) {
    run.base = next
    run.publish(next)
  }
  drop?.()
  return next
}
