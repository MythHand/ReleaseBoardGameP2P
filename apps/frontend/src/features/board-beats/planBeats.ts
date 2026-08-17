import type { DiscardReason, Event } from '@release/engine'
import type { ReleaseSlots } from '@release/ui'
import type { BoardState } from '~/entities/game/board'

// A batch of engine events becomes the movements the board should play. Pure:
// it reads the projection as it stood BEFORE the batch, because that is the
// board still on screen — the hand slot a card is about to leave still exists
// there to be measured (I1).
//
// An event with no choreography yields no beat and passes straight through.
// That is the default, not a gap: the board is driven by the projection, and a
// beat only ever adds a way of GETTING to the next one.

export type DiscardSource =
  | { kind: 'hand'; index: number }
  | { kind: 'release'; player: string; slot: string }
  | { kind: 'seat'; player: string }

export interface DiscardCard {
  key: string
  eventId: number
  card: string
  source: DiscardSource
}

// One card leaving a pile. `card` is present only when this peer is entitled to
// the identity: its own draw, redacted for everyone else (`redactFor`). A
// trigger carries none either — its name arrives on the reveal that follows.
export interface PlannedDraw {
  key: string
  eventId: number
  player: string
  pile: number
  /** the drawer is this peer — it flips at the centre and settles into the fan */
  mine: boolean
  card?: string
  /**
   * turned up in front of the whole table. `discardId` is the trigger's own
   * `discarded`, which the DRAW beat owns: the card is at the centre when it is
   * filed, and flying it from a hand slot it never occupied would be a lie.
   */
  reveal?: { card: string; discardId: number }
}

export type PileStep =
  | { kind: 'split'; at: number; piles: number[] }
  | { kind: 'merge'; withDiscard: boolean; piles: number[] }
  | { kind: 'fromDiscard'; at: number; piles: number[] }

export type BeatPlan =
  | { kind: 'draw'; key: string; draws: PlannedDraw[] }
  | { kind: 'discard'; key: string; cards: DiscardCard[] }
  | { kind: 'reshuffle'; key: string; cards: number }
  | { kind: 'piles'; key: string; steps: PileStep[] }
  // A window attack reaches the centre — the pair, if it threw with a Sudo,
  // or a lone card if not. `target` is not carried: the pair settles at the
  // centre, not at a seat, so nowhere in the beat needs it.
  | {
      kind: 'attackPlaced'
      key: string
      eventId: number
      attacker: string
      card: string
      sudo: boolean
    }
  // Only a Code Review combo gets a beat of its own — a plain release has
  // nowhere to fold FROM (see the walk below).
  | {
      kind: 'releasePlaced'
      key: string
      eventId: number
      player: string
      slot: string
      card: string
      codeReview: string
    }
  // The pending pair splitting back into two singles for the discard. `main`
  // is optional, not `aux`: a sudo Rollback banks only the sudo half (the
  // attack card returns to its owner's hand instead), so the pair this beat
  // flies can be down to one card.
  | {
      kind: 'pairToDiscard'
      key: string
      main?: { eventId: number; card: string }
      aux?: { eventId: number; card: string }
    }

// Reasons that CAN take a card out of a release slot — "can", not "always do".
// Typed against the engine's own union rather than `string`, so renaming a reason
// there is a compile error here instead of a movement that silently stops playing.
//
// `neutralized` is the reason this is a maybe: it has two producers and they are
// not the same movement. `triggers.ts:211` is the sacrifice — a release and its
// Code Review leaving the zone. `triggers.ts:184` is a Debugger played out of the
// HAND to answer a 503, which is the ordinary case and never touches the zone at
// all. So the zone is tried first and the hand is the fall-through; treating the
// reason as decisive would have left the commoner of the two never animating.
const FROM_RELEASE = new Set<DiscardReason>(['destroyed', 'neutralized'])

// `ReleaseSlots` has no string index signature (it names its four keys
// explicitly), so the lookup takes it by its own type rather than a generic
// Record — `keyof ReleaseSlots` keeps the cast at the one line that needs it.
const slotHolding = (release: ReleaseSlots, card: string): string | null =>
  (Object.keys(release) as (keyof ReleaseSlots)[]).find((k) => release[k]?.id === card) ?? null

function sourceOf(
  e: Extract<Event, { type: 'discarded' }>,
  before: BoardState,
  claimed: Set<number>,
): DiscardSource | null {
  const mine = e.player === before.selfId
  if (FROM_RELEASE.has(e.reason)) {
    const release = mine
      ? before.you.release
      : before.opponents.find((o) => o.id === e.player)?.release
    const slot = release ? slotHolding(release, e.card) : null
    // Found in the zone: it left the zone. Not found: fall through and look
    // where the card actually was — the reason narrows the search, it does not
    // decide the answer. A Code Review attached to a destroyed release lives in
    // `support`, not in `release`, and lands here too.
    if (slot) return { kind: 'release', player: e.player, slot }
  }
  if (!mine) return { kind: 'seat', player: e.player }
  // `discarded` carries a card id, not a uid, so the slot is found by matching
  // the id against the hand that is still on screen. Two copies of one card are
  // interchangeable to look at, so the first unclaimed one is right rather than
  // merely adequate — `claimed` is what stops a pair of them sharing a slot.
  const index = before.you.hand.findIndex((h, i) => h.card.id === e.card && !claimed.has(i))
  if (index < 0) return null
  claimed.add(index)
  return { kind: 'hand', index }
}

// `pilesChanged` carries counts and NOTHING else — not which operation ran, not
// which pile split (docs/animations/backlog.md). It is recoverable positionally,
// so this derives rather than guesses, and the whole derivation lives here with
// the reasoning attached instead of being spread over a beat.
//
// Order matters: a prune is checked before a merge, because [0, 10] -> [10] fits
// both shapes and only one of them happened.
export function classifyPiles(before: number[], after: number[]): PileStep | null {
  const kept = before.filter((n) => n > 0)
  // A pile that ran out ceased to exist: the survivors keep their counts, and
  // nothing on screen moves — the cards were face down before and gone after.
  if (after.length < before.length && kept.length === after.length) {
    if (kept.every((n, i) => n === after[i])) return null
  }
  if (after.length === 1 && before.length > 1 && after[0] > 0) {
    const gathered = before.reduce((a, b) => a + b, 0)
    // Sudo gathers the discard in as well, so the survivor holds more than the
    // piles did. That difference is the only signal that the discard flew too.
    return { kind: 'merge', withDiscard: after[0] > gathered, piles: after }
  }
  if (after.length === before.length + 1) {
    // The halves stay where the pile was (fake/piles.ts), so the first index
    // whose count changed is the pile that split — and it accounts for two.
    const at = before.findIndex((n, i) => n !== after[i])
    if (at >= 0 && before[at] === after[at] + after[at + 1]) {
      return { kind: 'split', at, piles: after }
    }
    // Nothing existing moved and one pile arrived at the end: Git Branch's Sudo
    // step, where the discard is appended unshuffled as a pile of its own.
    return { kind: 'fromDiscard', at: after.length - 1, piles: after }
  }
  return null
}

// The engine emits a trigger's reveal IMMEDIATELY after the card-less `drawn`
// that turned it up, and its `discarded` immediately after that
// (fake/triggers.ts:123,139). Looking ahead by position rather than scanning the
// batch is what keeps a later, unrelated reveal from being read as this draw's.
function revealAfter(events: Event[], i: number): { card: string; discardId: number } | null {
  const reveal = events[i + 1]
  if (!reveal) return null
  const card =
    reveal.type === 'revealed' ? reveal.card : reveal.type === 'aiRevealed' ? reveal.aiCard : null
  if (card == null) return null
  const filed = events[i + 2]
  if (filed?.type !== 'discarded' || filed.card !== card) return null
  return { card, discardId: filed.id }
}

export function planBeats(events: Event[], before: BoardState): BeatPlan[] {
  const claimed = new Set<number>()
  // discards the draw beat has taken over — a revealed trigger leaves from the
  // centre, so the discard planner must not claim it a second time
  const owned = new Set<number>()
  const plans: BeatPlan[] = []
  let piles = before.decks.main

  // A run of one kind coalesces into one beat; anything else closes it. That is
  // what makes a hand-limit discard of three read as one gesture while a discard
  // on the far side of a draw stays a gesture of its own.
  let draw: Extract<BeatPlan, { kind: 'draw' }> | null = null
  let discard: Extract<BeatPlan, { kind: 'discard' }> | null = null
  let pileRun: Extract<BeatPlan, { kind: 'piles' }> | null = null
  // The pending pair's own exit — the two `discarded` events that resolve a
  // `defend` pending, claimed here instead of by `sourceOf` below (the centre
  // card is in no hand and no zone; `sourceOf` could never find it). Coalesces
  // like the others, but is never open for more than the one resolution that
  // created it: `before.pending` cannot change mid-walk, and only one
  // exchange can be pending at a time.
  let pairOut: Extract<BeatPlan, { kind: 'pairToDiscard' }> | null = null
  const flush = () => {
    if (draw) plans.push(draw)
    // A discard beat with nothing aimable is not a beat: every card in the run
    // failed to find a source, which the projection still resolves on its own.
    if (discard && discard.cards.length > 0) plans.push(discard)
    if (pileRun) plans.push(pileRun)
    if (pairOut) plans.push(pairOut)
    draw = null
    discard = null
    pileRun = null
    pairOut = null
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.type === 'drawn') {
      if (!draw) flush()
      const reveal = e.card === undefined ? revealAfter(events, i) : null
      if (reveal) owned.add(reveal.discardId)
      draw ??= { kind: 'draw', key: `draw:${e.id}`, draws: [] }
      draw.draws.push({
        key: `w${e.id}`,
        eventId: e.id,
        player: e.player,
        pile: e.pile,
        mine: e.player === before.selfId,
        card: e.card,
        reveal: reveal ?? undefined,
      })
      continue
    }
    if (e.type === 'attacked') {
      // One event, one beat — the pair (or the lone card) reaches the centre
      // as a single gesture, never coalesced with what came before or after.
      flush()
      plans.push({
        kind: 'attackPlaced',
        key: `attack:${e.id}`,
        eventId: e.id,
        attacker: e.attacker,
        card: e.card,
        sudo: e.sudo,
      })
      continue
    }
    if (e.type === 'released' && e.codeReview) {
      // A plain release falls through to the default below, unchanged: it has
      // nowhere to fold FROM — the beat is only for the Code Review combo.
      flush()
      plans.push({
        kind: 'releasePlaced',
        key: `release:${e.id}`,
        eventId: e.id,
        player: e.player,
        slot: e.slot,
        card: e.card,
        codeReview: e.codeReview,
      })
      continue
    }
    if (e.type === 'discarded') {
      if (owned.has(e.id)) continue
      const p = before.pending
      // The sudo half of a resolving pair — checked ahead of the attack card
      // so a sudo Rollback (which banks ONLY this half; the attack card
      // returns to its owner's hand instead) still gets a beat: the match here
      // does not require `pairOut` to already exist, only the other one does.
      //
      // `e.reason === 'attackSpent'` is load-bearing, not decoration: Rollback
      // is itself sudo-capable (fake/attacks.ts's `onHandDefend`), so a
      // defender can combo THEIR OWN `support-sudo` onto a Rollback. That
      // banks the defender's group (`defenceSpent`: the Rollback card, then
      // their sudo) BEFORE the attacker's group (`attackSpent`: their own
      // sudo alone) — the reverse of every other resolution, where the
      // attacker's cards are banked first. Without the reason check, the
      // defender's `defenceSpent` sudo discard (which arrives FIRST here)
      // would wrongly claim `pairOut.aux`, and the attacker's own
      // `attackSpent` sudo discard — the pending's REAL other half — would
      // then fail `!pairOut?.aux`, fall to `sourceOf`, find nothing (its card
      // left the attacker's hand back when the attack was thrown, long before
      // this batch), and silently vanish instead of animating.
      if (
        p?.kind === 'defend' &&
        p.sudo &&
        e.reason === 'attackSpent' &&
        e.card === 'support-sudo' &&
        !pairOut?.aux
      ) {
        if (!pairOut) {
          flush()
          pairOut = { kind: 'pairToDiscard', key: `pairOut:${e.id}` }
        }
        pairOut.aux = { eventId: e.id, card: e.card }
        continue
      }
      // The attack card itself, claimed ahead of `sourceOf`: the centre is
      // where it stands, and `sourceOf` would never find it there (no hand, no
      // zone). The engine banks it before the sudo half (fake/attacks.ts's
      // `bankSpent`), and only one exchange can be pending at a time, so a
      // second `attackCard` match in one batch cannot happen today — the
      // `!pairOut` guard is what would make it fall through safely if it ever
      // did. `e.reason === 'attackSpent'` is a no-op today (the attack card is
      // never discarded under any other reason — a Rollback returns it to
      // hand instead of discarding it) but keeps this branch's own invariant
      // explicit and symmetric with the sudo branch above.
      if (
        p?.kind === 'defend' &&
        e.reason === 'attackSpent' &&
        e.card === p.attackCard &&
        !pairOut
      ) {
        flush()
        pairOut = {
          kind: 'pairToDiscard',
          key: `pairOut:${e.id}`,
          main: { eventId: e.id, card: e.card },
        }
        continue
      }
      const source = sourceOf(e, before, claimed)
      // No source means the card is not where the board can see it — a case the
      // rules have not settled (docs/animations/backlog.md). Nothing is invented:
      // it is not flown, and the projection still puts it in the discard.
      if (!source) continue
      if (!discard) flush()
      discard ??= { kind: 'discard', key: `discard:${e.id}`, cards: [] }
      discard.cards.push({ key: `d${e.id}`, eventId: e.id, card: e.card, source })
      continue
    }
    if (e.type === 'deckReshuffled') {
      flush()
      plans.push({ kind: 'reshuffle', key: `reshuffle:${e.id}`, cards: e.cards })
      continue
    }
    if (e.type === 'pilesChanged') {
      const step = classifyPiles(piles, e.piles)
      // The running counts advance either way: a prune plays nothing, but the
      // NEXT step has to be classified against the table as it now stands.
      piles = e.piles
      if (!step) continue
      if (!pileRun) flush()
      pileRun ??= { kind: 'piles', key: `piles:${e.id}`, steps: [] }
      pileRun.steps.push(step)
      continue
    }
    // Everything else breaks a run and plays nothing. That is the default, not a
    // gap: the board is driven by the projection, and a beat only ever adds a way
    // of GETTING to the next one. A batch can span multiple engine actions
    // (useBeats.ts), so an unrelated event here — a turn boundary, a pass —
    // must close whatever run is open, or two draws either side of it would
    // wrongly read as one gesture.
    flush()
  }
  flush()
  return plans
}
