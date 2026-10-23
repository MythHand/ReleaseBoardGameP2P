import { cardById, GRID_TOP, gridCells } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { nextFrames, play, scatterAt, useDiscardExit, useFlyer, wait } from '@release/ui/animations'
import { type RefObject, useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, HandLimitHandoff } from '~/entities/game/board'
import { CLEAR_STEP, GATHER_HOLD } from '~/entities/game/board'
import { aiCauseExit, withoutAiCause } from './aiCauseExit'
import { sendHeldHome, type Taken, takeHeld } from './held'
import type { BeatPlan, DiscardCard } from './planBeats'
import { toEventsDeck } from './toEventsDeck'
import { withLanded } from './toHeap'
import { withoutFlown } from './withoutFlown'

// THE HAND LIMIT'S OWN EXIT (#104). The excess does not trickle into the heap
// one card at a time: it stands in a grid at the centre — sized upfront from
// the count, so every card goes straight to its own cell — the grid is held
// open long enough for the table to read what the turn cost, and only then does
// the whole of it leave, card by card but as one movement.
//
// Two ways in, one way out:
//   • ADOPT — the actor is us. The grid is already standing: the page's own
//     gesture (`_useHandLimit.tsx`) built it card by card while the player was
//     deciding, long before these events came back off the wire. What stands in
//     it flies nothing in — a carrier there would put a second copy of the card
//     on screen. A grid the player's time ran out on is partial: the cards the
//     keeper added fly from the fan into its free cells first.
//   • BUILD — every other peer, and ourselves with no handoff (a rejoin). The
//     cells are computed rather than rendered: a gathered card needs no DOM cell
//     of its own, it flies to a box and stands there as a carrier — the same
//     thing #102's sweep does with its heap.
//
// The tail is shared, and so is `GATHER_HOLD` itself: the hold here IS the
// no-defence sweep's hold, one value with two readers rather than two tunings.

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// where a flown card starts: the rect its carrier rises on, and — for a card
// out of our fan — the tilt it stands at there (`handCardAt`)
interface Start {
  at: Rect
  pose?: string
}
const startAt = (at: Rect | null): Start | null => (at ? { at } : null)

// The grid's cells in viewport coordinates. `gridCells` gives offsets from the
// grid's own point; the point itself is `GRID_TOP` of the table, measured off
// the ambience layer, which is `inset: 0` of the table (I6 — these are card
// boxes, never a tilted node's bounding rect).
function cellBoxes(n: number, table: Rect): Rect[] {
  const cx = table.left + table.width / 2
  const cy = table.top + (table.height * GRID_TOP) / 100
  return gridCells(n).map((c) => ({
    left: cx + c.dx - c.w / 2,
    top: cy + c.dy - c.h / 2,
    width: c.w,
    height: c.h,
  }))
}

type GatheredCard = NonNullable<ReturnType<typeof cardById>>

// The grid against the cards the engine banked. A card standing in a cell
// claims that cell; a card the grid does not hold — the keeper chose it when the
// player's time ran out with cells still empty — claims none. A grid card the
// bank does not name means the grid is not this decision's.
type Claimed = HandLimitHandoff['cards'][number] | null

function claimCards(cards: DiscardCard[], placed: HandLimitHandoff['cards']): Claimed[] | null {
  const spare = [...placed]
  const claimed = cards.map((card) => {
    const at = spare.findIndex((item) => item.card.id === card.card)
    return at < 0 ? null : spare.splice(at, 1)[0]
  })
  return spare.length === 0 ? claimed : null
}

export function useHandLimitBeat(
  anchors: BoardAnchors,
  handoff?: RefObject<HandLimitHandoff | null>,
  // the grid as it stood before any answer of ours went out — taken only when
  // none did: the keeper answered for us when our time ran out
  grid?: RefObject<HandLimitHandoff | null>,
) {
  const { overlay: exitOverlay, send, reset: resetExit } = useDiscardExit(anchors.discardBox)
  const flyer = useFlyer()
  const latest = useRef({ anchors, send, handoff, grid })
  const generation = useRef(0)
  latest.current = { anchors, send, handoff, grid }

  // where a card that has to be FLOWN in starts from — the same three sources
  // `discardBeat` knows, for the same reason it knows them
  const whereFrom = useCallback((c: DiscardCard): Start | null => {
    const a = latest.current.anchors
    if (c.source.kind === 'hand') {
      const fan = a.handCardAt(c.source.index)
      return fan ? { at: fan.box, pose: fan.pose } : null
    }
    if (c.source.kind === 'release')
      return startAt(rectOf(a.releaseSlot(c.source.player, c.source.slot)))
    return startAt(a.seatBox(c.source.player))
  }, [])

  // The AI card standing behind this prompt goes home now that the batch has
  // answered it. It has been standing on the projection's own render
  // (`_Board.tsx`'s `aiStanding`, off `pending.source`) since the batch that
  // revealed it — that beat could not fly it home, because it still had to
  // stand and explain the prompt this beat is what answers.
  //
  // Written out here rather than imported from `defenseBeat.tsx`'s own
  // `sendHomeward`, or `aiBeat.tsx`'s `goHome`: each runner owns its own
  // `useFlyer` carrier, and a carrier passed between hooks is how this
  // codebase has already grown two latch bugs of that family (`useBeats.ts`'s
  // own comments). `isStale` is this file's own — a reset mid-flight must not
  // let a card from an abandoned match keep travelling.
  const sendHomeward = useCallback(
    async (id: string, isStale: () => boolean) => {
      const a = latest.current.anchors
      const card = cardById(id)
      const from = rectOf(a.effect.current)
      if (!card || !from) return
      // a no-travel raise at the card's own standing spot — the honest answer
      // to "it is here already"
      const [el] = await flyer.raise([{ key: 'homeward', at: from, card }])
      if (!el || isStale()) return
      await toEventsDeck({
        node: el,
        from,
        deck: a.eventsBox.current,
        turnFaceDown: () => flyer.patch('homeward', { faceDown: true }),
      })
      flyer.drop('homeward')
    },
    [flyer.raise, flyer.patch, flyer.drop],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'handLimit' }>, ctx: BeatRun) => {
      const runGeneration = generation.current
      const isStale = () => generation.current !== runGeneration
      // The page may clear this ref as its pending render advances while we
      // yield. Capture the gesture fact now; measure its live cells only after
      // the shadow has painted below.
      const earlyHeld = latest.current.handoff?.current
      // The answer is in: the grid takes nothing more and sends nothing. What is
      // still in our hands — in the air to a cell, on the cursor — is this
      // beat's to carry on (below), and a gesture still running it would send
      // an answer nobody is waiting for or fly a card the beat flies too.
      ;(earlyHeld ?? latest.current.grid?.current)?.close?.()
      // WAIT FOR THE SHADOW, THEN MEASURE — the queue starts this from inside a
      // layout effect, so at entry React has committed the projection that
      // ARRIVED and the shadow that puts the cards back is a commit away. Two
      // frames is how we get to the other side of it (I1, and the same reason
      // `discardBeat` waits).
      await nextFrames()
      if (isStale()) return
      const a = latest.current.anchors
      // Keep a handoff that was already present, but give the same-commit
      // local/keeper path one frame boundary to publish its dispatched grid.
      // `useBeats` starts this runner in an earlier layout effect than Board's
      // handoff effect, so the ref can legitimately be null at entry and live
      // by the time the shadow is ready to measure.
      //
      // No answer of ours went out at all: the keeper answered for us when our
      // time ran out, and the grid we had laid out so far is the one standing.
      const held = earlyHeld ?? latest.current.handoff?.current ?? latest.current.grid?.current
      // Adopt only a grid that is REALLY ours: the same player, and every card
      // standing in it one the engine banked. Cells it lacks are the keeper's
      // answer for a player whose time ran out. Anything else falls through to
      // the honest path — a flight from where the board can actually see the
      // card.
      const mine = plan.player === ctx.base.selfId
      // …and only a grid that is ON SCREEN: before the first pull there are no
      // cells to measure, and nothing in them to adopt.
      const adopted =
        held && mine && held.player === plan.player && held.cellAt(0) != null
          ? claimCards(plan.cards, held.cards)
          : null
      // The hand as the fan draws it now: without the cards standing in the
      // grid. A card still to be flown in is found in THIS, not in the whole
      // hand — the fan's slots are counted without the grid's cards.
      const inGrid = new Set(held?.cards.map((p) => p.uid))
      // the hand as it stood when the answer came in — read before the cards
      // are taken off it below (`withoutFlown`)
      const hand = ctx.base.you?.hand ?? []
      // …and the fan as it is DRAWN: without the grid's cards, and without the
      // cards still in our hands (on the cursor, in the air), which the fan does
      // not draw either — its slots are counted on what is on screen
      const notHeld = hand.filter((h) => latest.current.anchors.heldCard(h.uid) == null)
      const slotsIn = (drawn: typeof hand) => {
        const claimed = new Set<number>()
        return (id: string): Start | null => {
          const at = drawn.findIndex((h, i) => h.card.id === id && !claimed.has(i))
          if (at < 0) return null
          claimed.add(at)
          const fan = latest.current.anchors.handCardAt(at)
          return fan ? { at: fan.box, pose: fan.pose } : null
        }
      }
      // the grid adopted, its cards are drawn in it and not in the fan
      const fanSlot = slotsIn(notHeld.filter((h) => !inGrid.has(h.uid)))
      // no grid adopted: the fan is the hand, less what is in our hands
      const handSlot = slotsIn(notHeld)
      // A CARD STILL IN OUR HANDS — flying to its cell, or on the cursor — goes
      // on from where it is (`takeHeld`). Found by id like every other card
      // here; matched against the hand, because that is where the gesture's
      // card still is as far as the board is concerned. One take per card.
      const taken: Taken[] = []
      const takeOurs = (id: string): Taken | null => {
        if (!mine) return null
        const uid = hand.find(
          (h) =>
            h.card.id === id &&
            !inGrid.has(h.uid) &&
            !taken.some((t) => t.uid === h.uid) &&
            latest.current.anchors.heldCard(h.uid) != null,
        )?.uid
        const got = takeHeld(latest.current.anchors, uid)
        if (got) taken.push(got)
        return got
      }
      const ourHand = () => hand.map((h) => h.uid)

      // INTO THE GRID — cards flown from where they stand to their cells. I10:
      // every carrier mounts on its OWN rect, and they travel at once, so the
      // grid fills as one gesture, not as a queue of arrivals.
      //
      // A card taken out of our hands brings its own node: it is not raised a
      // second time, it simply travels on — and stays where it lands until the
      // exit lets it go, as the gesture's grid cells do.
      const gather = async (
        flying: {
          key: string
          card: GatheredCard
          from: Start | null
          node?: HTMLElement
          box: Rect
          slot: number
        }[],
      ): Promise<boolean> => {
        if (flying.length === 0) return true
        // a card out of the fan rises in the tilt it stands at, and the flight
        // straightens it on the way (`move` starts from the carrier's own pose)
        const raised = flying.flatMap((f) =>
          f.node || !f.from
            ? []
            : [{ key: f.key, at: f.from.at, pose: f.from.pose, layer: f.slot, card: f.card }],
        )
        if (raised.length > 0) await flyer.raise(raised)
        if (isStale()) return false
        await Promise.all(
          flying.map(async (f) => {
            if (f.node) {
              await play('playToCenter', f.node, { to: f.box })?.finished
              return
            }
            const el = flyer.elOf(f.key)
            const movement = el ? play('playToCenter', el, { to: f.box }) : null
            if (movement) {
              await movement.finished
              if (isStale()) return
            }
            if (isStale()) return
            // I4 — it IS at the cell now; pin it, or the next render puts the
            // carrier back where it was raised
            flyer.pin(f.key, f.box)
          }),
        )
        return !isStale()
      }

      // TAKEOFF: the cards are gone from wherever they stood — publish before
      // the movement, or the board shows each card twice for its whole flight.
      // The discard end stays `ctx.base`'s own (see `withoutFlown`).
      //
      // …and the run's base MOVES WITH it, as `discardBeat`'s does: the cards
      // are filed into the heap once they land, on `ctx.base`, and a base left
      // holding them put every one back in the hand — or back on a rival's
      // count — in the very frame it lay down in the discard (#168).
      const flown = withoutFlown(ctx.base, plan.cards)
      ctx.base = flown
      ctx.publish(flown)

      let items: Leaving[] = []

      if (adopted) {
        // ADOPT. The grid is standing; each card leaves from the cell it has
        // been sitting in. Matched by card id with a claimed list, the same way
        // `sourceOf` claims a hand slot: two copies of one card are
        // interchangeable to look at, so the first unclaimed one is right.
        //
        // A card the grid lacks takes the first free cell and flies there from
        // its place in the fan — found the same way, by id, in the hand the fan
        // draws — before the grid leaves as a whole.
        const filled = new Set(adopted.flatMap((p) => (p ? [p.slot] : [])))
        const free = plan.cards.map((_, slot) => slot).filter((slot) => !filled.has(slot))
        const measured = adopted
          .map((placed, i) => {
            const planCard = plan.cards[i]
            const slot = placed ? placed.slot : free.shift()
            const box = slot == null ? null : rectOf(held?.cellAt(slot) ?? null)
            const card = placed ? placed.card : cardById(planCard.card)
            const ours = !placed && planCard.source.kind === 'hand' ? takeOurs(planCard.card) : null
            const from =
              placed || ours
                ? null
                : planCard.source.kind === 'hand'
                  ? fanSlot(planCard.card)
                  : whereFrom(planCard)
            return box && card && slot != null && (placed || ours || from)
              ? { box, card, planCard, slot, from, node: ours?.el }
              : null
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry != null)
        // what we were holding that this answer did not take goes home
        sendHeldHome(latest.current.anchors, ourHand(), taken)
        if (measured.length !== plan.cards.length) {
          // Geometry is animation input, never game truth. Keep the complete
          // grid through its hold, then yield every card together to the
          // accepted projection instead of releasing it under a partial exit.
          //
          // The road home is deliberately skipped on this bail-out (#106):
          // once the pending clears, `_Board.tsx`'s `aiStanding` derivation
          // yields null anyway, so the card leaves the standing slot
          // regardless of whether this beat flies it — and flying it home
          // from a beat that has already given up on its own geometry risks
          // a flight from a stale rect, which is worse than no flight.
          await wait(GATHER_HOLD)
          if (isStale()) return
          held?.release()
          for (const t of taken) t.release()
          flyer.drop()
          return
        }
        const missing = measured.flatMap(({ box, card, planCard, slot, from, node }) =>
          from || node ? [{ key: `hl${planCard.eventId}`, card, from, node, box, slot }] : [],
        )
        if (!(await gather(missing))) return
        // THE LAYER IS THE HEAP'S ORDER, NOT THE GRID'S. The cards are filed in
        // the order they were discarded (`withLanded`, and the keeper's own
        // heap), and a grid we filled ourselves stands in the order we filled
        // it, the keeper's cards in whatever cells were left. Riding their
        // cells' layers, they landed in one order and the heap re-laid them in
        // another (owner, 23.10; I9). They still leave cell by cell.
        items = measured.map(({ box, card, planCard, slot }, i) => ({
          key: planCard.key,
          card,
          from: box,
          layer: i,
          delay: slot * CLEAR_STEP,
          scatter: scatterAt(planCard.eventId),
        }))
      } else {
        // BUILD. Cells are computed, not rendered — a gathered card stands on
        // its own carrier until the exit takes over.
        //
        // …except Bad Vibe-Coding's, which has no grid at all (#106, Decision
        // 6): `gridCells(1)` centres its one cell at `dx 0`, underneath the AI
        // card standing at the `effect` place. `plan.picked` is the same fact
        // `_useHandLimit`'s own `aiPicked` render reads, carried on the plan
        // because THIS path is every peer who is not the discarder — they have
        // no handoff to adopt, so without it they would build that overlap.
        //
        // The box is MEASURED off the board's own `picked` anchor rather than
        // computed here: that node is positioned by
        // `centrePlaceStyle('aiPick', 'picked')`, so the beat and the render
        // read one geometry instead of two copies of `CENTRE_SLOTS.picked`.
        const table = rectOf(a.bg.current)
        const pickedBox = plan.picked ? rectOf(a.picked.current) : null
        // One card by construction — the pending's `excess` is 1 for Bad Vibe
        // — and if that ever stopped being true this stacks them exactly as
        // the page's own `aiPicked` render already stacks its cells there.
        const boxes = pickedBox
          ? plan.cards.map(() => pickedBox)
          : table
            ? cellBoxes(plan.cards.length, table)
            : []
        const flying: {
          key: string
          planCard: DiscardCard
          card: GatheredCard
          from: Start | null
          node?: HTMLElement
          box: Rect
          slot: number
        }[] = []
        for (let i = 0; i < plan.cards.length; i++) {
          const planCard = plan.cards[i]
          const card = cardById(planCard.card)
          const ours = planCard.source.kind === 'hand' ? takeOurs(planCard.card) : null
          // our own card out of the fan: counted on the fan as drawn, as above
          const from = ours
            ? null
            : mine && planCard.source.kind === 'hand'
              ? handSlot(planCard.card)
              : whereFrom(planCard)
          const box = boxes[i]
          if (!card || !(from || ours) || !box) continue
          flying.push({
            key: `hl${planCard.eventId}`,
            planCard,
            card,
            from,
            node: ours?.el,
            box,
            slot: i,
          })
        }
        if (mine) sendHeldHome(latest.current.anchors, ourHand(), taken)
        if (!(await gather(flying))) return
        items = flying.map((f) => ({
          key: f.planCard.key,
          card: f.card,
          from: f.box,
          layer: f.slot,
          delay: f.slot * CLEAR_STEP,
          scatter: scatterAt(f.planCard.eventId),
        }))
      }

      // Same deliberate omission as the adopted-mismatch bail-out above: the
      // road home (#106) is not sent from here either. Nothing measurable
      // means the grid itself never played, so there is nothing for the
      // homeward leg to follow either — and the same "a stale rect is worse
      // than no flight" reasoning applies.
      if (items.length === 0) return

      // HELD OPEN — the same beat the no-defence sweep holds for, and the same
      // value: the table has to be able to read what the turn cost before any
      // of it moves.
      await wait(GATHER_HOLD)
      if (isStale()) return

      // Hand the grid back immediately ahead of the exit, never before the hold
      // (`defenseBeat`'s own ordering, and the bug it was written for): the
      // exit mounts its own carriers at these very boxes, so the page's render
      // and the flight swap inside one commit. `release()` drops the grid's
      // render only — the picked cards stay out of the fan until the pending
      // itself clears.
      if (adopted) held?.release()
      for (const t of taken) t.release()
      flyer.drop()
      if (isStale()) return

      // Bad Vibe resolves as one departure: the selected card and its trigger
      // go to the discard while the AI card returns to its deck. Clear the
      // standing pair in the same commit that mounts those exit carriers.
      const causeItems = aiCauseExit(plan.causeward, a)
      // THE TRIGGER LANDS UNDER THE CARD GIVEN UP — it is under it in the heap,
      // filed at the reveal, long before the hand gave anything up. Both rode
      // layer 0 and the later-mounted trigger landed on top, then sank under the
      // card the moment the heap took over (owner's recording, 04.10). The 503
      // answer's own rule (`defenseBeat`'s `runNeutralized`): the cause at the
      // bottom, everything this exchange sends one layer above it.
      const sent =
        causeItems.length > 0
          ? [
              ...items.map((it) => ({ ...it, layer: (it.layer ?? 0) + 1 })),
              ...causeItems.map((it) => ({ ...it, layer: 0 })),
            ]
          : items
      // the standing pair goes in the same commit that mounts those exit
      // carriers — the step's own `takeOff`, which is where that ordering lives
      const clearStanding = () => {
        if (!plan.homeward && !plan.causeward) return
        const next = withoutAiCause(flown, causeItems.length > 0 ? plan.causeward : undefined)
        ctx.base = next
        ctx.publish(next)
      }
      if (items.length + causeItems.length === 0) clearStanding()
      await Promise.all([
        latest.current.send(sent, clearStanding).then(() => {
          if (isStale()) return
          // the cause goes back into the heap it was taken out of for its flight…
          const restored = causeItems.length > 0 ? { ...ctx.base, decks: flown.decks } : ctx.base
          // …and the thrown cards land in it, filed by the beat that flew them:
          // `flown` keeps the discard as it was before the batch, so without
          // this they are nowhere until the projection catches up (toHeap.ts)
          const next = withLanded(
            restored,
            plan.cards.map((c) => ({ eventId: c.eventId, card: c.card })),
          )
          if (next === ctx.base) return
          ctx.base = next
          ctx.publish(next)
        }),
        plan.homeward ? sendHomeward(plan.homeward, isStale) : undefined,
      ])
    },
    [whereFrom, flyer.raise, flyer.elOf, flyer.pin, flyer.drop, sendHomeward],
  )

  // A new match cancels what is in the air: both the exit step's flights and
  // this runner's own carriers belong here, not to the queue, and a card left
  // mid-flight would keep crossing the board of a match that no longer exists.
  const reset = useCallback(() => {
    generation.current += 1
    resetExit()
    flyer.drop()
  }, [resetExit, flyer.drop])

  return { overlay: [...exitOverlay, ...flyer.overlay], run, reset }
}
