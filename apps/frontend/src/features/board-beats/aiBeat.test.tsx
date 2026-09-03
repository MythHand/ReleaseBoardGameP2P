import { describe, expect, it, vi } from 'vitest'
import { useAiBeat } from './aiBeat'
import { anchorsFixture, animationsTrace, playedNames, renderBeat, runBeat } from './testing'

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
})
