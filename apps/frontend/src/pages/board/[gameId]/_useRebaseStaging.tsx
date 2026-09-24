import type { Event } from '@release/engine'
import type { CardData, CardPreviewSlotProps, TableActions } from '@release/ui'
import { Card, ConfirmAction, cardAreaOf, cardById, TableSurface, Typography } from '@release/ui'
import { play, useCardReorder } from '@release/ui/animations'
import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import styles from './_useRebaseStaging.module.css'
import { useResolveFeedback } from './_useResolveFeedback'

// Git Rebase — the top of a pile, shown to its owner and to nobody else. The
// privacy is not enforced here: `pendingView` hands every other peer an empty
// `piles`, so there is nothing for this hook to hide. What the table sees is
// the card's own flight to the discard, which the ordinary discard run plays.
//
// Sudo lays one row per pile, sharing a single 1-2-3 numbering across them, as
// the story does — the numbers name positions in a pile, and every pile has the
// same three positions.
//
// The board and playground share the same drag, insertion preview and drop.
//
// THE FLIGHTS (Task D2): ported from the approved playground scene
// (`apps/playground/stories/interactive/GitCards/Rebase.tsx`), values verbatim.
// Two legs travel — out of the pile into the row, and face-down back onto it in
// the order that was chosen.
//
// ONE DIVERGENCE FROM `_useCherryPickStaging`, and it is deliberate: that hook
// dispatches its RESOLVE at once and lets the flight run behind it, because the
// card it picked has somewhere visible to be. Rebase's plan (#108, task D2)
// asks for the opposite — the RESOLVE fires when the last card lands — because
// nothing about a committed reorder is visible in the projection (a deck's
// contents are never projected), so there is no second renderer to race, and
// the flight IS the whole of what the player is told happened. Reduced motion
// still answers at once: a game action must never wait on an animation nobody
// plays.
type Order = Record<number, string[]>

// timings — the approved scene
const DEAL_DUR = 520 // cards fly out of the pile into the row
const DEAL_STEP = 80 // per-card stagger dealing out
const DEAL_HOLD = 200 // settle before the row is interactive
const FLIP_DUR = 420 // = the flipCard preset (flip face-down before flying back)
const FLIP_HOLD = 260 // hold face-down before the flight
const BACK_DUR = 600 // = the returnToDeck flight
const BACK_STEP = 90 // per-card stagger flying back
// the scene's own slack between the last landing and the row going away
// (`Rebase.tsx`: `+ 280` on top of the last flight)
const BACK_SETTLE = 280

interface Box {
  left: number
  top: number
  width: number
  height: number
}

// centre-to-centre translate + scale — the same helper the sibling hook keeps
// privately, copied rather than imported across staging hooks.
function between(from: Box, to: Box): string {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`
}

interface Pile {
  pile: number
  cards: { uid: string; id: string }[]
}

export function useRebaseStaging(args: {
  state: BoardState
  events?: Event[]
  anchors: BoardAnchors
  actions?: TableActions
  copy: { prompt: string; position: string; confirm: string }
  /**
   * READING A CARD IN THE ROW. The cards are laid out to be REORDERED, which
   * means they are looked at first — and in the row they stand at a fraction of
   * their own size, too small to read. The board's own preview is what reads a
   * card standing on the table, so the row takes it rather than growing one:
   * the same reading, at the same place, as everywhere else (owner, 22.09).
   */
  preview: (card?: CardData | null, faceDown?: boolean) => CardPreviewSlotProps
  enabled: boolean
  suspended?: boolean
}): { row: ReactNode | null } {
  const { state, anchors, actions, copy, preview, enabled, suspended = false } = args
  const reduced = useReducedMotion()
  const pending = state.pending
  const ours =
    enabled &&
    pending?.kind === 'reorderTop' &&
    pending.player === state.selfId &&
    pending.piles.length > 0
      ? pending
      : null

  const [order, setOrder] = useState<Order>({})
  const [confirmed, setConfirmed] = useState(false)
  // true from confirm through the last flight landing — keeps the cards (now
  // pinned and animating) mounted after `confirmed`, the same way the sibling
  // hook's own `flying` outlives its dispatch.
  const [flying, setFlying] = useState(false)
  const [faceDown, setFaceDown] = useState(false)
  const [ready, setReady] = useState(reduced)
  // Answered — from the click through the last landing. `confirmed` alone is not
  // that span: an accepted answer clears the pending, and the reseeding effect
  // drops `confirmed` while the cards are still on their way home, which would
  // put the dimming and the confirm bar back up over a finished reorder.
  const answered = confirmed || flying

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // The last offer this hook actually saw, read during render — the flight
  // keeps drawing the row from its own snapshot once `ours` goes null.
  const pilesRef = useRef<Pile[]>([])
  if (ours) pilesRef.current = ours.piles
  const piles: Pile[] = ours ? ours.piles : pilesRef.current

  // WHICH OCCASION THIS IS, not what is in it. A card of the same kind may be
  // played any number of times, so the same player can be offered the same
  // piles in the same order twice in one match — and keyed by its CONTENTS the
  // second offer is byte for byte the first, which this hook has already marked
  // answered. It refused to deal the row, and Rebase simply could not be played
  // a second time (#168). The engine now says when a decision was raised, so the
  // key says which offer this is and the contents say nothing about identity.
  const offerKey = ours ? `${ours.player}:${ours.raisedAt}` : null
  const reorder = useCardReorder({
    enabled: Boolean(ours) && ready && !answered && !suspended,
    step: 180,
    rows: piles.map((entry) => ({
      id: entry.pile,
      cards: order[entry.pile] ?? entry.cards.map((c) => c.uid),
    })),
    onReorder: (pile, cards) => setOrder((current) => ({ ...current, [pile]: cards })),
  })

  const dealtKey = useRef<string | null>(null)
  // The offer we have already answered. The queue drops its shadow only when it
  // drains, so between the answer and the end of the operation card's own exit
  // the board goes back to drawing the projection that beat moves away from —
  // the one where this pending is still OPEN. Without this latch the row takes
  // that as a fresh offer: it deals the cards out of the pile a second time and
  // reads as the card being played again. `_useCherryPickStaging` carries the
  // same latch for the same board behaviour. Cleared only by a refusal, because
  // only then is the choice really open again.
  const answeredKey = useRef<string | null>(null)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }
  // No timer survives the hook.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once by design — `clearTimers` is a plain function recreated every render, so listing it would clear timers on every render instead of only on unmount
  useLayoutEffect(() => clearTimers, [])

  // Seeded from the offer, and re-seeded when a different pending opens. Keyed
  // on the pending rather than the mount, because a latch that outlives what it latches is a bug. `flying` is left
  // alone on purpose — it clears when its own flight lands, and a projection
  // tick clearing the pending mid-flight must not cut it short.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed only for a different offer, not a fresh projection object
  useEffect(() => {
    if (!ours) {
      setOrder({})
      setConfirmed(false)
      return
    }
    setOrder(Object.fromEntries(ours.piles.map((e) => [e.pile, e.cards.map((c) => c.uid)])))
  }, [offerKey])

  // Deal the offer OUT of its pile into the row: every card starts at the
  // pile's own rect and flies to its slot, staggered. Cosmetic only — the row
  // is answerable throughout, so this never gates a click.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once per episode (guarded by `dealtKey`), not on every render `ours` produces a new identity for
  useLayoutEffect(() => {
    if (!ours) {
      dealtKey.current = null
      return
    }
    const key = offerKey
    if (dealtKey.current === key || answeredKey.current === key) return
    dealtKey.current = key
    setReady(reduced)
    if (reduced) return
    later(
      () => setReady(true),
      DEAL_DUR +
        Math.max(...ours.piles.map((entry) => entry.cards.length - 1)) * DEAL_STEP +
        DEAL_HOLD,
    )
    for (const entry of ours.piles) {
      const cell = anchors.pileBox(entry.pile)?.getBoundingClientRect()
      if (!cell) continue
      // I6: a pile cell carries its label under the card, so both legs aim at
      // the card box inside it — the scene's own `cardAreaOf(deckEl.rect)`, and
      // what every other flight on this board already does (`defenseBeat`,
      // `deckBeat`). Aimed at the whole cell, a card lands low, over the label.
      const pileRect = cardAreaOf(cell)
      const els = entry.cards.map((c) => cardRefs.current.get(c.uid))
      const rests = els.map((el) => el?.style.transform ?? '')
      for (const el of els) {
        if (!el) continue
        el.style.transition = 'none'
        el.style.transform = `${el.style.transform} ${between(el.getBoundingClientRect(), pileRect)}`
        el.style.opacity = '0'
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          els.forEach((el, i) => {
            if (!el) return
            const delay = i * DEAL_STEP
            el.style.transition = `transform ${DEAL_DUR}ms var(--ease-out) ${delay}ms, opacity ${DEAL_DUR}ms ${delay}ms`
            el.style.transform = rests[i]
            el.style.opacity = ''
          })
          later(
            () => {
              for (const el of els) {
                if (!el) continue
                el.style.transition = ''
              }
            },
            DEAL_DUR + entry.cards.length * DEAL_STEP + DEAL_HOLD,
          )
        }),
      )
    }
  }, [ours, reduced, anchors])

  const resolve = useResolveFeedback(args.events ?? [], state.selfId, actions, () => {
    // refused: this offer is open again, whatever we flew for it
    answeredKey.current = null
    setConfirmed(false)
    setFlying(false)
    setFaceDown(false)
    setReady(true)
    clearTimers()
    for (const el of cardRefs.current.values()) {
      for (const animation of el.getAnimations?.() ?? []) animation.cancel()
      // A refusal can arrive at a card that is already pinned over the pile.
      // Clearing the pin alone hands it back to `.slot`'s own 300ms transform
      // transition, and it GLIDES all the way from the pile back to its slot —
      // the row visibly pulling its cards out to the centre a second time.
      // Suppress the transition across the switch, reflow, then hand it back:
      // the scene's own move when it releases a dealt card back into the row.
      el.style.cssText = 'transition: none'
      void el.offsetWidth
      el.style.transition = ''
    }
    setOrder(
      Object.fromEntries((ours?.piles ?? []).map((e) => [e.pile, e.cards.map((c) => c.uid)])),
    )
  })

  if (!flying && (!ours || confirmed || (ours != null && answeredKey.current === offerKey)))
    return { row: null }

  const confirm = () => {
    if (!ours || confirmed || !ready || reorder.drag || suspended) return
    // Answered from this click on: the row never reopens for this offer, and the
    // deal never replays it, whichever projection the queue hands over next.
    answeredKey.current = offerKey
    // Committed against THIS render's offer: every offered pile, answered
    // exactly once, or the engine rejects it.
    const committed = ours.piles.map((e) => ({
      pile: e.pile,
      cards: order[e.pile] ?? e.cards.map((c) => c.uid),
    }))
    const choice = { kind: 'reorderTop' as const, order: committed }

    // A game action must never wait on an animation nobody plays. The engine gets its answer either way;
    // only the moment differs.
    if (reduced) {
      setConfirmed(true)
      resolve(choice)
      return
    }

    setConfirmed(true)
    setFlying(true)
    // The order stays secret, so the cards turn their backs before they travel.
    setFaceDown(true)

    later(() => {
      let last = 0
      for (const entry of committed) {
        const cell = anchors.pileBox(entry.pile)?.getBoundingClientRect()
        const pileRect = cell ? cardAreaOf(cell) : null
        entry.cards.forEach((uid, i) => {
          const el = cardRefs.current.get(uid)
          if (!el) return
          const r = el.getBoundingClientRect()
          el.style.transition = 'none'
          el.style.transform = 'none'
          el.style.position = 'fixed'
          el.style.left = `${r.left}px`
          el.style.top = `${r.top}px`
          el.style.inlineSize = `${r.width}px`
          el.style.margin = '0'
          // position 1 lands on top of the pile
          el.style.zIndex = `${50 + (entry.cards.length - i)}`
          const delay = i * BACK_STEP
          last = Math.max(last, delay)
          if (!pileRect) return
          later(
            () => play('returnToDeck', el, { from: r, to: pileRect, duration: BACK_DUR }),
            delay,
          )
        })
      }
      // The answer goes when the last card is home — see the divergence note
      // in this file's header for why this one waits and Cherry-pick's does not.
      later(() => resolve(choice), last + BACK_DUR)
      // The row itself goes a beat later, the scene's own slack: taking it away
      // on the very frame the last card lands cuts the arrival off mid-motion.
      later(
        () => {
          setFlying(false)
          setFaceDown(false)
        },
        last + BACK_DUR + BACK_SETTLE,
      )
    }, FLIP_DUR + FLIP_HOLD)
  }

  return {
    // The table goes under the reorder while it is being read and answered, and
    // comes back the moment it IS answered — ahead of the cards, so they fly
    // home over a normal table and land in it (owner, 17.09). Heavier than the
    // default: here the reorder is the only thing to read and the draw piles go
    // under it too.
    row: (
      <TableSurface
        committed={answered}
        dim="heavy"
        suspended={suspended}
        testId="board-rebase-overlay"
        blockTestId="board-rebase-scrim"
      >
        <div className={styles.rows} data-testid="board-rebase-row">
          {piles.map((entry) => (
            <div
              key={entry.pile}
              className={styles.row}
              style={{ inlineSize: entry.cards.length * 180 - 30 }}
            >
              {entry.cards.map((c, i) => (
                <Typography
                  key={c.uid}
                  variant="tag"
                  className={`${styles.position} ${answered ? styles.chromeOut : styles.chromeIn}`}
                  style={{ insetInlineStart: i * 180 }}
                >
                  {i + 1}
                </Typography>
              ))}
              {(order[entry.pile] ?? entry.cards.map((c) => c.uid)).map((uid, i) => {
                const offered = entry.cards.find((c) => c.uid === uid)
                const data = offered ? cardById(offered.id) : null
                if (!data) return null
                const position = reorder.position(entry.pile, uid, i)
                return (
                  <div
                    key={uid}
                    className={`${styles.slot} ${position.dragging ? styles.dragging : ''}`}
                    data-testid={`rebase-card-${uid}`}
                    style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                    onPointerDown={(e) => reorder.onPointerDown(entry.pile, uid, e)}
                    {...preview(data)}
                    ref={(el) => {
                      if (el) cardRefs.current.set(uid, el)
                      else cardRefs.current.delete(uid)
                    }}
                  >
                    <Card card={data} interactive={false} width="100%" faceDown={faceDown} />
                    {!answered && (
                      <button
                        type="button"
                        data-testid={`rebase-move-${uid}`}
                        className={styles.move}
                        aria-label={`${copy.position} ${i + 1}`}
                        disabled={!ready}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <ConfirmAction
          open={!answered && ready && !suspended}
          label={copy.confirm}
          caption={copy.prompt}
          onConfirm={confirm}
        />
      </TableSurface>
    ),
  }
}
