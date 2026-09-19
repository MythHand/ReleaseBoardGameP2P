import type { CardData } from '@release/ui'
import { cardAreaOf } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { nextFrames, play, useFlyer, wait } from '@release/ui/animations'
import { useCallback, useRef, useState } from 'react'
import type { BeatRun, BoardAnchors } from '~/entities/game/board'
import type { BeatPlan, PileStep } from './planBeats'

// What happens to the draw piles themselves. Three movements, one scene
// (`DeckAnimationsStory`), and none of them carries a card whose face anybody
// sees: a pile is face down before and after, so what moves is the pile.
//
// The cards that CAUSE a split or a merge — Git Branch and Git Merge — landed
// with #61 slice B, and `classifyPiles` (planBeats.ts) derives which movement
// ran from `pilesChanged` alone. These are the movements they drive.

const GATHER_MS = 360 // the heap collecting itself into a pile
const TURN_MS = 460 // the gathered pile turning face down on the deck
// Named for the piles, not for a pair: `MERGE_MS` in this feature folder is
// the 620ms card-pair fold (entities/game/board/poses.ts). What moves here is
// a whole pile absorbing into another, and it is a different duration.
const PILE_SPLIT_MS = 520
const PILE_MERGE_MS = 520
const STEP_HOLD = 360 // the standard short beat between deck steps

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDeckBeat(anchors: BoardAnchors) {
  const { overlay, raise, patch, drop } = useFlyer()
  // THE PILE THAT HAS NOT ARRIVED YET, by index. A split is a FLIP: the new pile
  // is mounted at its own place and only then animated FROM the rect its source
  // had. The board paints between those two, and the pile is seen standing where
  // it has not flown to yet — a blink at the very spot it is about to arrive at.
  // So it is born invisible and shown in the same breath the flight starts.
  const [splitting, setSplitting] = useState<number | null>(null)
  // WHERE THE DISCARD IS while it leaves for a pile. 'gathering' — it is still
  // lying there, collecting itself into one straight stack. 'taken' — a carrier
  // holds it and it is gone from its own spot: the scene empties the heap in the
  // very moment it raises that carrier, or the pile that just flew away is still
  // drawn sitting where it was.
  const [discardOut, setDiscardOut] = useState<'gathering' | 'taken' | null>(null)
  const latest = useRef({ anchors })
  latest.current = { anchors }

  // The discard becomes a pile: it gathers where it lies, flies to the pile's
  // spot face up, and turns over on landing. `deckReshuffled` and Git Branch's
  // Sudo step are the same movement — one shuffles and the other does not, and
  // neither is visible from outside.
  const discardOntoPile = useCallback(
    async (ctx: BeatRun, pile: number, top: CardData | undefined, reveal?: () => void) => {
      const a = latest.current.anchors
      const fromCell = rectOf(a.discardBox.current)
      const toCell = rectOf(a.pileBox(pile))
      // No top card means an empty discard: nothing to carry, and nothing this
      // beat may invent a face for.
      if (!fromCell || !toCell || !top) return
      const from = cardAreaOf(fromCell)
      // THE HEAP COLLECTS ITSELF FIRST, and its counter goes with the collecting.
      // What travels afterwards is one card, and that card only reads as the
      // whole discard because the whole discard was just seen becoming one
      // stack. Raised after the gathering rather than before it: the flyer
      // stands on the top card, and until the stack is straight the top card is
      // lying at its own scattered angle.
      setDiscardOut('gathering')
      await wait(GATHER_MS)
      const [el] = await raise([{ key: 'pile', card: top, at: from }])
      // GONE FROM THE PROJECTION, not only from the render — in the same commit
      // the carrier takes it. `discardOut` is this beat's own state and dies
      // with it; what the beat PUBLISHES is the board it hands over to (see
      // `useBeats`), and the beat behind it reads that heap. Git Branch + Sudo
      // is where the two came apart: the operation's own exit runs next, found
      // the discard still standing in the base it was handed, and the centre's
      // cards flew towards a heap that had already left to become a pile.
      setDiscardOut('taken')
      emptyDiscard(ctx)
      if (el) {
        const anim = play('gatherToDeck', el, { from, to: cardAreaOf(toCell), duration: 560 })
        if (anim) await anim.finished
      }
      await wait(STEP_HOLD)
      patch('pile', { faceDown: true })
      await wait(TURN_MS)
      // the pile underneath becomes visible in the same commit the carrier goes
      // down in — neither a frame with both of them nor one with neither
      reveal?.()
      drop('pile')
      setDiscardOut(null)
    },
    [raise, patch, drop],
  )

  const runReshuffle = useCallback(
    async (_plan: Extract<BeatPlan, { kind: 'reshuffle' }>, ctx: BeatRun) => {
      // Wait for the shadow before measuring anything — the same order, and for
      // the same reason, as `step()` below spells out at length. At entry the
      // board is still the one the batch produced: the discard already emptied,
      // the row already the single recycled pile. Both rects this flight is
      // built from would be read off that board rather than off the one the
      // beat animates away from.
      await nextFrames()
      // The recycled discard always lands on pile 0: `refillFromDiscard` runs
      // only when every pile is empty and replaces `main` with a single one.
      // The card that carries the flight is the discard's own top, from the
      // projection the board is still showing — never a chosen one.
      await discardOntoPile(ctx, 0, ctx.base.decks.discard ?? undefined)
    },
    [discardOntoPile],
  )

  const step = useCallback(
    async (s: PileStep, ctx: BeatRun) => {
      // WAIT FOR THE SHADOW, THEN MEASURE. The queue starts a beat from inside a
      // layout effect, so at entry the DOM still holds the projection the BATCH
      // produced, and the shadow that puts the pre-batch row back is a commit
      // away. For a row of piles that is not a wrong rect but a missing one: on
      // Git Merge the row has already collapsed to the survivor, every absorbed
      // pile has unmounted, and `bindPile(i, null)` has dropped it from the
      // registry — so `pileBox(i)` answers null for each of them, not one flight
      // is built, and the merge plays NOTHING while the counts snap over. Two
      // frames is how we get to the other side of that commit (I2), exactly as
      // the discard beat does.
      //
      // Per STEP, not once per run: `advance()` publishes mid-run, so the second
      // step of a Git Branch + Sudo batch faces the same one-commit lag against
      // the row the first step has just grown. A single wait at the top of
      // `runPiles` would make only the first step honest and leave every one
      // after it measuring a board that has not caught up yet. A step that
      // measures for itself never has to know what the step before it waited
      // for.
      await nextFrames()
      const a = latest.current.anchors
      if (s.kind === 'merge') {
        const to = rectOf(a.pileBox(0))
        const flights: Promise<unknown>[] = []
        if (to) {
          // Every pile but the survivor, and each from its OWN rect. The target
          // is measured once — only the sources differ.
          for (let i = 1; i < ctx.base.decks.main.length; i++) {
            const el = a.pileBox(i)
            if (!el) continue
            const anim = play('absorbToDeck', el, {
              from: rectOf(el),
              to,
              duration: PILE_MERGE_MS,
            })
            if (anim) flights.push(anim.finished)
          }
          if (s.withDiscard) {
            const heap = a.discardBox.current
            if (heap) {
              const anim = play('absorbToDeck', heap, {
                from: rectOf(heap),
                to,
                duration: PILE_MERGE_MS,
              })
              if (anim) flights.push(anim.finished)
            }
          }
        }
        await Promise.all(flights)
        advance(ctx, s.piles)
        return
      }

      if (s.kind === 'split') {
        // FLIP: the half is already in its new DOM place and is animated FROM
        // the rect its source pile had. So the source is measured BEFORE the
        // publish that remounts the row (I1), and the flight after it. "Before
        // the publish" is only half of it, though — the wait above is the other
        // half: without it this reads pile `at` already narrowed by the row the
        // batch left (`pileWidthFor` gives 120 at two piles where the pile being
        // split had 150), and the half would fly out of a rect the pile never
        // had.
        const from = rectOf(a.pileBox(s.at))
        // Named before the publish, so the pile is invisible from the very
        // commit that mounts it — see `splitting` above for what that is for.
        setSplitting(s.at + 1)
        advance(ctx, s.piles)
        await nextFrames()
        const el = a.pileBox(s.at + 1)
        if (el && from) {
          // shown and moved together: the first frame anyone sees of this pile
          // is already one of the flight
          const anim = play('flyFrom', el, { from, duration: PILE_SPLIT_MS })
          setSplitting(null)
          if (anim) await anim.finished
        } else {
          setSplitting(null)
        }
        return
      }

      // fromDiscard — the discard becomes a further pile at the end of the row.
      // It has to exist before anything can land on it, so it is published first
      // and flown into second. The top card is read BEFORE the publish: the
      // projection this beat animates away from is the one that still has a
      // discard to carry.
      const top = ctx.base.decks.discard ?? undefined
      // …and it is not SEEN before anything lands on it. The pile is published
      // first because the flight needs something to aim at, but an empty deck
      // standing there ahead of the discard that becomes it is the same blink
      // the split had: the place is real, the pile is not there yet.
      setSplitting(s.at)
      advance(ctx, s.piles)
      await nextFrames()
      await discardOntoPile(ctx, s.at, top, () => setSplitting(null))
    },
    [discardOntoPile],
  )

  const runPiles = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'piles' }>, ctx: BeatRun) => {
      // Git Branch + Sudo emits TWO changes in one batch — a split, and the
      // discard becoming a further pile. They are ONE event at the table, so
      // they play together: the deck divides while the discard is already on its
      // way to the place the division opens (owner, 18.09). Run one after the
      // other, the discard set off only once the halves had finished parting,
      // and the card read as two separate things happening.
      //
      // The steps still publish in order, and each still measures for itself
      // (see `step`): what runs in parallel is the MOTION, not the bookkeeping —
      // the split publishes its row before the discard's own step asks for the
      // pile it lands on.
      const split = plan.steps.find((s) => s.kind === 'split')
      const rest = plan.steps.filter((s) => s !== split)
      if (split && rest.length > 0) {
        const first = step(split, ctx)
        await nextFrames()
        await Promise.all([first, ...rest.map((s) => step(s, ctx))])
        return
      }
      for (const s of plan.steps) {
        await step(s, ctx)
        await wait(STEP_HOLD)
      }
    },
    [step],
  )

  // A new match cancels what is in the air: the only carrier this beat ever
  // raises is the one flyer `discardOntoPile` puts up (the gathered discard, or
  // the recycled pile), so dropping it is the whole of it.
  const reset = useCallback(() => drop(), [drop])

  return { overlay, runReshuffle, runPiles, reset, splitting, discardOut }
}

// The board with a different row of piles — published to the queue AND written
// back into the run's own base. Both, because Git Branch + Sudo has a SECOND
// step, and it has to run against the table the first one left: publishing
// alone would show the right thing and then classify the next step against a
// row that no longer exists.
function advance(ctx: BeatRun, piles: number[]): void {
  ctx.base = { ...ctx.base, decks: { ...ctx.base.decks, main: piles } }
  ctx.publish(ctx.base)
}

// The discard has left to become a pile — so the board this beat hands on has
// no discard. Written back into the run's own base as well as published, for
// the same reason `advance` does it: the step behind this one has to work
// against the table this one left, and a heap that is still there in the base
// comes back as cards nobody put down.
function emptyDiscard(ctx: BeatRun): void {
  ctx.base = {
    ...ctx.base,
    decks: { ...ctx.base.decks, discard: null, discardHeap: [], discardCount: 0 },
  }
  ctx.publish(ctx.base)
}
