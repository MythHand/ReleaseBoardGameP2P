import { describe, expect, it, vi } from 'vitest'
import { useAiBeat } from './aiBeat'
import {
  anchorsFixture,
  animationsTrace,
  callOrder,
  playedNames,
  renderBeat,
  runBeat,
  waitedMs,
} from './testing'
import { HALLUCINATION_HOLD, TABLE_HOLD } from './toCentre'

// The harness's own mock has to be wired here, not inside `./testing` — see
// that file's own header for why (importing a shared FACTORY FUNCTION into a
// `vi.mock` factory hits a Vitest hoisting TDZ that import order cannot fix
// reliably, since Biome resorts imports on every lint pass). Referencing
// `animationsTrace`'s properties, rather than calling an imported function,
// is what survives regardless of import order — so this block is the one
// piece every beat test repeats for itself.
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    play: (name: string, el: Element | null, params?: Record<string, unknown>) => {
      animationsTrace.played.push(name)
      return real.play(name, el, params)
    },
    wait: (ms: number) => {
      animationsTrace.waited.push(ms)
      return real.wait(ms)
    },
    // `aiBeat.tsx` has exactly one call site for `nextFrames` (the `standing`
    // branch) — `useFlyer.tsx`'s own internal `raise()` imports `nextFrames`
    // straight from `./timing`, not through this barrel, so it never touches
    // this trace. That makes a plain call-order log here unambiguous: any
    // `'nextFrames'` entry IS the standing branch's own await.
    nextFrames: () => {
      animationsTrace.order.push('nextFrames')
      return real.nextFrames()
    },
    // Wrapping `useFlyer` (not `drop` alone — it isn't a named export) so
    // `useToCentre`'s `drop` is traced the same way: this barrel IS what
    // `toCentre.ts` imports `useFlyer` from, so the wrapped `drop` is the one
    // `aiBeat.tsx` actually calls.
    useFlyer: () => {
      const flyer = real.useFlyer()
      return {
        ...flyer,
        drop: (key?: string) => {
          animationsTrace.order.push(`drop:${key ?? '*'}`)
          return flyer.drop(key)
        },
      }
    },
    useDiscardExit: () => ({
      overlay: [],
      send: (items: unknown[]) => animationsTrace.exitSpy(items),
      reset: () => {},
      FLIGHT_MS: 420,
    }),
  }
})

describe('aiBeat', () => {
  it('brings the trigger and the card it pulled to their own places, then settles the release', async () => {
    const anchors = anchorsFixture()
    const plan = {
      kind: 'aiEvent' as const,
      key: 'ai:1',
      eventId: 1,
      player: 'p1',
      pile: 0,
      trigger: 'trigger-ai',
      triggerDiscardId: 3,
      eventCard: 'ai-release-frontend',
      tail: { kind: 'zone' as const, slot: 'frontend', card: 'release-frontend' },
    }
    const { result } = renderBeat(() => useAiBeat(anchors))
    // NOT wrapped in an outer `act(...)` — see `runBeat`'s own header in
    // `./testing`: nesting it here defers every commit to this act's own
    // resolution, and the flyers this beat raises never get a chance to bind.
    await runBeat(result.current.run, plan, anchors)
    // the trigger left for the heap on its own event id's scatter (I7)
    expect(anchors.exitSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ key: 'd3' })]),
    )
    // the AI card went to the slot and NOT to the events deck
    expect(playedNames()).toContain('playToReleaseZone')
    expect(playedNames()).not.toContain('returnToDeck')
  })

  const crushPlan = (destination: 'events' | 'discard') => ({
    kind: 'aiEvent' as const,
    key: 'ai:1',
    eventId: 1,
    player: 'p1',
    pile: 0,
    trigger: 'trigger-ai',
    triggerDiscardId: 3,
    eventCard: 'ai-crush-frontend',
    tail: { kind: 'crush' as const, slot: 'frontend', card: 'release-frontend', destination },
  })

  it('sends a destroyed AI release home and never to the heap', async () => {
    // 'p1:frontend' is already wired into the default fixture's `releaseSlot`
    // (`testing.tsx`'s own `slots` map) — no override needed to reach it.
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(result.current.run, crushPlan('events'), anchors)
    // two cards go home: the AI card, and the release it destroyed
    expect(playedNames()).toEqual(expect.arrayContaining(['returnToDeck']))
    // the ONLY thing in the heap is the trigger
    const keys = (anchors.exitSpy.mock.calls.flat(2) as { key: string }[]).map((c) => c.key)
    expect(keys).toEqual(['d3'])
  })

  it('sends a destroyed ordinary release to the heap', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(result.current.run, crushPlan('discard'), anchors)
    const keys = (anchors.exitSpy.mock.calls.flat(2) as { key: string }[]).map((c) => c.key)
    expect(keys).toEqual(expect.arrayContaining(['d3', 'crushed']))
  })

  const standingPlan = {
    kind: 'aiEvent' as const,
    key: 'ai:1',
    eventId: 1,
    player: 'p1',
    pile: 0,
    trigger: 'trigger-ai',
    triggerDiscardId: 3,
    eventCard: 'ai-bad-vibe-coding',
    tail: { kind: 'standing' as const },
  }

  it('lets the trigger go and leaves the AI card standing when a prompt is owed', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    // NOT wrapped in an outer `act(...)` — see `runBeat`'s own header in
    // `./testing`.
    await runBeat(result.current.run, standingPlan, anchors)
    // the trigger was filed…
    const keys = (anchors.exitSpy.mock.calls.flat(2) as { key: string }[]).map((c) => c.key)
    expect(keys).toEqual(['d3'])
    // …and the AI card neither followed it nor went home
    expect(playedNames()).not.toContain('returnToDeck')
  })

  // `none`, `alarm` and `turnEnded` reach byte-identical code — Task 6's
  // `goHome` fallback, unmodified by this task — so one table-driven case
  // over the three tails the brief names, rather than three near-copies of
  // the same assertion.
  it.each([
    { kind: 'none' as const },
    { kind: 'alarm' as const },
    { kind: 'turnEnded' as const },
  ])('takes both away when the tail is $kind', async (tail) => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(result.current.run, { ...standingPlan, tail }, anchors)
    expect(playedNames()).toContain('returnToDeck')
  })

  // Pins I2 (`aiBeat.tsx:173-175`'s own comment): the projection's render
  // must be up before the carrier lets go, not after. `nextFrames()` is
  // called exactly once in this scenario (see the mock's own comment), and
  // `order`'s indices only agree with "before" if the call actually precedes
  // the drop — a version that dropped the carrier FIRST and awaited
  // `nextFrames()` after would still make the call, but out of order, and
  // this assertion catches that the same way it catches deleting the line.
  it('paints the projection before letting the AI carrier go', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(result.current.run, standingPlan, anchors)
    const order = callOrder()
    const nextFramesIndex = order.indexOf('nextFrames')
    const dropIndex = order.indexOf('drop:eff')
    expect(nextFramesIndex).toBeGreaterThanOrEqual(0)
    expect(dropIndex).toBeGreaterThan(nextFramesIndex)
  })

  // `runBeat`'s own opts carry no `onWait` hook (the brief's snippet assumed
  // one, but the harness only ever traced `play`) — extended the same trace
  // to `wait` instead (`animationsTrace.waited`, exposed as `waitedMs()`),
  // which is what every OTHER beat-test assertion in this file already does
  // for `play`.
  it('holds Hallucination twice as long as anything else', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(
      result.current.run,
      {
        ...standingPlan,
        eventCard: 'ai-hallucination',
        tail: { kind: 'turnEnded' as const },
      },
      anchors,
    )
    expect(waitedMs()).toContain(HALLUCINATION_HOLD)
    expect(waitedMs()).not.toContain(TABLE_HOLD)
  })
})
