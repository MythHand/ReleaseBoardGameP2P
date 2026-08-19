import type { Leaving } from '@release/ui/animations'
import { scatterAt } from '@release/ui/animations'
import { act, render } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, it, vi } from 'vitest'
import type { BeatRun, BoardAnchors, BoardState, StagedHandoff } from '~/entities/game/board'
import { COVER_POSE } from '~/entities/game/board'
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
// What each real `arrive()` call was aimed at — `drawBeat.test.tsx`'s own
// pass-through wrapper idiom: the fan itself stays real (it is what the
// Rollback return actually has to land in), but the call is recorded so a
// test can tell "landed in our own fan" from "flew to a seat instead" without
// re-deriving it from DOM state.
const arrivals = vi.hoisted(() => ({
  handLengths: [] as number[],
  ats: [] as (number | undefined)[],
  // Incremented only once the REAL `arrive()` promise settles — after its
  // own `nextFrames()` + `wait(FLIGHT_MS)` + landing callback, not when it is
  // merely CALLED. `handLengths`/`ats` above are pushed synchronously at the
  // call, so they cannot tell "the runner awaited the flight" from "the
  // runner fired it and moved on" — this can, checked once the runner's own
  // promise has settled.
  landed: 0,
}))
// What the runner's own `patch()` call actually carried — the steal's morph
// (Task 15) is a content swap on the flyer, not a flag, so the only way to
// observe "it turned LOD" is to read the `lod` prop off the React element
// `patch` was handed. Real `useFlyer` underneath (pass-through, same idiom as
// `useHandArrival` above): the morph's correctness is WHEN patch is called
// relative to the flight starting, and a fully faked flyer cannot show that.
const patched = vi.hoisted(() => ({ lod: undefined as boolean | undefined }))
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
    useFlyer: (...args: Parameters<typeof real.useFlyer>) => {
      const flyer = real.useFlyer(...args)
      return {
        ...flyer,
        patch: (key: string, next: Parameters<typeof flyer.patch>[1]) => {
          const content = next.content as { props?: { lod?: boolean } } | undefined
          if (content && typeof content === 'object' && 'props' in content) {
            patched.lod = content.props?.lod
          }
          return flyer.patch(key, next)
        },
      }
    },
    useHandArrival: (...args: Parameters<typeof real.useHandArrival>) => {
      const step = real.useHandArrival(...args)
      return {
        ...step,
        arrive: (items: Parameters<typeof step.arrive>[0], handLength: number, at?: number) => {
          arrivals.handLengths.push(handLength)
          arrivals.ats.push(at)
          return step.arrive(items, handLength, at).then(() => {
            arrivals.landed += 1
          })
        },
      }
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
    // Only OPPONENTS' seats are bound on the real board — `_Board.tsx` renders
    // no seat for the local player — so `seatBox` answers null for 'p1'. That
    // asymmetry is what finding 6 (#101, Fix C) runs into: on a rejoin our own
    // defence has no handoff to inherit AND no seat to fly from.
    seatBox: (player: string) =>
      player === 'p1' ? null : { left: 0, top: 0, width: 150, height: 210 },
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

// The local player (`base.selfId`) is `p1`, so the default here is "I defend
// against p2's attack" — the same convention `planBeats.test.ts`'s own
// Rollback fixtures use (`defended({ player: 'p1', ... })` against
// `defendPending()`'s default `attacker: 'p2'`), so a plain Rollback's
// `returnTo` naturally lands on the attacker, p2 — a seat.
const rollbackPlan = (
  over: Partial<Extract<BeatPlan, { kind: 'covered' }>> = {},
): Extract<BeatPlan, { kind: 'covered' }> => ({
  kind: 'covered',
  key: 'covered:30',
  eventId: 30,
  defender: 'p1',
  card: 'defense-rollback',
  effect: 'return',
  attacker: 'p2',
  attackCard: 'attack-bug',
  attackSudo: false,
  spent: [{ eventId: 31, card: 'defense-rollback', reason: 'defenceSpent' }],
  ...over,
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

// ===== Fix C, finding 6 — the cover on a rejoin =====
//
// The cover branch runs for OUR OWN defence whenever there is no handoff to
// inherit — a rejoin, or a replay, where the gesture that would have staged it
// never happened on this peer. It then asked `seatBox` for a source, and
// `seatBox` is null for the local player (only opponents' seats are bound), so
// it fell out of the branch having done nothing: the cover never flew AND
// never stood, and the exit that follows started from an empty box.
//
// A source it can always answer, in the same order `comboBeat`'s own `foldIn`
// resolves one: the fan slot the card left, then the actor's seat, and — when
// neither exists, which is exactly the rejoin — the cover slot itself, so the
// card at least stands where it belongs instead of vanishing.
it('stands our own cover even with no handoff and no seat to fly from', async () => {
  played.names = []
  played.calls = []
  exits.items = []
  const { api, Probe, cover } = harness()
  render(<Probe />) // no `staging` — nothing to inherit, as on a rejoin
  await drive(() => api.beat?.runCovered({ ...cancelPlan(), defender: 'p1', attacker: 'p2' }, ctx))
  const flights = played.calls.filter((c) => c.name === 'playToCenter')
  expect(flights).toHaveLength(1)
  // it lands at the cover slot, in the cover's own pose — the same end state
  // the flight from a seat reaches
  const box = cover.getBoundingClientRect()
  expect(flights[0].params).toMatchObject({
    from: { left: box.left, top: box.top, width: box.width, height: box.height },
    to: { left: box.left, top: box.top, width: box.width, height: box.height },
    rotate: COVER_POSE.rot,
  })
  // and the exchange still leaves from a real box, not an empty one
  expect(exits.items.map((i) => i.card.id)).toContain('defense-hotfix')
})

// ===== rollback returns the attack, instead of banking it =====

it('flies a plain Rollback’s attack back to the seat that threw it', async () => {
  played.names = []
  played.calls = []
  arrivals.handLengths = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() => api.beat?.runCovered(rollbackPlan({ returnTo: 'p2' }), ctx))
  // it went to a seat, not into our fan
  expect(arrivals.handLengths).toHaveLength(0)
  // TWO playToCenters: the cover lying over the attack, AND the attack's own
  // return flight — `toContain` alone would already be satisfied by the
  // cover's, which fires regardless of the return leg this test is actually
  // about, so the count is what makes this discriminating.
  expect(played.calls.filter((c) => c.name === 'playToCenter')).toHaveLength(2)
  // and it was never banked: only the defence left for the discard
  expect(exits.items.map((i) => i.card.id)).toEqual(['defense-rollback'])
})

it('brings a sudo Rollback’s attack into our own fan', async () => {
  arrivals.handLengths = []
  arrivals.ats = []
  arrivals.landed = 0
  const { api, Probe } = harness()
  render(<Probe />)
  // base.selfId is 'p1', so returnTo: 'p1' is us
  await drive(() =>
    api.beat?.runCovered(
      rollbackPlan({ returnTo: 'p1', defender: 'p1', sudo: 'support-sudo' }),
      ctx,
    ),
  )
  expect(arrivals.handLengths).toHaveLength(1)
  // the gap opens in the MIDDLE of the fan: no index is passed
  expect(arrivals.ats[0]).toBeUndefined()
  // The load-bearing assertion for "one moment, not two": by the time
  // `runCovered` itself has resolved, the flight must actually have LANDED —
  // not merely been kicked off. A runner that fires `arrive()` and races a
  // same-duration `wait()` alongside it (instead of awaiting the real thing)
  // resolves ~2 frames before `arrive()`'s own promise does (it spends those
  // frames on `nextFrames()` before its own timer starts), so this would
  // still read 0 here if that regressed.
  expect(arrivals.landed).toBe(1)
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
// Fix round 1 (Important 2): `release()` used to run BEFORE `wait(SHOW_HOLD)`
// — invisible while the handoff was always null for a local defender (the
// bug Carry #2 named), but once that carried a real `.el` (Task 16's fix),
// calling `release()` this early cleared the local defender's own static
// cover render at once, leaving the cover slot blank for the whole ~1.2s
// hold before the exit flight ever raised anything to replace it. `release()`
// now waits until the hold is over, immediately ahead of the exit — the same
// "drop right before the replacement mounts" ordering `comboBeat.tsx`'s own
// `runRelease` cost leg already uses for the identical class of bug.
it('keeps the local defender’s own handoff standing through the whole hold', async () => {
  played.names = []
  played.calls = []
  exits.items = []
  const { api, Probe } = harness()
  const release = vi.fn()
  const staging = { current: { mainUid: 'u1', el: node(), release } as StagedHandoff }
  render(<Probe staging={staging} />)
  vi.useFakeTimers()
  try {
    hang.on = false
    const running = api.beat?.runCovered({ ...cancelPlan(), defender: 'p1' }, ctx)
    // past `nextFrames()`, comfortably inside the 1.2s `SHOW_HOLD` span
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(release).not.toHaveBeenCalled()
    // past the whole hold and the exit flight (send() resolves at once — `hang.on` is false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(release).toHaveBeenCalledTimes(1)
    await running
  } finally {
    vi.useRealTimers()
  }
})

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

// ===== stolen — Security Bug takes the release across the table (#101) =====

it('flies the stolen release from the robbed zone into the thief’s', async () => {
  played.names = []
  patched.lod = undefined
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() =>
    api.beat?.runStolen(
      {
        kind: 'stolen',
        key: 'stolen:20',
        eventId: 20,
        from: 'p1',
        to: 'p2',
        slot: 'frontend',
        card: 'release-frontend',
      },
      ctx,
    ),
  )
  expect(played.names).toContain('playToCenter')
  // it reads as LOD by the time it lands — the morph happens IN FLIGHT, not on
  // arrival, so `patch` was called with the LOD face while the card travelled.
  // base.selfId is 'p1', so 'p2' is an opponent's zone.
  expect(patched.lod).toBe(true)
})

// The guard that keeps the morph from firing unconditionally: a release
// stolen INTO OUR OWN zone (the reflected case, and any future one) is read
// in full, same as any other card lying in our own zone — never as LOD. If
// the guard were dropped and `patch` always carried `lod: true`, this would
// go red the moment it does.
it('reads a release stolen into our own zone in full, never as LOD', async () => {
  played.names = []
  patched.lod = undefined
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() =>
    api.beat?.runStolen(
      {
        kind: 'stolen',
        key: 'stolen:21',
        eventId: 21,
        from: 'p2',
        to: 'p1',
        slot: 'frontend',
        card: 'release-frontend',
      },
      ctx,
    ),
  )
  expect(played.names).toContain('playToCenter')
  expect(patched.lod).toBeUndefined()
})
