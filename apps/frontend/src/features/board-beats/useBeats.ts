import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { scatterAt, useDiscardExit } from '@release/ui/animations'
import type { ReactNode } from 'react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { BoardAnchors, BoardState, IntroBeat } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import type { BeatPlan, DiscardCard } from './planBeats'
import { planBeats } from './planBeats'

// The board's beat queue. `useGame` accumulates engine events off the wire in
// BATCHES — a peer can receive several moves in one sync — so a board that
// animated on render would either play them on top of each other or drop all
// but the last. One beat runs at a time; the board renders a SHADOW while it
// does, and the shadow is the projection the beat is animating away from.
//
// Two properties are the whole point, and both are structural rather than
// promised:
//
//   • The last frame of a beat IS the projection it hands over to. A card flies
//     on scatterAt(eventId) and the heap rests it on scatterAt(eventId) — one
//     value, two readers (I7) — so the handover changes nothing on screen.
//   • The board can never be stranded behind the projection. The shadow's whole
//     lifetime is the queue's: when the queue drains it is dropped and live
//     wins, whatever happened inside a beat. There is no path where a thrown
//     run, a missing rect or a bad plan leaves an old state on the table.
//
// One policy, one place: prefers-reduced-motion is read HERE. `play()` in
// @release/ui drives WAAPI directly and does not check it, so every consumer
// would otherwise have to remember — which is precisely the kind of thing that
// gets remembered nine times out of ten.

interface Beat {
  key: string
  /** the projection this beat animates AWAY from — the board while it runs */
  base: BoardState
  /** it owns the table: input is dead while it runs */
  exclusive: boolean
  run: () => Promise<void>
}

export interface Beats {
  shadow: BoardState | null
  overlays: ReactNode[]
  exclusive: boolean
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useBeats(args: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
  enabled: boolean
  intro?: IntroBeat | null
}): Beats {
  const { live, events, anchors, enabled, intro } = args
  const reduced = useReducedMotion()
  const [running, setRunning] = useState<Beat | null>(null)
  // The same answer as `running`, but ahead of it: `drain()` sets this
  // synchronously, inside the very effect pass that queued the beat, while
  // `running` only says so once React has committed. So the effect GUARDS on
  // the ref — no pass can queue against a state nobody has seen yet, not even a
  // re-invoked one — and DEPENDS on `running`, which is what re-arms it when the
  // queue drains. Two readers of one fact, each for what it is good at.
  const runningRef = useRef<Beat | null>(null)

  // No onLanded: the heap is derived from these same events in toBoardState, so
  // the cards this step flew are already in the projection it hands over to. A
  // second set of books here would be a second source for one heap.
  const { overlay, send } = useDiscardExit(anchors.discardBox)

  const latest = useRef({ live, anchors, send })
  latest.current = { live, anchors, send }

  // How far into the feed the queue has already looked. Event ids are the
  // engine's own monotonic sequence, so this is a watermark and not a count —
  // a batch that arrives while a beat runs is picked up on the next pass.
  const seen = useRef(0)
  const queue = useRef<Beat[]>([])
  const draining = useRef(false)

  const whereFrom = useCallback((c: DiscardCard): Rect | null => {
    const a = latest.current.anchors
    if (c.source.kind === 'hand') return rectOf(a.handSlotAt(c.source.index))
    if (c.source.kind === 'release') return rectOf(a.releaseSlot(c.source.player, c.source.slot))
    return a.seatBox(c.source.player)
  }, [])

  const toLeaving = useCallback(
    (c: DiscardCard): Leaving | null => {
      const card = cardById(c.card)
      const from = whereFrom(c)
      if (!card || !from) return null
      // The SAME Scatter the adapter rests this card on (I7): the flight ends
      // on the pose the heap already holds for it, so nothing moves on handover.
      // Same key, same call — `scatterAt` takes the event id as a number.
      return { key: c.key, card, from, scatter: scatterAt(c.eventId) }
    },
    [whereFrom],
  )

  const beatOf = useCallback(
    (plan: BeatPlan, base: BoardState): Beat => ({
      key: plan.key,
      base,
      exclusive: false,
      run: async () => {
        // Measured now, against the shadow that is on screen — not at plan time.
        const items = plan.cards.map(toLeaving).filter((it): it is Leaving => it != null)
        if (items.length > 0) await latest.current.send(items)
      },
    }),
    [toLeaving],
  )

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    try {
      let next = queue.current.shift()
      while (next) {
        runningRef.current = next
        setRunning(next)
        // A beat that throws must not hold the board: the shadow is dropped in
        // the finally below regardless, so a failure costs the animation and
        // never the state.
        try {
          await next.run()
        } catch (err) {
          if (import.meta.env.DEV) console.error('[beats] %s failed', next.key, err)
        }
        next = queue.current.shift()
      }
    } finally {
      draining.current = false
      runningRef.current = null
      setRunning(null)
    }
  }, [])

  // Beat zero, queued once. Keyed by the intro's own key so a re-render with a
  // fresh object cannot re-arm it, and React 19 StrictMode's double invoke plays
  // it once — the same guarantee the intro used to keep for itself with
  // `armedFor`, now kept here because the queue is what starts it.
  const armed = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!intro || armed.current === intro.key) return
    armed.current = intro.key
    // Reduced motion collapses the opening exactly as it collapses every other
    // beat — `run` is never called. But the opening still has to REPORT, or the
    // host's start gate never opens and the match never begins, so this is the
    // one beat the queue tells explicitly to jump to its end state.
    if (reduced) {
      intro.collapse()
      return
    }
    queue.current.unshift({
      key: intro.key,
      // A placeholder: while an exclusive beat runs the board renders the
      // intro's OWN published shadow, not this. It is here because a Beat has a
      // base and this one animates away from the projection at large.
      base: latest.current.live,
      exclusive: true,
      run: intro.run,
    })
    void drain()
  }, [intro, reduced, drain])

  // The last projection the board actually SHOWED. Not `live`: by the time this
  // effect runs, `live` is already the projection the arriving batch produced —
  // the card is out of the hand and counted in the discard. The slot it has to
  // fly from is on the previous one, which is what is still on screen (I1).
  const settled = useRef(live)

  // `running` is a dependency although the body reads the ref instead: it is
  // what re-arms this effect the moment the queue drains, so a batch that
  // arrived mid-beat is picked up on the next pass. That deferral is what makes
  // this a queue rather than a one-slot buffer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `running` re-arms the effect on drain; the body reads `runningRef` because it must also see a beat this same pass started
  useLayoutEffect(() => {
    // A beat is up: the board is its shadow, and a batch arriving now waits its
    // turn rather than being planned against a state nobody can see.
    if (runningRef.current) return
    const before = settled.current
    settled.current = live
    if (!enabled) {
      // Nothing to animate into: keep the watermark level with the feed so a
      // board that becomes enabled later does not replay everything at once.
      seen.current = events.at(-1)?.id ?? seen.current
      return
    }
    const fresh = events.filter((e) => e.id > seen.current)
    if (fresh.length === 0) return
    seen.current = fresh.at(-1)?.id ?? seen.current
    // Reduced motion collapses every beat to its end state, and the end state is
    // the projection the board already holds — so there is nothing to do but
    // let it render. Planned nowhere, run nowhere: one branch, one place.
    if (reduced) return
    for (const plan of planBeats(fresh, before)) queue.current.push(beatOf(plan, before))
    void drain()
  }, [events, live, enabled, reduced, beatOf, drain, running])

  return {
    // The shadow is the running beat's own base, and nothing else holds it up.
    // The one exception is the opening, which publishes a whole shape of its own
    // rather than animating away from a projection — while it runs, that shape
    // IS the board. It goes null the moment the opening reports done, so the
    // handover to the live projection is the intro's own last frame.
    shadow: (running?.exclusive ? intro?.shadow : running?.base) ?? null,
    overlays: overlay,
    exclusive: running?.exclusive ?? false,
  }
}
