import type { CardData } from '@release/ui'
import { cardById } from '@release/ui'
import type { Leaving } from '@release/ui/animations'
import { scatterAt } from '@release/ui/animations'
import { act, render } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, it, vi } from 'vitest'
import type { BeatRun, BoardAnchors, BoardState, StagedHandoff } from '~/entities/game/board'
import { useComboBeat } from './comboBeat'
import type { BeatPlan } from './planBeats'

const played = vi.hoisted(() => ({ names: [] as string[] }))
// What `useDiscardExit`'s `send` actually received — not just that it was
// called. `useDiscardExit`'s own `send` calls `play` through a SIBLING import
// (apps/ui/src/animations/useDiscardExit.tsx imports `./play` directly, not
// through this barrel), so mocking `play` above never sees it — drawBeat.test.tsx
// and useBeats.test.tsx hit the same wall and stub the whole hook instead of
// the leaf it calls internally; this does the same.
const exits = vi.hoisted(() => ({ items: [] as Leaving[] }))
// `hang`/`release` — the same "park a flight mid-air" convention
// `useBeats.test.tsx` uses for the discard exit: `send()` stores its resolver
// instead of resolving, so a test can hold the pair-out beat in flight and
// choose the moment it lands.
const hang = vi.hoisted(() => ({ on: false, release: null as (() => void) | null }))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  const { useState } = await import('react')
  return {
    ...real,
    play: (name: string) => {
      played.names.push(name)
      return { finished: Promise.resolve() } as unknown as Animation
    },
    // A stateful stand-in, not a fixed `overlay: []`: the reset() test needs
    // to tell "a flyer is mounted" from "reset() cleared it," and a hardcoded
    // empty overlay can't distinguish those.
    useDiscardExit: () => {
      const [flying, setFlying] = useState(false)
      return {
        overlay: flying ? ['flight'] : [],
        send: (items: Leaving[]) => {
          played.names.push('centerToDiscard')
          exits.items.push(...items)
          if (!hang.on) return Promise.resolve()
          setFlying(true)
          return new Promise<void>((r) => {
            hang.release = () => {
              setFlying(false)
              r()
            }
          })
        },
        reset: () => setFlying(false),
        FLIGHT_MS: 420,
      }
    },
  }
})

const card = (id: string) => cardById(id) as CardData

// The local player holds the attack card in hand at index 0 — the slot a
// local click-thrown attack (staged nothing) folds in from.
const base = {
  you: { name: 'You', hand: [{ uid: 'u1', card: card('attack-bug') }], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0, discardHeap: [] },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

const node = () => document.createElement('div')

function harness() {
  const centre = node()
  const handSlot = node()
  const releaseSlot = node()
  const anchors = {
    hand: { current: node() },
    centre: { current: centre },
    stage: { current: node() },
    cost: { current: node() },
    discardBox: { current: node() },
    pileBox: () => null,
    seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }),
    seatOf: () => node(),
    handSlotAt: (i: number) => (i === 0 ? handSlot : null),
    releaseSlot: () => releaseSlot,
    bindPile: () => {},
    bindSeat: () => {},
    bindReleaseSlot: () => {},
  } as unknown as BoardAnchors
  const api: { beat?: ReturnType<typeof useComboBeat> } = {}
  function Probe({ staging }: { staging?: RefObject<StagedHandoff | null> }) {
    api.beat = useComboBeat(anchors, staging)
    return <>{api.beat.overlay}</>
  }
  return { anchors, api, centre, Probe }
}

// `drawBeat.test.tsx`/`deckBeat.test.tsx`'s established pattern: a runner that
// spans real `nextFrames()`/`wait()` delays needs its intermediate DOM observed
// step by step, because React defers every update queued inside a single async
// `act()` scope until that scope's own promise settles.
async function drive(run: () => Promise<void> | undefined) {
  vi.useFakeTimers()
  try {
    let done = false
    const finished = Promise.resolve(run()).then(() => {
      done = true
    })
    while (!done) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })
    }
    await finished
  } finally {
    vi.useRealTimers()
  }
}

const ctx: BeatRun = { base, publish: () => {} }

// ===== attackPlaced =====

// The mutation-check: delete the handoff branch (or its guard) and the beat
// would fold the card in from the hand slot instead of just handing the table
// back — which is exactly what the `not.toContain('foldIntoPair')` below
// would catch.
it('hands the table back without folding when the actor’s own staged play arrives', async () => {
  played.names = []
  const { api, Probe } = harness()
  const release = vi.fn()
  const staging = { current: { mainUid: 'u1', el: node(), release } as StagedHandoff }
  render(<Probe staging={staging} />)
  const plan: Extract<BeatPlan, { kind: 'attackPlaced' }> = {
    kind: 'attackPlaced',
    key: 'attack:5',
    eventId: 5,
    attacker: 'p1',
    card: 'attack-bug',
    sudo: false,
  }
  await drive(() => api.beat?.runAttack(plan, ctx))
  expect(release).toHaveBeenCalledTimes(1)
  expect(played.names).not.toContain('foldIntoPair')
})

it('folds an opponent’s attack in from their seat', async () => {
  played.names = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'attackPlaced' }> = {
    kind: 'attackPlaced',
    key: 'attack:5',
    eventId: 5,
    attacker: 'p2',
    card: 'attack-bug',
    sudo: false,
  }
  await drive(() => api.beat?.runAttack(plan, ctx))
  expect(played.names).toEqual(['foldIntoPair'])
})

it('folds both halves of a sudo pair in from the attacker’s seat', async () => {
  played.names = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'attackPlaced' }> = {
    kind: 'attackPlaced',
    key: 'attack:5',
    eventId: 5,
    attacker: 'p2',
    card: 'attack-bug',
    sudo: true,
  }
  await drive(() => api.beat?.runAttack(plan, ctx))
  expect(played.names.filter((n) => n === 'foldIntoPair')).toHaveLength(2)
})

// A window attack thrown by a plain click never touches `_useBoardStaging.ts`
// at all — the handoff stays null, and the card is still findable by id in
// the local hand, same as `sourceOf` does for a discard.
it('folds the local player’s own click-thrown attack in from its hand slot when nothing was staged', async () => {
  played.names = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'attackPlaced' }> = {
    kind: 'attackPlaced',
    key: 'attack:5',
    eventId: 5,
    attacker: 'p1',
    card: 'attack-bug',
    sudo: false,
  }
  await drive(() => api.beat?.runAttack(plan, ctx))
  expect(played.names).toEqual(['foldIntoPair'])
})

// ===== releasePlaced =====

it('flies the actor’s own staged pair straight to the release slot', async () => {
  played.names = []
  const { api, Probe } = harness()
  const release = vi.fn()
  const staging = { current: { mainUid: 'u1', el: node(), release } as StagedHandoff }
  render(<Probe staging={staging} />)
  const plan: Extract<BeatPlan, { kind: 'releasePlaced' }> = {
    kind: 'releasePlaced',
    key: 'release:7',
    eventId: 7,
    player: 'p1',
    slot: 'frontend',
    card: 'release-frontend',
    codeReview: 'support-code-review',
  }
  await drive(() => api.beat?.runRelease(plan, ctx))
  expect(played.names).toEqual(['playToReleaseZone'])
  expect(release).toHaveBeenCalledTimes(1)
})

it('folds an opponent’s Code Review combo in and flies it to their slot', async () => {
  played.names = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'releasePlaced' }> = {
    kind: 'releasePlaced',
    key: 'release:7',
    eventId: 7,
    player: 'p2',
    slot: 'backend',
    card: 'release-backend',
    codeReview: 'support-code-review',
  }
  await drive(() => api.beat?.runRelease(plan, ctx))
  expect(played.names.filter((n) => n === 'foldIntoPair')).toHaveLength(2)
  expect(played.names).toContain('playToReleaseZone')
})

// The cost leg (#101, Task 11): by the rules a release costs one card, and
// the cost is shown to the table in the open before it goes. `player: 'p2'`
// here (not the local `ctx.base.selfId`, 'p1') — a remote player's cost, so
// this beat's own flyer carries it in from their seat, holds it, and only
// then does it leave through the shared discard exit.
it('shows the cost open, sends it to the discard, then lands the release', async () => {
  played.names = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'releasePlaced' }> = {
    kind: 'releasePlaced',
    key: 'release:7',
    eventId: 7,
    player: 'p2',
    slot: 'frontend',
    card: 'release-frontend',
    cost: { eventId: 6, card: 'attack-bug' },
  }
  await drive(() => api.beat?.runRelease(plan, ctx))
  // the cost left through the shared discard exit, on its own event's scatter
  expect(exits.items).toHaveLength(1)
  expect(exits.items[0]).toMatchObject({
    key: 'c6',
    card: expect.objectContaining({ id: 'attack-bug' }),
    scatter: scatterAt(6),
  })
  // and the release landed with the snap every release lands with
  expect(played.names).toContain('playToReleaseZone')
  // the cost is shown BEFORE the release moves: the discard exit is recorded
  // ahead of the zone flight
  expect(played.names.indexOf('centerToDiscard')).toBeLessThan(
    played.names.indexOf('playToReleaseZone'),
  )
})

it('lands a release with no cost without an exit', async () => {
  played.names = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() =>
    api.beat?.runRelease(
      {
        kind: 'releasePlaced',
        key: 'release:7',
        eventId: 7,
        player: 'p2',
        slot: 'frontend',
        card: 'release-frontend',
      },
      ctx,
    ),
  )
  expect(exits.items).toHaveLength(0)
  expect(played.names).toContain('playToReleaseZone')
})

// ===== pairToDiscard =====

it('splits the pending pair at the centre into two singles for the discard', async () => {
  const { api, Probe, centre } = harness()
  const pending = node()
  pending.setAttribute('data-pending-play', '')
  centre.appendChild(pending)
  render(<Probe />)
  exits.items = []
  const plan: Extract<BeatPlan, { kind: 'pairToDiscard' }> = {
    kind: 'pairToDiscard',
    key: 'pairOut:10',
    main: { eventId: 10, card: 'attack-bug' },
    aux: { eventId: 11, card: 'support-sudo' },
  }
  await drive(() => api.beat?.runPairOut(plan, ctx))
  expect(exits.items).toHaveLength(1)
  expect(exits.items[0]).toMatchObject({
    key: 'p10',
    card: expect.objectContaining({ id: 'attack-bug' }),
    aux: expect.objectContaining({ id: 'support-sudo' }),
    // the aux's OWN scatter (I7) — without it, `useDiscardExit`'s pair-split
    // has no way to learn the aux's discard event id and flies it on a random
    // `jitter()` instead (useDiscardExit.test.tsx pins the consuming side).
    auxScatter: scatterAt(11),
  })
})

it('flies only the sudo half out on a rollback return', async () => {
  const { api, Probe, centre } = harness()
  const pending = node()
  pending.setAttribute('data-pending-play', '')
  centre.appendChild(pending)
  render(<Probe />)
  exits.items = []
  const plan: Extract<BeatPlan, { kind: 'pairToDiscard' }> = {
    kind: 'pairToDiscard',
    key: 'pairOut:10',
    aux: { eventId: 10, card: 'support-sudo' },
  }
  await drive(() => api.beat?.runPairOut(plan, ctx))
  expect(exits.items).toHaveLength(1)
  expect(exits.items[0]).toMatchObject({
    key: 'p10',
    card: expect.objectContaining({ id: 'support-sudo' }),
  })
  expect(exits.items[0].aux).toBeUndefined()
})

// The pin the brief asks for: nothing today pins `[data-pending-play]` itself
// — this beat is the one place that reads it, so a `_Board.tsx` change that
// dropped the attribute would silently leave the split unmeasurable (never
// stranded, but never flown either). The test above (a real node CARRYING the
// attribute) is what would catch that regression; this one pins the no-node
// side of the same branch.
it('sends nothing when the pending node cannot be measured', async () => {
  const { api, Probe } = harness()
  render(<Probe />)
  exits.items = []
  const plan: Extract<BeatPlan, { kind: 'pairToDiscard' }> = {
    kind: 'pairToDiscard',
    key: 'pairOut:10',
    main: { eventId: 10, card: 'attack-bug' },
  }
  await drive(() => api.beat?.runPairOut(plan, ctx))
  expect(exits.items).toHaveLength(0)
})

// ===== reset =====

// A new match cancels what is in the air (fix 1, #97) — mirrored here for the
// combo runner's own two carriers: the fold's own flyer (`useFlyer`) and the
// pair-out's discard exit (`useDiscardExit`, shared with `discardBeat`).
//
// This parks the pair-out half, the same `hang`/`release` mechanism
// `useBeats.test.tsx`'s rematch test uses for the discard beat's own exit, so
// the assertion is on the REAL carrier `send()` mounted — not a mock whose
// overlay was empty either way. The fold's own flyer half (`flyer.drop()`) is
// the same one-line combinator already shipped and typechecked for
// `deckBeat`'s `reset`; parking a *second*, independent carrier (a fold at the
// centre, which needs its own hung `play()`) for the same assertion would
// double the harness's mocking surface for no additional branch coverage —
// `reset()` is one function, and this proves it actually runs and has an
// effect, not that its two lines exist.
it('reset() drops a pair-out flight parked mid-air', async () => {
  played.names = []
  exits.items = []
  const { api, Probe, centre } = harness()
  const pending = node()
  pending.setAttribute('data-pending-play', '')
  centre.appendChild(pending)
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'pairToDiscard' }> = {
    kind: 'pairToDiscard',
    key: 'pairOut:10',
    main: { eventId: 10, card: 'attack-bug' },
    aux: { eventId: 11, card: 'support-sudo' },
  }
  hang.on = true
  const running = api.beat?.runPairOut(plan, ctx)
  // Past `runPairOut`'s own `nextFrames()` wait and into the hung `send()` —
  // the same real-timer flush `useBeats.test.tsx`'s `flush()` uses for the
  // same wait.
  await act(async () => void (await new Promise((r) => setTimeout(r, 80))))
  expect(api.beat?.overlay.length).toBeGreaterThan(0)
  act(() => {
    api.beat?.reset()
  })
  expect(api.beat?.overlay.length).toBe(0)
  // Release the hang so the parked call resolves and doesn't leak into a
  // later test.
  hang.on = false
  hang.release?.()
  await running
})
