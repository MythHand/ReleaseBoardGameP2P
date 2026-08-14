import type { CardData } from '@release/ui'
import { cardAreaOf } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { nextFrames, play, useFlyer, wait } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors } from '~/entities/game/board'
import type { BeatPlan, PileStep } from './planBeats'

// What happens to the draw piles themselves. Three movements, one scene
// (`DeckAnimationsStory`), and none of them carries a card whose face anybody
// sees: a pile is face down before and after, so what moves is the pile.
//
// The card that CAUSES a split or a merge is Git Branch / Git Merge and belongs
// to #108. This is the movement it will reuse.

const GATHER_MS = 360 // the heap collecting itself into a pile
const TURN_MS = 460 // the gathered pile turning face down on the deck
const SPLIT_MS = 520
const MERGE_MS = 520
const STEP_HOLD = 360 // the standard short beat between deck steps

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDeckBeat(anchors: BoardAnchors) {
  const { overlay, raise, patch, drop } = useFlyer()
  const latest = useRef({ anchors })
  latest.current = { anchors }

  // The discard becomes a pile: it gathers where it lies, flies to the pile's
  // spot face up, and turns over on landing. `deckReshuffled` and Git Branch's
  // Sudo step are the same movement — one shuffles and the other does not, and
  // neither is visible from outside.
  const discardOntoPile = useCallback(
    async (pile: number, top: CardData | undefined) => {
      const a = latest.current.anchors
      const fromCell = rectOf(a.discardBox.current)
      const toCell = rectOf(a.pileBox(pile))
      // No top card means an empty discard: nothing to carry, and nothing this
      // beat may invent a face for.
      if (!fromCell || !toCell || !top) return
      const from = cardAreaOf(fromCell)
      const [el] = await raise([{ key: 'pile', card: top, at: from }])
      await wait(GATHER_MS)
      if (el) {
        const anim = play('gatherToDeck', el, { from, to: cardAreaOf(toCell), duration: 560 })
        if (anim) await anim.finished
      }
      await wait(STEP_HOLD)
      patch('pile', { faceDown: true })
      await wait(TURN_MS)
      drop('pile')
    },
    [raise, patch, drop],
  )

  const runReshuffle = useCallback(
    async (_plan: Extract<BeatPlan, { kind: 'reshuffle' }>, ctx: BeatRun) => {
      // The recycled discard always lands on pile 0: `refillFromDiscard` runs
      // only when every pile is empty and replaces `main` with a single one.
      // The card that carries the flight is the discard's own top, from the
      // projection the board is still showing — never a chosen one.
      await discardOntoPile(0, ctx.base.decks.discard ?? undefined)
    },
    [discardOntoPile],
  )

  const step = useCallback(
    async (s: PileStep, ctx: BeatRun) => {
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
              duration: MERGE_MS,
            })
            if (anim) flights.push(anim.finished)
          }
          if (s.withDiscard) {
            const heap = a.discardBox.current
            if (heap) {
              const anim = play('absorbToDeck', heap, {
                from: rectOf(heap),
                to,
                duration: MERGE_MS,
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
        // publish that remounts the row (I1), and the flight after it.
        const from = rectOf(a.pileBox(s.at))
        advance(ctx, s.piles)
        await nextFrames()
        const el = a.pileBox(s.at + 1)
        if (el && from) {
          const anim = play('flyFrom', el, { from, duration: SPLIT_MS })
          if (anim) await anim.finished
        }
        return
      }

      // fromDiscard — the discard becomes a further pile at the end of the row.
      // It has to exist before anything can land on it, so it is published first
      // and flown into second. The top card is read BEFORE the publish: the
      // projection this beat animates away from is the one that still has a
      // discard to carry.
      const top = ctx.base.decks.discard ?? undefined
      advance(ctx, s.piles)
      await nextFrames()
      await discardOntoPile(s.at, top)
    },
    [discardOntoPile],
  )

  const runPiles = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'piles' }>, ctx: BeatRun) => {
      // Git Branch + Sudo emits TWO changes in one batch — a split, then the
      // discard becoming a further pile. Each runs against the table as the last
      // one left it, which is why `ctx.base` is re-read every time.
      for (const s of plan.steps) {
        await step(s, ctx)
        await wait(STEP_HOLD)
      }
    },
    [step],
  )

  return { overlay, runReshuffle, runPiles }
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
