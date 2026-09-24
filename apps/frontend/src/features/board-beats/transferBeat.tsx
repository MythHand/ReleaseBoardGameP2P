import { useTranslation } from '@release/translation'
import type { CardData } from '@release/ui'
import { cardBoxIn, cardById } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { nextFrames, play, SHAKE_FLINCH, useFlyer, wait } from '@release/ui/animations'
import type { RefObject } from 'react'
import { useCallback, useRef, useState } from 'react'
import type { BeatRun, BoardAnchors, BoardState } from '~/entities/game/board'
import type { RequestPickHandoff } from '~/entities/game/board/types'
import type { BeatPlan } from './planBeats'
import { seatCardBox } from './seat'
import { useToHand } from './toHand'
import styles from './transferBeat.module.css'

// A card changes hands. One surface seen from three sides — you take a card,
// you lose one, or you watch one cross the table — and they are one runner
// because the flight is one flight: a seat, the centre, a destination. What
// differs is which end is a hand and which is a seat, and whether the card has
// an identity this peer is entitled to at all.
//
// THE BRANCH THAT MATTERS is not `role`, it is `plan.card`. Present means this
// peer is a party to the transfer (the engine sets `visibleTo: [from, to]`);
// absent means it is not, and the flight closes. Nothing here re-derives who
// may see what — that answer arrived with the event, and re-deriving it is how
// a hand leaks.

const REVEAL_HOLD = 820 // face-up at the centre before it drops into the fan
// The width a card taken out of the closed fan reaches at the centre. It is
// held there to be READ, and a card at the slot's own width is not being shown
// to anybody — `PickOpponentCardStory`'s own REVEAL_W.
const REVEAL_W = 220
// That fan is held out across the table, drawn inside a container turned 180°,
// so a card taken out of it starts upside down and straightens over the flight
// — the same half turn the scene's own reveal makes on its way in.
const OFFER_TURN = 180
const CENTER_HOLD = 820 // face-down at the centre before it sinks into the seat
const REQUEST_HOLD = 820 // the named card stands at the centre before the outcome
// The chosen card holds while the rest of the catalogue leaves — the scene's own
// beat between the confirm and the outcome (`PickSpecificCardStory`).
const PICK_BEAT = 620
const MISS_HOLD = 1620 // the flinch and the note, before the scene clears

// One flyer key for the whole run: there is never more than one card in the
// air here, and a key IS a flyer — raising the same key twice replaces the
// carrier instead of hanging a second node on the same name.
const KEY = 'transfer'

const OFFER_STEP = 45 // between neighbouring backs, as they fan out
const OFFER_HOLD = 620 // the hand stands offered before the card turns over
const OFFER_SPREAD = 0.62 // how far across the centre the fan opens, as a share of its width
const OFFER_MAX = 9 // backs actually rendered; a bigger hand is not a bigger question

// A card nobody at this seat is entitled to know. The projection never says
// what it is, so nothing here may guess: this carries no face, only the base
// deck's cover, and it is always flown faceDown. `Card` reads `deck` for the
// back and nothing else.
const COVER: CardData = {
  id: 'unknown',
  name: '',
  category: 'protection',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// Where the offered backs sit: a shallow arc across the centre, evenly spaced,
// each the size a card is at the table. Not a grid — a hand held out. The
// count is capped because past a point more backs stop reading as "a hand" and
// start reading as "a deck", and the suspense is the same either way.
function offerPoses(count: number, centre: Rect): Rect[] {
  const n = Math.max(1, Math.min(OFFER_MAX, count))
  const span = n === 1 ? 0 : centre.width * OFFER_SPREAD
  const step = n === 1 ? 0 : span / (n - 1)
  const first = centre.left + centre.width / 2 - span / 2 - centre.width / 2
  return Array.from({ length: n }, (_, i) => ({
    left: first + step * i,
    top: centre.top,
    width: centre.width,
    height: centre.height,
  }))
}

function centreAttackOf(base: BoardState): BoardState['centreAttack'] {
  const pending = base.pending
  if (pending?.kind === 'defend') return { card: pending.attackCard, sudo: pending.sudo }
  if (pending && 'attack' in pending && pending.attack)
    return { card: pending.attack, sudo: pending.sudo === true }
  return base.centreAttack
}

// …and the defence lying over it, carried the same way and for the same reason:
// letting go of the pending must not take a card off the table that the rules
// still have standing there. Only a reflected attack has one (`cover` on the
// exchange's context), so this is null for every other exchange.
function centreCoverOf(base: BoardState): BoardState['centreCover'] {
  const pending = base.pending
  if (pending && 'cover' in pending && pending.cover)
    return { card: pending.cover, sudo: pending.coverSudo === true }
  return base.centreCover
}

export function useTransferBeat(
  anchors: BoardAnchors,
  requestPick?: RefObject<RequestPickHandoff | null>,
  /**
   * The fan's own order, for the card this beat lands in it. A card taken off
   * another hand ARRIVES — nobody pointed at a slot for it — so the module puts
   * it in the middle, and the slot it landed in has to be committed or the next
   * projection puts it back where the engine appended it: the end of the fan.
   * The same seam the System Upgrade and Cherry-pick arrivals go through.
   */
  onHandArrival?: (order: string[], uid: string, at: number) => void,
) {
  const { overlay: flyerOverlay, raise, pin, patch, drop, elOf } = useFlyer()

  // The run's own context, held in a ref because the whole beat is one closure
  // and the hand it lands in is the one THIS run has grown, not the one the
  // batch started with.
  const ctx = useRef<BeatRun | null>(null)

  // The card into the fan, whole — the shared movement owns the uid the
  // projection will know it by, the landing, the committed slot and the run's
  // own base.
  const {
    overlay: handOverlay,
    gapAt,
    gapSize,
    land,
    reset: resetArrival,
  } = useToHand(anchors.hand, onHandArrival)

  const latest = useRef({ anchors, land, requestPick })
  latest.current = { anchors, land, requestPick }

  // The donor is one card lighter the moment it leaves them. Published as its
  // own step rather than folded into the landing, because the two ends of a
  // transfer are two different players and the flight is long enough to see
  // both — and because a watcher's flight has this end and no other.
  const dropFromDonor = useCallback((player: string) => {
    const c = ctx.current
    if (!c) return
    const next: BoardState = {
      ...c.base,
      opponents: c.base.opponents.map((o) =>
        o.id === player ? { ...o, handCount: Math.max(0, o.handCount - 1) } : o,
      ),
    }
    c.base = next
    c.publish(next)
  }, [])

  // The recipient is one card heavier the moment the flight lands on them.
  // Symmetric with `dropFromDonor` above, and its own step for the same
  // reason — used from the two legs where the recipient IS an opponent's seat
  // rather than `you.hand` (the taker's own arrival goes through
  // `useHandArrival` instead, which publishes its own landing).
  const bumpRecipient = useCallback((player: string) => {
    const c = ctx.current
    if (!c) return
    const next: BoardState = {
      ...c.base,
      opponents: c.base.opponents.map((o) =>
        o.id === player ? { ...o, handCount: o.handCount + 1 } : o,
      ),
    }
    c.base = next
    c.publish(next)
  }, [])

  // The pre-batch pending stops here, the moment a leg's own carrier takes
  // the card over. Same idiom as `defenseBeat`'s TAKEOFF publish: the beat
  // publishes the state it is animating TOWARD, so `_Board.tsx`'s static
  // `giveCard` render (and `_useRequestStaging`'s `requestCard` band) has
  // nothing left to key on once this fires — instead of standing the same
  // card at the centre underneath this exact flyer for the rest of the leg.
  const clearPending = useCallback(() => {
    const c = ctx.current
    if (!c) return
    const next: BoardState = {
      ...c.base,
      pending: null,
      centreAttack: centreAttackOf(c.base),
      centreCover: centreCoverOf(c.base),
    }
    c.base = next
    c.publish(next)
  }, [])

  const { t } = useTranslation()
  // The miss note. State rather than a ref: it is rendered, and the overlay has
  // to re-render when it appears and again when it goes.
  const [missed, setMissed] = useState(false)

  const runRequested = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'requested' }>, beat: BeatRun) => {
      ctx.current = beat
      try {
        const a = latest.current.anchors
        const centre = rectOf(
          centreAttackOf(beat.base) ? (a.cost?.current ?? a.centre.current) : a.centre.current,
        )
        const card = cardById(plan.card)
        if (!centre || !card) return
        // THE SURFACE IS ALREADY SHOWING IT. The request is public — the rules
        // make it public on a hit and a miss alike — and the list it is made
        // from is the game's own catalogue rather than anybody's hand, so every
        // seat has that surface up and the named card is standing on every
        // board. This beat used to introduce the card instead, popping a copy
        // of it into the centre; for the seat that named it that was the same
        // card twice on screen at once.
        //
        // So it HOLDS rather than introduces: `PICK_BEAT` is the scene's own
        // hold (`PickSpecificCardStory`) — the chosen card standing while the
        // rest of the catalogue leaves — and the surface plays it on every
        // board at once. The pop stays as the answer for a board with no
        // surface at all (reduced motion takes the band down).
        const surface = latest.current.requestPick?.current ?? null
        if (surface) {
          surface.hold(plan.card)
          await wait(PICK_BEAT)
        } else {
          const [el] = await raise([{ key: KEY, card, at: centre, faceDown: false }])
          if (el) {
            const anim = play('popIn', el)
            if (anim) await anim.finished
          }
        }

        if (plan.hit) {
          // Keep the named card in a visual-only handover state until the
          // following transfer beat takes over. Current engine requests and
          // transfers arrive together; legacy saves can span two batches.
          //
          // Publish first, drop second: the board renders this beat's shadow
          // while it runs, so the static render is up before the carrier lets
          // go and the slot is never blank for a frame. Same ordering, and the
          // same reason, as the standing trigger in `drawBeat`.
          //
          // NOT WITH A SURFACE UP. That standing render is a bridge across two
          // batches, and with the request surface there is nothing to bridge:
          // the catalogue holds the card, the defender's fan is still out, and
          // the transfer's own flight comes out of that fan. Published anyway,
          // it left the card standing at the centre between the hold and the
          // flight — the card the player had just watched leave.
          const c = surface ? null : ctx.current
          if (c) {
            const next: BoardState = {
              ...c.base,
              pending: {
                kind: 'giveCard' as const,
                player: plan.target,
                requested: plan.card,
                attacker: plan.attacker,
                ...(centreAttackOf(c.base)
                  ? { attack: centreAttackOf(c.base)?.card, sudo: centreAttackOf(c.base)?.sudo }
                  : {}),
              },
            }
            c.base = next
            c.publish(next)
          }
          await nextFrames() // the publish above has committed (I2)
          surface ? surface.release() : drop(KEY)
          return
        }

        // A MISS. The pending clears outright, so nothing in the projection
        // survives this — the beat carries the whole scene or the table never
        // learns the outcome, which is the rule this exists to keep.
        //
        // Cleared HERE, not at the end: the flyer above is already up and
        // holding the card at the centre, so this is the moment it takes over
        // from the asker's own `CardCatalog` band (`_useRequestStaging`,
        // still armed on `requestCard`). Left standing, that band would stay
        // mounted showing the same card underneath this flyer for the whole
        // hold, shake and note, then vanish with no animation when the queue
        // drains.
        // With a surface holding the card this no longer takes anything over —
        // it only stops the projection claiming a request that has been
        // answered. The surface holds through the flinch and the note.
        clearPending()
        await wait(REQUEST_HOLD)
        // Rendered as the target actually appears: a Seat to everyone watching,
        // and to the target themselves no seat at all — they are `you`, and
        // what they own is the fan. One gesture, two renderings.
        const mine = plan.target === beat.base.selfId
        const flinch = mine ? a.hand.current : a.seatOf(plan.target)
        play('shake', flinch, SHAKE_FLINCH)
        setMissed(true)
        await wait(MISS_HOLD)
        setMissed(false)
        if (surface) {
          surface.release()
          surface.close()
        } else drop(KEY)
      } finally {
        ctx.current = null
      }
    },
    [raise, drop, clearPending],
  )

  const runTransfer = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'handTransfer' }>, beat: BeatRun) => {
      ctx.current = beat
      try {
        if (plan.role === 'taker') {
          const a = latest.current.anchors
          const seat = a.seatBox(plan.from)
          const centre = rectOf(
            centreAttackOf(beat.base) ? (a.cost?.current ?? a.centre.current) : a.centre.current,
          )
          const card = plan.card ? cardById(plan.card) : null
          // A taker always knows what they took — but a missing rect or an
          // unknown id ends the leg and lets the projection stand, which is the
          // contract every runner keeps.
          if (!seat || !centre || !card) return
          // out of the seat's own card box (I6), at the size a card is while it
          // is inside a hidden hand — the exact box `dealToSeat` sinks into
          const root = a.centre.current?.parentElement
          const picked =
            plan.index === undefined
              ? null
              : root?.querySelector<HTMLElement>('[data-transfer-picked]')
          const chosen =
            plan.index === undefined
              ? null
              : Array.from(
                  root?.querySelectorAll<HTMLElement>('[data-transfer-choice]') ?? [],
                ).find((slot) => slot.dataset.transferChoice === String(plan.index))
          // OUT OF THE CLOSED FAN, or out of the donor's seat — two different
          // scenes sharing one flight. Only the fan is held out turned around,
          // and only what came out of it is held at reading size on arrival:
          // the seat's own steal has never been chosen by anybody, so there is
          // nothing to show the taker that they do not already know.
          //
          // A NAMED REQUEST HAS A FAN TOO. The request surface has been holding
          // the defender's closed hand out since the question was asked, so the
          // card that was asked for comes out of THAT — the scene's own move
          // (`PickSpecificCardStory`) — rather than out of a seat, which is
          // where it flew from while there was no hand on screen to fly it out
          // of. The surface is released in the same breath, so the fan slides
          // back up as the card leaves it.
          // WHICH PLACE IT LEAVES IS THE FAN'S OWN ANSWER. The surface holding
          // the fan is the only party that knows whether a place was chosen in
          // it — a blind pick points at one back, a named request points at
          // nothing — so it answers once, for both, and this asks rather than
          // arbitrates. Asking for the middle first and the pressed place second
          // gave the middle to both questions, and every blind pick flew out of
          // the middle whichever back was pressed (#168).
          //
          // The DOM markers below answer for a board with no surface up at all:
          // a watcher's, where the offer is rendered but no hook owns it.
          const asked = latest.current.requestPick?.current ?? null
          const askedSlot = asked?.slot() ?? null
          const offerBox = askedSlot ?? rectOf(picked ?? chosen ?? null)
          const from = offerBox ?? seatCardBox(seat)
          const held = offerBox ? cardBoxIn(centre, REVEAL_W) : centre
          // …and the fan it came out of goes back up with it
          if (askedSlot) asked?.close()
          // A random steal offers the donor's hand first: the suspense is real,
          // because the card genuinely is random. A named one has no question
          // left in it — the table watched the asker choose.
          if (
            !plan.named &&
            plan.index === undefined &&
            beat.base.pending?.kind !== 'stealCard' &&
            plan.donorHand > 0
          ) {
            const poses = offerPoses(plan.donorHand, centre)
            const backs = poses.map((_, i) => ({
              key: `offer${i}`,
              card: COVER,
              at: from,
              faceDown: true,
            }))
            const els = await raise(backs)
            await Promise.all(
              els.map(async (b, i) => {
                if (!b) return
                await wait(i * OFFER_STEP)
                const anim = play('takeFromSeat', b, { from, to: poses[i] })
                if (anim) await anim.finished
              }),
            )
            await wait(OFFER_HOLD)
            // …and back they go. The one that was taken is not among them: it
            // flies on its own below, out of the same seat, so the offer is
            // cleared whole rather than one card short.
            await Promise.all(
              els.map(async (b, i) => {
                if (!b) return
                const anim = play('dealToSeat', b, { from: poses[i], to: from })
                if (anim) await anim.finished
              }),
            )
            for (let i = 0; i < backs.length; i++) drop(`offer${i}`)
          }
          const raised = raise([{ key: KEY, card, at: from, faceDown: true }])
          // TAKEOFF: our own flyer now holds the card (still at the seat, not
          // yet at the centre — but the pending is not standing in for a
          // position, it is standing in for OWNERSHIP of this card's render,
          // and that just changed hands). Clearing any earlier would race the
          // raise above and blank nothing in exchange; any later leaves
          // `_Board.tsx`'s static `giveCard` render doubling this same card
          // at the centre while the flyer is still crossing to it.
          clearPending()
          const [el] = await raised
          if (el) {
            const anim = play('takeFromSeat', el, {
              from,
              to: held,
              rotateFrom: offerBox ? OFFER_TURN : 0,
            })
            if (anim) await anim.finished
            pin(KEY, held) // I4 — it IS at the centre now
          }
          dropFromDonor(plan.from)
          patch(KEY, { faceDown: false }) // Card plays its own flipCard
          await wait(REVEAL_HOLD)
          const at = rectOf(elOf(KEY))
          drop(KEY)
          // A card taken off somebody's hand ARRIVES — the shared movement puts
          // it in the middle of the fan and keeps it there, the same as every
          // reference scene, `PickOpponentCardStory` (this very play) included.
          const c = ctx.current
          if (at && c)
            await latest.current.land(c, { card, from: at, fallbackKey: `t${plan.eventId}` })
          return
        }
        if (plan.role === 'victim') {
          const a = latest.current.anchors
          const centre = rectOf(
            centreAttackOf(beat.base) ? (a.cost?.current ?? a.centre.current) : a.centre.current,
          )
          const seat = a.seatBox(plan.to)
          const card = plan.card ? cardById(plan.card) : null
          if (!centre || !seat || !card) return
          // Which slot it leaves from. The registry indexes rather than looks
          // up by uid — deliberately, so it need not know the hand — and the
          // caller already holds the hand it planned against, so the index is
          // resolved here. Matching on the card ID is what the engine itself
          // matched on (`onGiveCard` checks `card.id === pending.requested`);
          // copies are interchangeable, so the first is as right as any.
          const picked =
            a.centre.current?.parentElement?.querySelector<HTMLElement>('[data-transfer-picked]')
          const uid = picked?.dataset.transferUid
          const index = beat.base.you.hand.findIndex((h) =>
            uid ? h.uid === uid : h.card.id === plan.card,
          )
          const slot = rectOf(picked ?? null) ?? (index >= 0 ? rectOf(a.handSlotAt(index)) : null)
          if (!slot) return
          const raised = raise([{ key: KEY, card, at: slot, faceDown: false }])
          // your fan closes the gap while the card is in the air, and the
          // `giveCard` pending clears in the same publish: our own flyer now
          // holds the card, so `_Board.tsx`'s static centre render has
          // nothing left to earn its keep with (same TAKEOFF moment the taker
          // leg marks separately, folded here into a publish this leg already
          // makes).
          const c0 = ctx.current
          if (c0) {
            const hand = c0.base.you.hand.filter((_, i) => i !== index)
            const next = {
              ...c0.base,
              pending: null,
              centreAttack: centreAttackOf(c0.base),
              centreCover: centreCoverOf(c0.base),
              you: { ...c0.base.you, hand },
            }
            c0.base = next
            c0.publish(next)
          }
          const [el] = await raised
          if (el) {
            const anim = play('playToCenter', el, { from: slot, to: centre })
            if (anim) await anim.finished
            pin(KEY, centre)
          }
          // It turns FACE-DOWN, and that is the beat: from here it is theirs,
          // and a hidden hand is where it is going.
          patch(KEY, { faceDown: true })
          await wait(CENTER_HOLD)
          const to = seatCardBox(seat)
          const held = elOf(KEY)
          if (held) {
            const anim = play('dealToSeat', held, { from: centre, to })
            if (anim) await anim.finished
          }
          drop(KEY)
          // …and the taker's counter carries it now. That counter IS their hand.
          bumpRecipient(plan.to)
          return
        }
        // Public named requests may reveal the card; blind observer events
        // contain no identity and keep the carrier closed throughout.
        const a = latest.current.anchors
        const fromSeat = a.seatBox(plan.from)
        const toSeat = a.seatBox(plan.to)
        const centre = rectOf(
          centreAttackOf(beat.base) ? (a.cost?.current ?? a.centre.current) : a.centre.current,
        )
        if (!fromSeat || !toSeat || !centre) return
        const from = seatCardBox(fromSeat)
        const to = seatCardBox(toSeat)
        const publicCard = plan.card ? cardById(plan.card) : null
        const [el] = await raise([
          { key: KEY, card: publicCard ?? COVER, at: from, faceDown: !publicCard },
        ])
        // TAKEOFF, watcher leg: the `giveCard` pending is public even to a
        // watcher (`pendingView`'s `requested` carries no `mine` gate — the
        // request was named aloud), so a watcher's board is standing the same
        // static centre render as everyone else's until this fires. Our own
        // cover flyer above now carries the crossing, so it stops here.
        clearPending()
        if (el) {
          const out = play('takeFromSeat', el, { from, to: centre })
          if (out) await out.finished
          pin(KEY, centre)
          dropFromDonor(plan.from)
          if (publicCard) {
            await wait(REVEAL_HOLD)
            patch(KEY, { faceDown: true })
          }
          const home = play('dealToSeat', el, { from: centre, to })
          if (home) await home.finished
        }
        drop(KEY)
        bumpRecipient(plan.to)
      } finally {
        ctx.current = null
      }
    },
    [raise, pin, patch, drop, elOf, dropFromDonor, bumpRecipient, clearPending],
  )

  // A new match cancels what is in the air: the carrier this run may have left
  // mid-flight, and the parked arrival that would otherwise land a dead match's
  // card in the new one's fan.
  const reset = useCallback(() => {
    drop()
    resetArrival()
    setMissed(false)
  }, [drop, resetArrival])

  return {
    overlay: [
      ...flyerOverlay,
      ...handOverlay,
      ...(missed
        ? [
            <div key="transfer-miss" className={styles.note}>
              {t('table.requestMiss')}
            </div>,
          ]
        : []),
    ],
    gapAt,
    gapSize,
    runRequested,
    runTransfer,
    reset,
  }
}
