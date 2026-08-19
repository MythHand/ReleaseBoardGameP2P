import type { Leaving } from '@release/ui/animations'
import { scatterAt } from '@release/ui/animations'
import { act, render } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, it, vi } from 'vitest'
import type { BeatRun, BoardAnchors, BoardState, StagedHandoff } from '~/entities/game/board'
import { useDefenseBeat } from './defenseBeat'
import type { BeatPlan } from './planBeats'

const played = vi.hoisted(() => ({
  names: [] as string[],
  // the full call, not just the name — `runCovered`'s own `play('playToCenter', …)`
  // is called straight through this mocked barrel (unlike `useDiscardExit`'s
  // internal `play`, which goes through a sibling import the mock never sees),
  // so the params reaching it — the cover's own tilt/offset (COVER_POSE) — are
  // observable here and worth pinning: a fly with no pose reads as a neat
  // stack, not a second play lying over the attack.
  calls: [] as { name: string; params: Record<string, unknown> }[],
}))
// What `useDiscardExit`'s `send` actually received — not just that it was
// called. `useDiscardExit`'s own `send` calls `play` through a SIBLING import
// (apps/ui/src/animations/useDiscardExit.tsx imports `./play` directly, not
// through this barrel), so mocking `play` above never sees it — drawBeat.test.tsx,
// comboBeat.test.tsx and useBeats.test.tsx hit the same wall and stub the whole
// hook instead of the leaf it calls internally; this does the same.
const exits = vi.hoisted(() => ({ items: [] as Leaving[] }))
// `hang`/`release` — the same "park a flight mid-air" convention
// `useBeats.test.tsx` uses for the discard exit: `send()` stores its resolver
// instead of resolving, so a test can hold the beat in flight and choose the
// moment it lands.
const hang = vi.hoisted(() => ({ on: false, release: null as (() => void) | null }))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  const { useState } = await import('react')
  return {
    ...real,
    play: (name: string, _el: unknown, params: Record<string, unknown> = {}) => {
      played.names.push(name)
      played.calls.push({ name, params })
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

const base = {
  you: { name: 'You', hand: [], release: {} },
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
  const cover = node()
  const sudoNode = node()
  const stage = node()
  const cost = node()
  const anchors = {
    hand: { current: node() },
    centre: { current: centre },
    stage: { current: stage },
    cost: { current: cost },
    sudo: { current: sudoNode },
    cover: { current: cover },
    discardBox: { current: node() },
    pileBox: () => null,
    seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }),
    seatOf: () => node(),
    handSlotAt: () => null,
    releaseSlot: () => node(),
    bindPile: () => {},
    bindSeat: () => {},
    bindReleaseSlot: () => {},
  } as unknown as BoardAnchors
  const api: { beat?: ReturnType<typeof useDefenseBeat> } = {}
  function Probe({ staging }: { staging?: RefObject<StagedHandoff | null> }) {
    api.beat = useDefenseBeat(anchors, staging)
    return <>{api.beat.overlay}</>
  }
  return { anchors, api, centre, cover, Probe }
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

const cancelPlan = (): Extract<BeatPlan, { kind: 'covered' }> => ({
  kind: 'covered',
  key: 'covered:12',
  eventId: 12,
  defender: 'p2',
  card: 'defense-hotfix',
  effect: 'cancel',
  attacker: 'p1',
  attackCard: 'attack-bug',
  attackSudo: false,
  spent: [
    { eventId: 13, card: 'attack-bug', reason: 'attackSpent' },
    { eventId: 14, card: 'defense-hotfix', reason: 'defenceSpent' },
  ],
})

// ===== covered =====

it('lays the defence over the attack and sends the whole exchange out together', async () => {
  played.names = []
  played.calls = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() => api.beat?.runCovered(cancelPlan(), ctx))
  // THE COVER — an opponent's defence (no local handoff standing at the
  // slot), so this exercises the fly itself, not just the exit that follows
  // it. Pinned on the PARAMS reaching `play`, not just its name: the whole
  // point is the offset-and-opposite-tilt (COVER_POSE) that makes the
  // defence read as a second play lying over the attack, not a neat stack —
  // a fly with no pose at all would still satisfy a name-only assertion.
  const cover = played.calls.find((c) => c.name === 'playToCenter')
  expect(cover).toBeDefined()
  expect(cover?.params).toMatchObject({ rotate: 6, dx: 16, dy: -12 })
  // ONE send: the attack and the cover leave as one exchange, not two gestures
  expect(exits.items).toHaveLength(2)
  const [attackExit, coverExit] = exits.items
  // each carries its own layer, so the heap keeps the order they lay in on
  // the table (I9) — the attack was UNDER the cover and lands under it in the
  // heap too
  expect(attackExit).toMatchObject({ layer: 0, scatter: scatterAt(13) })
  expect(coverExit).toMatchObject({ layer: 1, scatter: scatterAt(14) })
})

// The discriminating case for `spentOf`'s reason guard: `support-sudo` is
// banked on BOTH sides of this exchange (the attack's own sudo, AND the
// defender's own, folded under the defence). A lookup by card id alone would
// find the FIRST `support-sudo` entry for both sides — attributing the
// attacker's sudo to the defence, or vice versa — which is exactly the
// ambiguity the brief calls out.
it('keeps the attacker’s own sudo and the defender’s own sudo apart when both sides carry one', async () => {
  played.names = []
  played.calls = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'covered' }> = {
    kind: 'covered',
    key: 'covered:20',
    eventId: 20,
    defender: 'p2',
    card: 'defense-hotfix',
    sudo: 'support-sudo',
    effect: 'cancel',
    attacker: 'p1',
    attackCard: 'attack-bug',
    attackSudo: true,
    spent: [
      { eventId: 21, card: 'attack-bug', reason: 'attackSpent' },
      { eventId: 22, card: 'support-sudo', reason: 'attackSpent' },
      { eventId: 23, card: 'defense-hotfix', reason: 'defenceSpent' },
      { eventId: 24, card: 'support-sudo', reason: 'defenceSpent' },
    ],
  }
  await drive(() => api.beat?.runCovered(plan, ctx))
  expect(exits.items).toHaveLength(2)
  const [attack, cover] = exits.items
  // the attack's own sudo — the ATTACKER's, event 22 — travels out WITH the
  // attack card, not the defender's (event 24)
  expect(attack).toMatchObject({
    card: expect.objectContaining({ id: 'attack-bug' }),
    aux: expect.objectContaining({ id: 'support-sudo' }),
    auxScatter: scatterAt(22),
  })
  // the cover carries the DEFENDER's own sudo (event 24, not 22 — the
  // attacker's) — the discriminating assertion: a `spentOf` that matched by
  // card id alone would find event 22 (the FIRST 'support-sudo' in `spent`,
  // which happens to be the attacker's) for BOTH sides, and this line goes
  // red the moment the reason guard is dropped
  expect(cover).toMatchObject({
    card: expect.objectContaining({ id: 'defense-hotfix' }),
    aux: expect.objectContaining({ id: 'support-sudo' }),
    auxScatter: scatterAt(24),
  })
})

it('carries the attack’s own sudo out with it as the pair it was', async () => {
  played.names = []
  played.calls = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() =>
    api.beat?.runCovered(
      {
        kind: 'covered',
        key: 'covered:12',
        eventId: 12,
        defender: 'p2',
        card: 'defense-hotfix',
        effect: 'cancel',
        attacker: 'p1',
        attackCard: 'attack-bug',
        attackSudo: true,
        spent: [
          { eventId: 13, card: 'attack-bug', reason: 'attackSpent' },
          { eventId: 14, card: 'support-sudo', reason: 'attackSpent' },
          { eventId: 15, card: 'defense-hotfix', reason: 'defenceSpent' },
        ],
      },
      ctx,
    ),
  )
  expect(exits.items[0]).toMatchObject({
    card: expect.objectContaining({ id: 'attack-bug' }),
    aux: expect.objectContaining({ id: 'support-sudo' }),
    auxScatter: scatterAt(14),
  })
})

// Deliberately the actor's OWN defence (`defender: ctx.base.selfId`, with a
// handoff whose `.el` is set) rather than `cancelPlan()`'s opponent one: that
// path skips the cover flyer entirely (the handoff is already standing where
// the cover goes), so the ONLY carrier this beat raises is the discard exit —
// the same bias comboBeat.test.tsx's own reset test explains for picking
// `runPairOut` over `runAttack`/`runRelease`. A `cancelPlan()`-style opponent
// defence would ALSO raise a 'cover' flyer, and that flyer mounts well before
// `wait(SHOW_HOLD)` even starts — so `overlay.length > 0` would already hold
// before the exit ever hangs, and the assertion would pass whether or not
// `resetExit()` does anything at all (confirmed empirically: commenting out
// `resetExit()` in `reset()` left this test green under that scenario — see
// the task report). Isolating the exit is what makes the assertion actually
// about `resetExit()`, not just `flyer.drop()`.
//
// `wait(SHOW_HOLD)` is a REAL ~1.2s delay, unlike `runPairOut`'s single
// `nextFrames()` — so getting INTO the hung `send()` needs fake timers
// advanced past it, not `comboBeat.test.tsx`'s 80ms real-timer flush.
it('reset() drops an exchange parked mid-air', async () => {
  played.names = []
  played.calls = []
  exits.items = []
  const { api, Probe } = harness()
  const release = vi.fn()
  const staging = { current: { mainUid: 'u1', el: node(), release } as StagedHandoff }
  render(<Probe staging={staging} />)
  vi.useFakeTimers()
  try {
    hang.on = true
    const running = api.beat?.runCovered({ ...cancelPlan(), defender: 'p1' }, ctx)
    // past `nextFrames()` and the whole `wait(SHOW_HOLD)` hold, into the hung
    // `send()`
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(api.beat?.overlay.length).toBeGreaterThan(0)
    act(() => {
      api.beat?.reset()
    })
    expect(api.beat?.overlay.length).toBe(0)
    hang.on = false
    hang.release?.()
    await running
  } finally {
    vi.useRealTimers()
  }
})
