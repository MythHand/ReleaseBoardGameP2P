import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { describe, expect, it, vi } from 'vitest'
import {
  type BoardState,
  type HistoryLabels,
  standInScatter,
  toBoardState,
} from '~/entities/game/board'
import { SHOW_HOLD, useAiBeat } from './aiBeat'
import { planBeats } from './planBeats'
import {
  anchorsFixture,
  animationsTrace,
  boxed,
  callOrder,
  nodeAt,
  playedNames,
  playedWith,
  renderBeat,
  runBeat,
  spot,
  startedAll,
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
      animationsTrace.order.push(`play:${name}`)
      // index-aligned with `played` — `playedWith(name)` is what reads it, and
      // it is what tells "a flight happened" from "a flight aimed HERE"
      animationsTrace.params.push(params)
      animationsTrace.markStart(el)
      return real.play(name, el, params)
    },
    wait: (ms: number) => {
      animationsTrace.waited.push(ms)
      return real.wait(ms)
    },
    // Internal flyer raises import timing directly, so this trace records
    // only the runner's handoffs from a carrier to the standing board.
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
      send: (items: unknown[], takeOff?: (() => void) | null) => {
        takeOff?.()
        return animationsTrace.exitSpy(items)
      },
      reset: () => {},
      FLIGHT_MS: 420,
    }),
  }
})

// The fixture's own two boxes, named: `releaseSlot('p1', 'frontend')` and the
// `effect` place (`testing.tsx`'s `slots` map and `anchorsFixture`). A flight
// home is told from another by WHERE IT STARTS, so these have to be nameable.
const ZONE_SLOT = boxed(700, 100)
const EFFECT_BOX = boxed(450, 300)

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

  it.each([
    ['p1', 'ai-monitoring', 'monitoring', 'protection-monitoring'],
    ['p2', 'ai-monitoring', 'monitoring', 'protection-monitoring'],
    ['p1', 'ai-release-frontend', 'frontend', 'release-frontend'],
    ['p2', 'ai-release-frontend', 'frontend', 'release-frontend'],
  ] as const)('keeps %s’s landed %s in the zone while the trigger is still leaving', async (player, eventCard, slot, rulesCard) => {
    const engine = createFakeEngine()
    const initial = engine.createGame({
      gameId: 'ai-landing',
      seed: 4242,
      players: [
        { id: 'p1', name: 'One' },
        { id: 'p2', name: 'Two' },
      ],
      setup: {},
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    })
    const staged = {
      ...initial,
      turn: { ...initial.turn, player, drawnFrom: [] },
      decks: {
        ...initial.decks,
        main: [[{ uid: 'trigger', id: 'trigger-ai' }, ...initial.decks.main[0]]],
        events: [{ uid: 'event', id: eventCard }],
      },
    }
    const reduction = engine.reduce(staged, { type: 'DRAW', player, at: 1000 })
    const before = toBoardState(engine.project(staged, 'p1'), [], {} as HistoryLabels)
    const after = toBoardState(engine.project(reduction.state, 'p1'), [], {} as HistoryLabels)
    const plans = planBeats(reduction.events, before, after.pending)
    expect(plans.map((entry) => entry.kind)).toEqual(['aiEvent'])
    const plan = plans[0]
    if (plan.kind !== 'aiEvent') throw new Error('Expected AI scene')
    expect(plan.tail).toEqual({ kind: 'zone', slot, card: rulesCard })
    const anchors = anchorsFixture({ releaseSlot: () => nodeAt(ZONE_SLOT) })
    anchors.exitSpy.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      animationsTrace.order.push('trigger-landed')
    })
    const { result } = renderBeat(() => useAiBeat(anchors))
    const { published } = await runBeat(
      (p, beat) =>
        result.current.run(p, {
          ...beat,
          after,
          publish: (state) => {
            animationsTrace.order.push('publish-zone')
            beat.publish(state)
          },
        }),
      plan,
      anchors,
      { base: before },
    )
    // the zone's own publish — the one that lands the AI card; the heap's own
    // publish, once the trigger has landed, comes after it
    const seat = (state: (typeof published)[number] | undefined) =>
      player === 'p1' ? state?.you : state?.opponents.find((o) => o.id === player)
    const landed = published.find((state) => seat(state)?.release[slot])
    const owner = seat(landed)
    expect(owner?.release[slot]?.id).toBe(eventCard)
    expect(owner?.releaseId?.[slot]).toBe(rulesCard)
    expect(owner?.releaseEvent?.[slot]).toBe(eventCard)
    if (player === 'p1') expect(landed?.you.releaseUid?.[slot]).toBe('event')
    expect(landed?.you.hand).toEqual(before.you.hand)
    // the table's decks, but for the trigger's own pile and the events deck:
    // each gave its card up as that card took off, not when the table had
    // played out (offThePile.ts; the events deck since #168)
    expect(landed?.decks).toEqual({
      ...before.decks,
      main: before.decks.main.map((n, i) => (i === plan.pile ? n - 1 : n)),
      events: before.decks.events - 1,
    })
    const order = callOrder()
    // the zone's own publish — the first after the flight into the slot; the
    // pile's own, as the trigger took off, comes long before it (offThePile.ts)
    const flown = order.indexOf('play:playToReleaseZone')
    const zonePublish = order.indexOf('publish-zone', flown)
    expect(zonePublish).toBeGreaterThan(flown)
    // …and the carrier comes down in that same commit, with no frames waited
    // between: two of them drew the card in the slot and on its carrier at once
    // (owner's recordings, #168)
    const dropped = order.indexOf('drop:eff')
    expect(dropped).toBeGreaterThan(zonePublish)
    expect(order.slice(zonePublish, dropped)).not.toContain('nextFrames')
    expect(order.indexOf('trigger-landed')).toBeGreaterThan(order.indexOf('drop:eff'))
    // …and the trigger, once landed, is in the heap — filed by this beat rather
    // than left to the projection, or it blinks out as it lands (toHeap.ts)
    expect(published.at(-1)?.decks.discardHeap?.map((card) => card.uid)).toContain(
      `d${plan.triggerDiscardId}`,
    )
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
    // TWO cards go home, and WHICH is the whole point (#71): the AI card leaves
    // from the `effect` place it was standing in, the destroyed release from
    // its own zone slot. `arrayContaining(['returnToDeck'])` stood here and
    // proved neither — the AI card's own `goHome` supplies a `returnToDeck` on
    // every crush there is, so no-op'ing the release's flight left this test,
    // the one named for #71's guarantee, entirely green.
    const homes = startedAll('returnToDeck')
    expect(homes).toHaveLength(2)
    expect(homes).toContainEqual(spot(ZONE_SLOT)) // the release, out of the zone
    expect(homes).toContainEqual(spot(EFFECT_BOX)) // the AI card, off the centre
    // the ONLY thing in the heap is the trigger
    const keys = (anchors.exitSpy.mock.calls.flat(2) as { key: string }[]).map((c) => c.key)
    expect(keys).toEqual(['d3'])
  })

  it('sends a destroyed ordinary release to the heap', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(result.current.run, crushPlan('discard'), anchors)
    const keys = (anchors.exitSpy.mock.calls.flat(2) as { key: string }[]).map((c) => c.key)
    expect(keys.sort()).toEqual(['crushed', 'd3'])
    // …and it did NOT also go home. Exactly one card takes that road here — the
    // AI card, off the centre — so this test cannot pass on the evidence the
    // events-deck one above is about, nor that one on this.
    expect(startedAll('returnToDeck')).toEqual([spot(EFFECT_BOX)])
  })

  // A zone slot wearing a Code Review renders as a `CardPair`; the aux half is
  // its own tilted node, which is how the beat finds where the second card
  // actually stands.
  const protectedSlot = () => {
    const slot = nodeAt(boxed(700, 100))
    const aux = nodeAt({ left: 706, top: 118, width: 150, height: 210 })
    aux.setAttribute('data-aux', '')
    slot.appendChild(aux)
    return slot
  }

  // `destroySlot`'s spoils are the release AND its Code Review
  // (fake/triggers.ts:87). Flying only the release left the second card
  // blinking out of the zone with no flight of its own.
  it('takes the Code Review with the release it was protecting', async () => {
    const slot = protectedSlot()
    const anchors = anchorsFixture({ releaseSlot: () => slot })
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(
      result.current.run,
      {
        ...crushPlan('discard'),
        tail: { ...crushPlan('discard').tail, codeReview: 'support-code-review' },
      },
      anchors,
    )
    const items = anchors.exitSpy.mock.calls.flat(2) as { key: string; card: { id: string } }[]
    expect(items.map((i) => i.key).sort()).toEqual(['crushed', 'crushedAux', 'd3'])
    expect(items.find((i) => i.key === 'crushedAux')?.card.id).toBe('support-code-review')
  })

  it('keeps the Code Review out of the events deck when the release goes home', async () => {
    // The split `defenseBeat`'s sacrifice leg already makes: a Code Review is
    // never an events-deck card, so it takes the ordinary road even when the
    // release it protected does not.
    const slot = protectedSlot()
    const anchors = anchorsFixture({ releaseSlot: () => slot })
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(
      result.current.run,
      {
        ...crushPlan('events'),
        tail: { ...crushPlan('events').tail, codeReview: 'support-code-review' },
      },
      anchors,
    )
    const items = anchors.exitSpy.mock.calls.flat(2) as { key: string; card: { id: string } }[]
    expect(items.map((i) => i.key).sort()).toEqual(['crushedAux', 'd3'])
    // two go home and no more — the AI card and the release. A third would be
    // the Code Review taking a road that is not its own.
    const homes = startedAll('returnToDeck')
    expect(homes).toHaveLength(2)
    expect(homes).toContainEqual(spot(ZONE_SLOT))
  })

  // I7 FOR A CARD WITH NO EVENT OF ITS OWN. `destroySlot` called without a
  // reason emits `releaseDestroyed` and no `discarded`, so there is no event
  // id to key a scatter off — but the heap still shows the card as its
  // stand-in for the discard's top, and the plan carries that pose. The
  // flight has to land ON it: anything else (the draw's own `plan.eventId`,
  // as this used to send, or a fresh `jitter()`) jumps on the last frame,
  // which is the whole reason one scatter drives both.
  it('lands a crushed release on the very pose the heap will rest it on', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    const rest = { rot: 3, dx: 4, dy: 5 }
    await runBeat(
      result.current.run,
      { ...crushPlan('discard'), tail: { ...crushPlan('discard').tail, rest } },
      anchors,
    )
    const items = anchors.exitSpy.mock.calls.flat(2) as { key: string; scatter?: unknown }[]
    expect(items.find((i) => i.key === 'crushed')?.scatter).toEqual(rest)
  })

  // The contrast, and the recorded gap: a release buried under its own Code
  // Review is not the heap's top, so the plan carries no pose for it. The Code
  // Review's own pose arrives only from the plan (`codeReviewRest`, pinned in
  // the crushed-release tests below) — a tail without one claims nothing. The
  // trigger beside them is what a card WITH a real `discarded` id looks like.
  it('claims a heap pose only for the card the heap actually rests', async () => {
    const slot = protectedSlot()
    const anchors = anchorsFixture({ releaseSlot: () => slot })
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(
      result.current.run,
      {
        ...crushPlan('discard'),
        tail: { ...crushPlan('discard').tail, codeReview: 'support-code-review' },
      },
      anchors,
    )
    const items = anchors.exitSpy.mock.calls.flat(2) as { key: string; scatter?: unknown }[]
    expect(items.find((i) => i.key === 'd3')?.scatter).toEqual(scatterAt(3))
    expect(items.find((i) => i.key === 'crushed')?.scatter).toBeUndefined()
    expect(items.find((i) => i.key === 'crushedAux')?.scatter).toBeUndefined()
  })

  // ONE CARD, ONE PLACE for the release a crush destroys (#168): the zone lets
  // it go in the commit its carrier goes up, and where it lands has it in the
  // commit the carrier comes down. The stand recorded it in its slot for the
  // whole flight and after, and gone from everywhere once its carrier dropped.
  describe('a crushed release, one place at a time', () => {
    // THE CODE REVIEW is the discard's top when the release under it is
    // crushed — banked after it — so it rests as the heap's stand-in, both
    // cards counted (#168; owner, 17.09: they go as they lay, Code Review on top)
    it('rests the Code Review as the heap’s top, both cards counted', async () => {
      const slot = protectedSlot()
      const anchors = anchorsFixture({ releaseSlot: () => slot })
      const { result } = renderBeat(() => useAiBeat(anchors))
      const published: BoardState[] = []
      const base = {
        you: {
          name: 'You',
          hand: [],
          release: { frontend: cardById('release-frontend') },
          support: { frontend: cardById('support-code-review') },
        },
        opponents: [],
        decks: { main: [10], events: 5, discardCount: 4, discardHeap: [] },
        selfId: 'p1',
        history: [],
        setup: {},
        playable: [],
        frozen: [],
      } as unknown as BoardState
      const rest = standInScatter(7)
      await runBeat(
        result.current.run,
        {
          ...crushPlan('discard'),
          tail: {
            ...crushPlan('discard').tail,
            codeReview: 'support-code-review',
            codeReviewRest: rest,
            restCount: 7,
          },
        },
        anchors,
        { base, publish: (s) => published.push(s) },
      )
      const items = anchors.exitSpy.mock.calls.flat(2) as { key: string; scatter?: unknown }[]
      expect(items.find((i) => i.key === 'crushedAux')?.scatter).toEqual(rest)
      const last = published.at(-1)
      expect(last?.decks.discardHeap?.at(-1)).toMatchObject({
        uid: 'top7',
        card: expect.objectContaining({ id: 'support-code-review' }),
        ...rest,
      })
      // the trigger, the release under its Code Review, and the Code Review
      expect(last?.decks.discardCount).toBe(7)
    })

    const crushedBase = {
      you: { name: 'You', hand: [], release: { frontend: cardById('release-frontend') } },
      opponents: [],
      decks: { main: [10], events: 5, discardCount: 4, discardHeap: [] },
      selfId: 'p1',
      history: [],
      setup: {},
      playable: [],
      frozen: [],
    } as unknown as BoardState
    // every publish, numbered in the same trace the drops and flights are in
    const recording = () => {
      const states: BoardState[] = []
      const publish = (state: BoardState) => {
        states.push(state)
        animationsTrace.order.push(`publish:${states.length - 1}`)
      }
      return { states, publish }
    }

    it('lets the zone go of it in the commit its carrier goes up', async () => {
      const anchors = anchorsFixture()
      anchors.exitSpy.mockImplementation((items: unknown) => {
        if ((items as { key: string }[]).some((i) => i.key === 'crushed'))
          animationsTrace.order.push('exit:crushed')
        return Promise.resolve()
      })
      const { result } = renderBeat(() => useAiBeat(anchors))
      const { states, publish } = recording()
      await runBeat(result.current.run, crushPlan('discard'), anchors, {
        base: crushedBase,
        publish,
      })
      const lifted = states.findIndex((s) => !s.you.release.frontend)
      expect(lifted).toBeGreaterThanOrEqual(0)
      expect(callOrder().indexOf(`publish:${lifted}`)).toBeLessThan(
        callOrder().indexOf('exit:crushed'),
      )
    })

    it('rests it in the heap as the stand-in for its top as it lands', async () => {
      const anchors = anchorsFixture()
      const { result } = renderBeat(() => useAiBeat(anchors))
      const { states, publish } = recording()
      const rest = standInScatter(6)
      await runBeat(
        result.current.run,
        {
          ...crushPlan('discard'),
          tail: { ...crushPlan('discard').tail, rest, restCount: 6 },
        },
        anchors,
        { base: crushedBase, publish },
      )
      // the very name and pose the projection then draws it with
      const filed = states.findIndex((s) => s.decks.discardHeap?.some((c) => c.uid === 'top6'))
      expect(filed).toBeGreaterThanOrEqual(0)
      expect(states[filed].decks.discardHeap?.find((c) => c.uid === 'top6')).toMatchObject({
        card: expect.objectContaining({ id: 'release-frontend' }),
        ...rest,
      })
      expect(callOrder().indexOf(`publish:${filed}`)).toBeLessThan(
        callOrder().indexOf('drop:crushed'),
      )
      // the trigger and the release, both counted
      expect(states.at(-1)?.decks.discardCount).toBe(6)
    })

    // A REFUSED CRUSH: the release and the trigger beside it leave together and
    // land in either order. The stand recorded the release filed and then gone
    // again — the trigger's landing put back the decks from before (03.10).
    it.each([
      'the release',
      'the trigger',
    ])('keeps the release on top of the trigger after a refusal, %s landing first', async (first) => {
      const anchors = anchorsFixture()
      anchors.exitSpy.mockImplementation((items: unknown) => {
        const crushed = (items as { key: string }[]).some((i) => i.key === 'crushed')
        const late = first === 'the release' ? !crushed : crushed
        return new Promise<void>((resolve) => setTimeout(resolve, late ? 200 : 0))
      })
      const { result } = renderBeat(() => useAiBeat(anchors))
      const { states, publish } = recording()
      const causeward = { card: 'trigger-ai', eventId: 3 }
      const refused = {
        kind: 'crushRefused' as const,
        key: 'refused:9',
        eventId: 9,
        player: 'p1',
        tail: {
          kind: 'crush' as const,
          slot: 'frontend',
          card: 'release-frontend',
          destination: 'discard' as const,
          rest: standInScatter(6),
          restCount: 6,
        },
        homeward: 'ai-crush-frontend',
        causeward,
      }
      const base = {
        ...crushedBase,
        aiCause: causeward,
        decks: {
          ...crushedBase.decks,
          discardCount: 5,
          discardHeap: [{ uid: 'd3', card: cardById('trigger-ai'), ...scatterAt(3) }],
        },
      } as BoardState
      await runBeat(result.current.runRefused, refused, anchors, { base, publish })
      const last = states.at(-1)
      expect(last?.decks.discardHeap?.map((card) => card.uid)).toEqual(['d3', 'top6'])
      expect(last?.decks.discardCount).toBe(6)
    })

    it('counts an AI release back into the events deck as it lands', async () => {
      const anchors = anchorsFixture()
      const { result } = renderBeat(() => useAiBeat(anchors))
      const { states, publish } = recording()
      await runBeat(result.current.run, crushPlan('events'), anchors, {
        base: crushedBase,
        publish,
      })
      const homed = states.findIndex((s) => s.decks.events === 6)
      expect(homed).toBeGreaterThanOrEqual(0)
      expect(callOrder().indexOf(`publish:${homed}`)).toBeLessThan(
        callOrder().indexOf('drop:crushed'),
      )
    })
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

  it('keeps the trigger beside the AI card until the prompt is answered', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    // NOT wrapped in an outer `act(...)` — see `runBeat`'s own header in
    // `./testing`.
    await runBeat(result.current.run, standingPlan, anchors)
    const keys = (anchors.exitSpy.mock.calls.flat(2) as { key: string }[]).map((c) => c.key)
    expect(keys).toEqual([])
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

  // …the moment the card has turned, not after a reading hold: the prompt is
  // live from there, so the hand can answer it (owner, 03.10), and the table
  // takes both cards over in the commit the carriers come down — the two frames
  // that used to sit between drew both of them twice
  it('publishes the standing pair and its prompt as the card turns, carriers down with it', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    const pending = {
      kind: 'handLimit' as const,
      player: 'p1',
      excess: 1,
      options: [],
      source: 'ai-bad-vibe-coding',
    }
    const { published } = await runBeat(
      (plan, beat) =>
        result.current.run(plan, {
          ...beat,
          after: { ...beat.base, pending },
          publish: (state) => {
            animationsTrace.order.push('publish')
            beat.publish(state)
          },
        }),
      standingPlan,
      anchors,
    )
    expect(published.at(-1)).toMatchObject({
      pending,
      aiCause: { card: 'trigger-ai', eventId: 3 },
    })
    const order = callOrder()
    const publishIndex = order.lastIndexOf('publish')
    expect(publishIndex).toBeGreaterThanOrEqual(0)
    expect(order.slice(publishIndex + 1, publishIndex + 3).sort()).toEqual([
      'drop:eff',
      'drop:trig',
    ])
    expect(waitedMs()).not.toContain(TABLE_HOLD)
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

describe('runTaken — a Release comes back out of the discard (#106, Task 11)', () => {
  const takenPlan = {
    kind: 'takenFromDiscard' as const,
    key: 'taken:20',
    eventId: 20,
    player: 'p1',
    card: 'release-frontend',
    mine: true,
  }

  it("shows the card at the centre for everyone, lands it in the hand, and sends Inside's own card home", async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    // NOT wrapped in an outer `act(...)` — see `runBeat`'s own header in
    // `./testing`.
    const { published } = await runBeat(
      result.current.runTaken,
      { ...takenPlan, homeward: 'ai-inside' },
      anchors,
    )
    // out of the heap, into the hand, and the AI card follows it home — in
    // that order
    expect(playedNames()).toEqual(['drawToCenter', 'returnToDeck'])
    expect(waitedMs()).toContain(SHOW_HOLD)
    expect(waitedMs()).toContain(420) // `flipCard`'s own duration — matches `goHome`
    expect(
      published.some(
        (s) => s.you.hand.length === 1 && s.you.hand[0]?.card.id === 'release-frontend',
      ),
    ).toBe(true)
  })

  it('delivers to the taker at their seat, face up the whole way, and bumps their count', async () => {
    const anchors = anchorsFixture()
    const base: BoardState = {
      you: { name: 'You', hand: [], release: {} },
      opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
      decks: { main: [10], events: 5, discardCount: 0 },
      selfId: 'p1',
      history: [],
      setup: {},
      playable: [],
      frozen: [],
    } as unknown as BoardState
    const { result } = renderBeat(() => useAiBeat(anchors))
    const { published } = await runBeat(
      result.current.runTaken,
      { ...takenPlan, player: 'p2', mine: false },
      anchors,
      { base },
    )
    expect(playedNames()).toEqual(['drawToCenter', 'dealToSeat'])
    // the recipient's counter carries it now — the same fact
    // `transferBeat.tsx`'s own `bumpRecipient` publishes
    expect(published.at(-1)?.opponents[0].handCount).toBe(4)
  })

  it('does not send anything home when the plan carries no `homeward`', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(result.current.runTaken, takenPlan, anchors)
    expect(playedNames()).not.toContain('returnToDeck')
  })

  it('releases the standing cause with Inside after the selected card reaches its owner', async () => {
    const anchors = anchorsFixture()
    const trigger = cardById('trigger-ai')
    if (!trigger) throw new Error('missing AI trigger')
    anchors.exitSpy.mockImplementation(async () => {
      animationsTrace.order.push('causeExit')
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
      animationsTrace.order.push('causeLanded')
    })
    const { result } = renderBeat(() => useAiBeat(anchors))
    const { published } = await runBeat(
      (plan, beat) =>
        result.current.runTaken(plan, {
          ...beat,
          base: {
            ...beat.base,
            decks: {
              ...beat.base.decks,
              discard: trigger,
              discardCount: 1,
              discardHeap: [{ uid: 'd3', card: trigger, ...scatterAt(3) }],
            },
            aiCause: { card: 'trigger-ai', eventId: 3 },
            pending: {
              kind: 'pickFromDiscard',
              raisedAt: 1,
              picks: 1,
              player: 'p1',
              options: [],
              source: 'ai-inside',
            },
          },
          publish: (state) => {
            if (state.you.hand.length === 1) animationsTrace.order.push('received')
            if (!state.aiCause && state.decks.discardHeap?.some((card) => card.uid === 'd3')) {
              animationsTrace.order.push('causeBanked')
            }
            beat.publish(state)
          },
        }),
      { ...takenPlan, homeward: 'ai-inside', causeward: { card: 'trigger-ai', eventId: 3 } },
      anchors,
    )
    const items = anchors.exitSpy.mock.calls.flat(2) as {
      key: string
      from: unknown
      scatter: unknown
    }[]
    expect(items).toMatchObject([{ key: 'd3', from: boxed(250, 300), scatter: scatterAt(3) }])
    const order = callOrder()
    expect(order.indexOf('causeExit')).toBeGreaterThan(order.indexOf('received'))
    expect(order.indexOf('play:returnToDeck')).toBeGreaterThan(order.indexOf('causeExit'))
    expect(order.indexOf('play:returnToDeck')).toBeLessThan(order.indexOf('causeLanded'))
    expect(order.indexOf('causeBanked')).toBeGreaterThan(order.indexOf('causeLanded'))
    const departing = published.find((state) => state.pending === null)
    expect(departing?.decks.discardCount).toBe(0)
    expect(departing?.decks.discard).toBeUndefined()
    expect(departing?.decks.discardHeap).toEqual([])
    expect(published.at(-1)?.decks.discardCount).toBe(1)
    expect(published.at(-1)?.pending).toBeNull()
    expect(published.at(-1)?.aiCause).toBeUndefined()
  })

  // THE SLOT IS OCCUPIED. `pickFromDiscard` is still open while this flies, so
  // `_Board.tsx`'s `aiStanding` is rendering the AI card that demanded the pick
  // in the `effect` place. Aiming there put two cards in one rect for the whole
  // of `SHOW_HOLD`; `centre` is the place `centre.ts` names for a card the
  // system has put up for the table to read.
  it('shows the taken card at the centre, not on top of the AI card that demanded it', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    await runBeat(result.current.runTaken, takenPlan, anchors)
    const centre = anchors.centre.current?.getBoundingClientRect()
    const effect = anchors.effect.current?.getBoundingClientRect()
    expect(playedWith('drawToCenter')?.to).toMatchObject({
      left: centre?.left,
      top: centre?.top,
    })
    expect(playedWith('drawToCenter')?.to).not.toMatchObject({
      left: effect?.left,
      top: effect?.top,
    })
  })

  // The duplicate this closes: the shadow still carried the pending, so the
  // projection kept rendering the AI card at `effect` while the carrier below
  // flew away from that very rect.
  it('lets the pending go before the AI card flies home', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    const base = {
      you: { name: 'You', hand: [], release: {} },
      opponents: [],
      decks: { main: [10], events: 5, discardCount: 0 },
      selfId: 'p1',
      pending: { kind: 'pickFromDiscard', player: 'p1', options: [], source: 'ai-inside' },
      history: [],
      setup: {},
      playable: [],
      frozen: [],
    } as unknown as BoardState
    // each publish stamped with the flights already played when it happened —
    // presence alone would survive a publish made AFTER the flight
    const stamps: { pending: unknown; plays: string[] }[] = []
    await runBeat(result.current.runTaken, { ...takenPlan, homeward: 'ai-inside' }, anchors, {
      base,
      publish: (s) => stamps.push({ pending: s.pending, plays: [...playedNames()] }),
    })
    expect(playedNames()).toContain('returnToDeck')
    const cleared = stamps.find((st) => st.pending === null)
    expect(cleared).toBeDefined()
    expect(cleared?.plays).not.toContain('returnToDeck')
  })
})

// WHAT A CARD LEAVES, IT LEAVES AS IT TAKES OFF (#168): the events deck gives
// up the AI card as it rises and counts it back as it lands home; the heap gives
// up the release Inside picks as it rises.
describe('the events deck and the heap, one place at a time', () => {
  const traced = () => {
    const states: BoardState[] = []
    const publish = (state: BoardState) => {
      states.push(state)
      animationsTrace.order.push(`publish:${states.length - 1}`)
    }
    return { states, publish }
  }

  it('counts the AI card out of the events deck as it rises, and back in as it lands home', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    const { states, publish } = traced()
    await runBeat(
      result.current.run,
      {
        kind: 'aiEvent' as const,
        key: 'ai:1',
        eventId: 1,
        player: 'p1',
        pile: 0,
        trigger: 'trigger-ai',
        triggerDiscardId: 3,
        eventCard: 'ai-bad-vibe-coding',
        tail: { kind: 'none' as const },
      },
      anchors,
      { publish },
    )
    const order = callOrder()
    const out = states.findIndex((s) => s.decks.events === 4)
    const back = states.findIndex((s, i) => i > out && s.decks.events === 5)
    expect(out).toBeGreaterThanOrEqual(0)
    // off the deck before its own flight starts (the second one, after the trigger's)
    const flights = order.flatMap((step, i) => (step === 'play:drawToCenter' ? [i] : []))
    expect(order.indexOf(`publish:${out}`)).toBeLessThan(flights[1])
    expect(back).toBeGreaterThan(out)
    expect(order.indexOf(`publish:${back}`)).toBeLessThan(order.indexOf('drop:eff'))
  })

  it('takes the release Inside picks off the heap as it rises', async () => {
    const anchors = anchorsFixture()
    const { result } = renderBeat(() => useAiBeat(anchors))
    const { states, publish } = traced()
    const base = {
      you: { name: 'You', hand: [], release: {} },
      opponents: [],
      decks: {
        main: [10],
        events: 5,
        discardCount: 1,
        discardHeap: [{ uid: 'd4', card: cardById('release-frontend'), ...scatterAt(4) }],
      },
      selfId: 'p1',
      history: [],
      setup: {},
      playable: [],
      frozen: [],
    } as unknown as BoardState
    await runBeat(
      result.current.runTaken,
      {
        kind: 'takenFromDiscard' as const,
        key: 'taken:20',
        eventId: 20,
        player: 'p1',
        card: 'release-frontend',
        mine: true,
      },
      anchors,
      { base, publish },
    )
    const lifted = states.findIndex((s) => s.decks.discardHeap?.length === 0)
    expect(lifted).toBeGreaterThanOrEqual(0)
    expect(states[lifted].decks.discardCount).toBe(0)
    expect(callOrder().indexOf(`publish:${lifted}`)).toBeLessThan(
      callOrder().indexOf('play:drawToCenter'),
    )
  })
})
