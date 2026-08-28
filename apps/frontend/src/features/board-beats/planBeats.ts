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
   * Turned up in front of the whole table. `discardId` is the trigger's own
   * `discarded`, which the DRAW beat owns: the card is at the centre when it is
   * filed, and flying it from a hand slot it never occupied would be a lie.
   *
   * ABSENT means the trigger STANDS. An Error 503 that raises a
   * `neutralize503` is not banked until it is answered (#102, and
   * docs/rules/resolution.md's own destinations table), so there is no discard
   * to claim and nothing to fly — the beat hands it to the pending's static
   * render instead.
   */
  reveal?: {
    card: string
    discardId?: number
    /**
     * The draw ANSWERED it: a standing Monitoring makes a 503 "ignored", so the
     * engine banks it inside this same batch and no pending is ever raised
     * (#103 testing, problem 2). The board still lights the alarm for the beat
     * — the table has to see that a 503 landed — and this is the only thing
     * that can tell it to, since there is no pending to read it off.
     */
    neutralized?: true
  }
}

export type PileStep =
  | { kind: 'split'; at: number; piles: number[] }
  | { kind: 'merge'; withDiscard: boolean; piles: number[] }
  | { kind: 'fromDiscard'; at: number; piles: number[] }

export type BeatPlan =
  | { kind: 'draw'; key: string; draws: PlannedDraw[] }
  // `gather` marks a defenceless player's whole table leaving as one sweep —
  // everything they owned gathered at the centre and held before it scatters
  // (#102). Absent for an ordinary discard, never `false`.
  | { kind: 'discard'; key: string; cards: DiscardCard[]; gather?: true }
  | { kind: 'reshuffle'; key: string; cards: number }
  | { kind: 'piles'; key: string; steps: PileStep[] }
  // A player is out: the full-screen video plays over a board that has already
  // settled into its eliminated state (#103). Carries no clip of its own — the
  // runner resolves one from `eventId`, so every peer watching the same
  // elimination watches the same clip without a word about it on the wire.
  | { kind: 'eliminated'; key: string; eventId: number; player: string }
  // A window attack reaches the centre — the pair, if it threw with a Sudo,
  // or a lone card if not. The pair settles at the centre and not at a seat, so
  // `target` is not a destination; it is carried because the runner has to know
  // whether the answer is OURS to give before it may publish a shadow that says
  // one is owed (#101, Fix C, finding 4 — see `comboBeat.runAttack`).
  | {
      kind: 'attackPlaced'
      key: string
      eventId: number
      attacker: string
      card: string
      sudo: boolean
      target: string
      /**
       * The attack was resolved on the spot and never stood awaiting anything:
       * its own `attackSpent` discard follows it in this very batch, with no
       * answer between them. True for a DDoS, which the engine banks inside the
       * play itself and raises no pending for (`fake/release.ts`).
       *
       * Carried because the beat cannot see it: `ctx.base.pending` is the state
       * BEFORE the batch, so a runner has no way to ask whether the engine
       * ended up owing anybody a defence. Absent means the ordinary case — an
       * attack that stands until it is answered.
       */
      resolved?: true
    }
  // Every release flies into its slot. `codeReview` rides along when the play
  // was a combo; `cost` when the rules made it pay for itself — the card is
  // shown OPEN beside the release before it leaves, so the release beat owns
  // that discard rather than letting `discardBeat` fly it out of a hand slot it
  // had already left.
  | {
      kind: 'releasePlaced'
      key: string
      eventId: number
      player: string
      slot: string
      card: string
      codeReview?: string
      cost?: { eventId: number; card: string }
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
  // A defence answers the attack standing at the centre. `effect` decides what
  // happens next, and the plan carries everything the runner needs to play it
  // without going back to the projection: the exchange's own cards and, for a
  // Rollback, who gets the attack card back.
  | {
      kind: 'covered'
      key: string
      eventId: number
      defender: string
      card: string
      /** the defender's own Sudo, when they comboed one onto the defence */
      sudo?: string
      effect: 'cancel' | 'return' | 'reflect' | 'take'
      attacker: string
      attackCard: string
      /** the Sudo the ATTACK was thrown with */
      attackSudo: boolean
      /**
       * The cards banked by this resolution, each with its own discard event.
       * `reason` is carried, not dropped: `support-sudo` can appear on BOTH
       * sides of one exchange (a sudo-backed attack answered by a sudo-backed
       * defence), and the reason is the only thing that tells the two apart —
       * `attackSpent` is the attacker's, `defenceSpent` the defender's.
       */
      spent: { eventId: number; card: string; reason: 'attackSpent' | 'defenceSpent' }[]
      /** Rollback only: whose hand the attack card goes back to */
      returnTo?: string
    }
  // Security Bug does not burn the release it beats — it takes it. The card crosses from
  // the victim's zone into the thief's and morphs into its LOD reading IN
  // FLIGHT: an opponent's zone reads at a glance, not in full.
  | {
      kind: 'stolen'
      key: string
      eventId: number
      from: string
      to: string
      slot: string
      card: string
    }
  // An Error 503 answered. Everything the runner needs to play the exchange
  // without going back to the projection: the alarm standing at the centre,
  // and what the answer cost — nothing at all for Monitoring, which answers
  // from where it stands and stays there.
  | {
      kind: 'neutralized'
      key: string
      eventId: number
      player: string
      method: 'debugger' | 'monitoring' | 'sacrifice'
      /** sacrifice only: the zone slot the answer flies out of */
      slot?: string
      /**
       * The alarm's own discard. Optional, not guaranteed: a `crush` shares
       * this event with no card standing anywhere, so the plan must survive
       * having no alarm to take away.
       */
      alarm?: { eventId: number; card: string }
      /** the Debugger, or the sacrificed release and its Code Review */
      spent: { eventId: number; card: string }[]
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
function revealAfter(
  events: Event[],
  i: number,
): { card: string; discardId?: number; neutralized?: true } | null {
  const reveal = events[i + 1]
  if (!reveal) return null
  const card =
    reveal.type === 'revealed' ? reveal.card : reveal.type === 'aiRevealed' ? reveal.aiCard : null
  if (card == null) return null
  // A standing Monitoring answers a 503 inside the very draw that turned it up
  // (#103 testing, problem 2), and the `neutralized` that says so sits between
  // the reveal and the discard — the discard is parented to the method that
  // banked it, the same shape every chosen answer has. So the method is stepped
  // OVER to reach the card's own exit, rather than the engine's causal order
  // being bent to suit the walk.
  const answered = events[i + 2]?.type === 'neutralized'
  const filed = events[answered ? i + 3 : i + 2]
  // No discard behind it: the trigger is standing, not leaving. Reported as a
  // reveal all the same — the flight to the centre and the flip are the same
  // either way, and only the tail differs.
  if (filed?.type !== 'discarded' || filed.card !== card) return { card }
  // `neutralized` rides along because the BEAT needs it and cannot re-derive it:
  // a 503 answered this way never raised a pending, so nothing lights the alarm
  // off the projection and the draw has to carry that fact itself.
  return { card, discardId: filed.id, ...(answered ? { neutralized: true as const } : {}) }
}

// The engine pays the cost and places the release in one reduction, emitting
// `discarded(releaseCost)` immediately before `released`
// (fake/release.ts:281,293 through `placeRelease`). Looking back by POSITION
// rather than scanning the batch is what keeps an unrelated earlier discard
// from being read as this release's cost.
function costBefore(events: Event[], i: number): { eventId: number; card: string } | null {
  const prev = events[i - 1]
  if (prev?.type !== 'discarded' || prev.reason !== 'releaseCost') return null
  return { eventId: prev.id, card: prev.card }
}

// What is standing at the centre awaiting an answer, as the WALK sees it —
// not as the board saw it before the batch (#101, Fix C, finding 4).
//
// The three things a resolution needs to know about the attack it resolves.
// It starts from `before.pending`, because usually the attack was thrown in an
// earlier batch and is already on screen; but a batch can carry the throw AND
// its answer, and then `before.pending` is null and every branch keyed off it
// silently declined to plan. In a star topology that batch is the ordinary
// case rather than an edge one: every peer that is neither attacker nor
// defender receives both events in one relayed sync.
//
// Tracked exactly the way `piles` below already tracks the deck counts through
// the same walk — one local that the events move on as they are read.
interface OpenAttack {
  attacker: string
  attackCard: string
  sudo: boolean
}

export function planBeats(events: Event[], before: BoardState): BeatPlan[] {
  const claimed = new Set<number>()
  // discards the draw beat has taken over — a revealed trigger leaves from the
  // centre, so the discard planner must not claim it a second time
  const owned = new Set<number>()
  const plans: BeatPlan[] = []
  let piles = before.decks.main
  let openAttack: OpenAttack | null =
    before.pending?.kind === 'defend'
      ? {
          attacker: before.pending.attacker,
          attackCard: before.pending.attackCard,
          sudo: before.pending.sudo,
        }
      : null

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
  // The player a sweep is open for — set by `eliminated`, read by the
  // `discarded` branch that follows it to mark that run gathered. Cleared
  // INSIDE `flush()`, alongside the other run locals: `flush()` runs on every
  // branch below (`drawn`, `released`, `defended`, …), not only on the
  // `eliminated`/`discarded` pair, so a flag left standing past its own run
  // would wrongly gather a later, unrelated discard.
  let sweeping: string | null = null
  // The elimination's own beat (#103), held rather than pushed where its event
  // is read: the video plays over an emptied board, and the `eliminated`
  // arrives BEFORE the discards it opens. `flush()` is what puts it behind
  // them — and what emits it at all when there was nothing to sweep.
  let elimination: Extract<BeatPlan, { kind: 'eliminated' }> | null = null
  const flush = () => {
    if (draw) plans.push(draw)
    // A discard beat with nothing aimable is not a beat: every card in the run
    // failed to find a source, which the projection still resolves on its own.
    if (discard && discard.cards.length > 0) plans.push(discard)
    if (pileRun) plans.push(pileRun)
    if (pairOut) plans.push(pairOut)
    // LAST: everything this run flew has to be off the table before the video
    // covers it.
    if (elimination) plans.push(elimination)
    draw = null
    discard = null
    pileRun = null
    pairOut = null
    sweeping = null
    elimination = null
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.type === 'drawn') {
      if (!draw) flush()
      const reveal = e.card === undefined ? revealAfter(events, i) : null
      if (reveal?.discardId !== undefined) owned.add(reveal.discardId)
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
      // it is standing at the centre from here on, for whatever in THIS batch
      // resolves it (#101, Fix C, finding 4)
      openAttack = { attacker: e.attacker, attackCard: e.card, sudo: e.sudo }
      // …unless it was never standing at all. An attack whose own `attackSpent`
      // discard comes NEXT was banked inside the play that made it, with no
      // answer in between — a DDoS, which is not answerable by a defence card
      // and raises no pending. Read off the batch rather than off a card id:
      // what the beat must not do is claim an answer is owed when the engine
      // owes nobody one, and the batch is where that fact actually lives.
      const after = events[i + 1]
      const resolved =
        after?.type === 'discarded' && after.reason === 'attackSpent' && after.card === e.card
      plans.push({
        kind: 'attackPlaced',
        key: `attack:${e.id}`,
        eventId: e.id,
        target: e.target,
        attacker: e.attacker,
        card: e.card,
        sudo: e.sudo,
        ...(resolved ? { resolved: true as const } : {}),
      })
      continue
    }
    if (e.type === 'released') {
      flush()
      const cost = costBefore(events, i)
      plans.push({
        kind: 'releasePlaced',
        key: `release:${e.id}`,
        eventId: e.id,
        player: e.player,
        slot: e.slot,
        card: e.card,
        ...(e.codeReview ? { codeReview: e.codeReview } : {}),
        ...(cost ? { cost } : {}),
      })
      continue
    }
    if (e.type === 'defended') {
      flush()
      const p = openAttack
      if (!p) continue // nothing on the table to answer — never stranded
      // Everything banked by THIS resolution, in the order the engine banked it.
      // The walk continues forward from here rather than scanning: a resolution's
      // discards are contiguous, and the next non-discard event ends them.
      const spent: { eventId: number; card: string; reason: 'attackSpent' | 'defenceSpent' }[] = []
      let j = i + 1
      while (j < events.length) {
        const d = events[j]
        if (d.type !== 'discarded') break
        if (d.reason !== 'attackSpent' && d.reason !== 'defenceSpent') break
        spent.push({ eventId: d.id, card: d.card, reason: d.reason })
        owned.add(d.id)
        j++
      }
      // Rollback keeps nobody's attack card: the engine puts it straight back
      // into a hand and emits NOTHING for it (attacks.ts:245-252). Whose hand is
      // derivable and only derivable: the defender's when they comboed their own
      // Sudo onto the defence, the attacker's otherwise. Recorded as a gap in
      // docs/animations/backlog.md, with `handTransfer` named as what would end
      // the inference.
      // matched on the REASON as well as the card: a sudo-backed attack answered
      // by a plain Rollback must still return the attack to the ATTACKER, and
      // matching on the card alone would read the attacker's own sudo as ours
      //
      // Assumes 'support-sudo' is the only sudo-capable support card in the
      // catalogue — silently wrong (falls through to `attacker` below) if a
      // second one is ever added.
      const ownSudo = spent.find((s) => s.card === 'support-sudo' && s.reason === 'defenceSpent')
      plans.push({
        kind: 'covered',
        key: `covered:${e.id}`,
        eventId: e.id,
        defender: e.player,
        card: e.card,
        sudo: ownSudo?.card,
        effect: e.effect,
        attacker: p.attacker,
        attackCard: p.attackCard,
        attackSudo: p.sudo,
        spent,
        ...(e.effect === 'return' ? { returnTo: ownSudo ? e.player : p.attacker } : {}),
      })
      openAttack = null // answered — nothing is standing at the centre now
      i = j - 1 // the discards this plan claimed are consumed
      continue
    }
    if (e.type === 'releaseStolen') {
      // One event, one beat — the crossing is its own gesture, never coalesced
      // with the exchange it followed (the attack's own exit already took the
      // pair route above, when it applies) or anything after it.
      flush()
      plans.push({
        kind: 'stolen',
        key: `stolen:${e.id}`,
        eventId: e.id,
        from: e.from,
        to: e.to,
        slot: e.slot,
        card: e.card,
      })
      continue
    }
    if (e.type === 'eliminated') {
      // Everything this player owned leaves at once, and it leaves as ONE
      // gesture: gathered at the centre, held open long enough for the table to
      // read what happened, and only then scattered. The same beat the hand
      // limit gets (#104 will reuse this leg).
      flush()
      sweeping = e.player
      // Held, not pushed — see `elimination` above. The `flush()` just above is
      // what keeps two eliminations in one batch as two beats: the first is
      // already out before the second is opened.
      elimination = {
        kind: 'eliminated',
        key: `eliminated:${e.id}`,
        eventId: e.id,
        player: e.player,
      }
      continue
    }
    if (e.type === 'neutralized') {
      // One event, one beat — the exchange is its own gesture, never coalesced
      // with what came before or after.
      flush()
      // Everything this resolution banked, in the order the engine banked it:
      // the alarm first, then what paid for it (fake/triggers.ts's own
      // `bankAlarm`). The walk continues forward rather than scanning — a
      // resolution's discards are contiguous, and the first non-discard event
      // ends them. `releaseDestroyed` sits between them for a sacrifice, and
      // names the slot, so it is read rather than skipped.
      let alarm: { eventId: number; card: string } | undefined
      const spent: { eventId: number; card: string }[] = []
      let slot: string | undefined
      let j = i + 1
      while (j < events.length) {
        const d = events[j]
        if (d.type === 'releaseDestroyed' && d.player === e.player) {
          slot = d.slot
          j++
          continue
        }
        if (d.type !== 'discarded') break
        // Already claimed by the DRAW that turned the trigger up: a 503 a
        // standing Monitoring answered by itself is flown out by the draw beat,
        // and two beats flying one card is the duplicate `owned` exists to stop.
        if (owned.has(d.id)) {
          j++
          continue
        }
        if (d.reason === 'trigger' && !alarm) {
          alarm = { eventId: d.id, card: d.card }
        } else if (d.reason === 'neutralized') {
          spent.push({ eventId: d.id, card: d.card })
        } else {
          break
        }
        owned.add(d.id)
        j++
      }
      // An exchange with nothing in it is not a beat. Reachable exactly once:
      // a 503 a standing Monitoring answered by itself, whose only moving card
      // is the alarm — and the DRAW that turned it up already owns that flight.
      // A beat here would hold the table for its own hold with nothing to show.
      if (!alarm && spent.length === 0) {
        i = j - 1
        continue
      }
      plans.push({
        kind: 'neutralized',
        key: `neutralized:${e.id}`,
        eventId: e.id,
        player: e.player,
        method: e.method,
        ...(slot ? { slot } : {}),
        ...(alarm ? { alarm } : {}),
        spent,
      })
      i = j - 1 // the discards this plan claimed are consumed
      continue
    }
    if (e.type === 'discarded') {
      if (owned.has(e.id)) continue
      // the release's own cost — claimed by the `releasePlaced` beat that
      // follows it in this same batch, where it is shown open before it leaves
      if (e.reason === 'releaseCost') continue
      const p = openAttack
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
        p?.sudo &&
        e.reason === 'attackSpent' &&
        // Assumes 'support-sudo' is the only sudo-capable support card in the
        // catalogue — silently wrong (this discard falls through to `sourceOf`
        // instead) if a second one is ever added.
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
      if (p && e.reason === 'attackSpent' && e.card === p.attackCard && !pairOut) {
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
      // Captured BEFORE `flush()`: flush is what clears `sweeping` (it runs on
      // every branch, not only this one), so reading the flag after it would
      // always see it already gone and the sweep would never gather at all.
      const gather = sweeping === e.player
      // And captured for the same reason (#103): the video plays over an
      // emptied board, so it must not be flushed out ahead of its own sweep.
      const opened: Extract<BeatPlan, { kind: 'eliminated' }> | null = gather ? elimination : null
      // Taken off the local BEFORE the flush and put back after: left standing,
      // `flush()` would push the video ahead of the very sweep it waits for.
      // Only for the run that belongs to it — an unrelated discard flushes the
      // elimination out for real, which is right.
      if (opened) elimination = null
      if (!discard) flush()
      if (opened) elimination = opened
      discard ??= {
        kind: 'discard',
        key: `discard:${e.id}`,
        cards: [],
        ...(gather ? { gather: true as const } : {}),
      }
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
