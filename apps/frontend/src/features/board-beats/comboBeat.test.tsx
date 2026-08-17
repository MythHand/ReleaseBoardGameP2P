import type { CardData } from '@release/ui'
import { cardById } from '@release/ui'
import type { Leaving } from '@release/ui/animations'
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
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    play: (name: string) => {
      played.names.push(name)
      return { finished: Promise.resolve() } as unknown as Animation
    },
    useDiscardExit: () => ({
      overlay: [],
      send: (items: Leaving[]) => {
        played.names.push('centerToDiscard')
        exits.items.push(...items)
        return Promise.resolve()
      },
      reset: () => {},
      FLIGHT_MS: 420,
    }),
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
