// The staging → beat handoff's own shadow-gating invariant (#100, Task 11
// review round 1, Important #3 — writing this test surfaced a REAL, already-
// existing race, not just a future-edit risk; both the race and the fix are
// documented here and in comboBeat.tsx's own header on `runAttack`).
//
// The batch that carries an `attacked`/`released` event updates `live` in the
// SAME prop change (useBeats.ts's own "I1" note: "by the time the batch
// effect runs, `live` is already the projection the arriving batch
// produced"). On the very FIRST render of that update, `useBeats`'s `running`
// state does not exist yet — it is only set by an EFFECT that runs after this
// render commits — so `beats.shadow` is still null and `state = beats.shadow
// ?? live` briefly reads as `live`: the card ALREADY out of the hand.
// `_useBoardStaging.ts`'s own hand-watching effect reacts to exactly that
// (its usual, correct job — "the projection moved our card out of the hand,
// staging's job is done") and clears `staged`, believing the play was simply
// accepted. That effect is a passive `useEffect`, so it can only fire once
// this render's synchronous work is done — but `useBeats`'s OWN watching
// effect is a `useLayoutEffect`, and IT starts the beat SYNCHRONOUSLY, within
// that same window, before any passive effect gets a turn. So reading the
// handoff at the TOP of `runAttack`/`runRelease` — before their first `await`
// — wins the race: the value is captured before the passive effect ever runs.
// Reading it one line later (after `await nextFrames()`, as both runners
// originally did) loses it: the passive effect fires in between, clears
// `staged`, and this beat's own handoff-building effect (`_Board.tsx`, and
// this harness) follows suit — so the beat reads a NULL handoff, falls to the
// "everyone else" branch, and folds the actor's own play in a second time
// from a hand slot it already left.
//
// This drives the real seam: the actual `useBoardStaging` + `useBeats` (+ the
// real `useComboBeat` underneath), wired the same way `_Board.tsx` wires them
// — a `handoffRef` kept current in a layout effect off `staging.staged`. It is
// NOT a mount of `_Board.tsx` itself: that component's `intro`/deal-intro
// machinery has its own gating (`beats.enabled` depends on the deal reporting
// done), which is orthogonal to this seam and would need a full synthetic
// dealt game to drive through. This harness reproduces only the load-bearing
// wiring — the same effect body as `_Board.tsx`'s own — so a future change to
// THAT effect must be mirrored here too.

import type { Event, PlayerId } from '@release/engine'
import type { CardData, TableTarget } from '@release/ui'
import { cardById } from '@release/ui'
import { act, render } from '@testing-library/react'
import { useLayoutEffect, useRef } from 'react'
import { expect, it, vi } from 'vitest'
import type { BoardState, StagedHandoff } from '~/entities/game/board'
import { useBoardAnchors } from '~/entities/game/board'
import { useBeats } from '~/features/board-beats'
import { useBoardStaging } from '../_useBoardStaging'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => false }))

const played = vi.hoisted(() => ({ names: [] as string[] }))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    play: (name: string, el: Element, params?: Record<string, unknown>) => {
      played.names.push(name)
      return real.play(name, el, params)
    },
  }
})

const card = (id: string) => cardById(id) as CardData

const before: BoardState = {
  you: { name: 'You', hand: [{ uid: 'u-atk', card: card('attack-bug') }], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0, discardHeap: [] },
  turn: 'p1' as PlayerId,
  hasDrawn: true,
  selfId: 'p1',
  history: [],
  setup: {},
  playable: ['u-atk'],
  frozen: [],
  targets: { 'u-atk': [{ kind: 'player', player: 'p2' }] },
} as unknown as BoardState

const attackedEvent: Event = {
  id: 1,
  type: 'attacked',
  attacker: 'p1',
  card: 'attack-bug',
  sudo: false,
  target: 'p2',
}

// The projection once the attack lands: the card is out of the local hand,
// its target is gone, and the opponent owes a defence.
const after: BoardState = {
  ...before,
  you: { ...before.you, hand: [] },
  targets: {},
  pending: {
    kind: 'defend',
    player: 'p2',
    attacker: 'p1',
    attackCard: 'attack-bug',
    sudo: false,
    options: [],
    openedAt: 0,
    deadline: 15000,
    scope: 'hand',
  },
} as unknown as BoardState

const api: {
  staging?: ReturnType<typeof useBoardStaging>
  handoffRef?: React.RefObject<StagedHandoff | null>
} = {}

// The load-bearing subset of `_Board.tsx`'s own wiring: `useBeats` gets the
// handoff ref; `useBoardStaging` gets `beats.shadow ?? live` (never `live`
// directly — that is I1, and also what makes THIS seam observable at all);
// the ref is kept current in a layout effect off `staging.staged`, mirroring
// `_Board.tsx`'s own body exactly.
function Harness({ live, events }: { live: BoardState; events: Event[] }) {
  const anchors = useBoardAnchors()
  const handoffRef = useRef<StagedHandoff | null>(null)
  const soloStagedRef = useRef<HTMLDivElement>(null)
  api.handoffRef = handoffRef

  const beats = useBeats({ live, events, anchors, enabled: true, staging: handoffRef })
  const state = beats.shadow ?? live

  const staging = useBoardStaging({ state, anchors, actions: {}, events, enabled: true })
  api.staging = staging

  useLayoutEffect(() => {
    const s = staging.staged
    handoffRef.current =
      s?.phase === 'dispatched' && s.main
        ? {
            mainUid: s.main.uid,
            supportUid: s.support?.uid,
            el: s.merged ? staging.pairRef.current : soloStagedRef.current,
            release: staging.release,
          }
        : null
  }, [staging.staged, staging.pairRef, staging.release])

  const soloStaged =
    staging.staged && !staging.staged.merged
      ? (staging.staged.support ?? staging.staged.main)
      : null

  return (
    <div>
      <div ref={anchors.hand}>
        {state.you.hand.map((c) => (
          <div key={c.uid} data-hand-slot />
        ))}
      </div>
      <div ref={anchors.centre} data-board-centre>
        {soloStaged && staging.overlay.length === 0 && (
          <div ref={soloStagedRef} data-testid="solo-staged" />
        )}
        {!staging.staged && state.pending?.kind === 'defend' && (
          <div data-pending-play data-testid="pending" />
        )}
      </div>
      <div ref={anchors.discardBox} />
      <div ref={staging.pairRef} data-testid="pair-flyer" />
      {staging.overlay}
      {beats.overlays}
    </div>
  )
}

// `deckBeat.test.tsx`/`comboBeat.test.tsx`'s own `drive`, with one addition:
// `run` (the prop update that arms the beat) has to happen AFTER fake timers
// are already active, not before — `runAttack`'s `nextFrames()` calls
// `requestAnimationFrame` the instant the beat starts, and a real (unfaked)
// rAF registered before `vi.useFakeTimers()` runs on a clock
// `advanceTimersByTimeAsync` never touches, so the beat would hang forever.
async function drive(run: () => void) {
  vi.useFakeTimers()
  try {
    run()
    for (let i = 0; i < 30; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })
    }
  } finally {
    vi.useRealTimers()
  }
}

it('hands the table back without re-folding when the local player’s own attack lands', async () => {
  played.names = []
  const { rerender } = render(<Harness live={before} events={[]} />)

  // the real dispatch: pull the attack card, aim it at the opponent
  act(() => {
    api.staging?.onHandPlay('u-atk', { x: 0, y: 0 })
  })
  act(() => {
    api.staging?.onTargetPick({ kind: 'player', player: 'p2' } as TableTarget)
  })
  expect(api.staging?.staged?.phase).toBe('dispatched')
  // the handoff is up: this beat's own play, standing at the centre
  expect(api.handoffRef?.current?.mainUid).toBe('u-atk')

  // the engine answers: the attack landed, the card is out of the hand, a
  // defence is owed. `useBeats` picks up `attackPlaced` from the new event —
  // in the SAME prop update that already moves `live` past the pull (I1).
  await drive(() => rerender(<Harness live={after} events={[attackedEvent]} />))

  // no re-fold: the beat recognised its own staged play and released it
  // instead of flying it in again from the (now-empty) hand slot.
  expect(played.names).not.toContain('foldIntoPair')
  // the handoff and the staged play are both cleared once the beat is done —
  // via `release()`, not via the OTHER (premature) path this test pins shut.
  expect(api.handoffRef?.current).toBeNull()
  expect(api.staging?.staged).toBeNull()
})
