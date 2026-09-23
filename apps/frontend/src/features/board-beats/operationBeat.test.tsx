import { cardById } from '@release/ui'
import { act } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardState, StagedHandoff } from '~/entities/game/board'
import { useOperationBeat } from './operationBeat'
import { anchorsFixture, animationsTrace, renderBeat, runBeat } from './testing'

vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    play: (name: string, el: Element | null, params?: Record<string, unknown>) => {
      animationsTrace.played.push(name)
      animationsTrace.params.push(params)
      return real.play(name, el, params)
    },
    useDiscardExit: () => ({
      overlay: [],
      send: (items: unknown[], takeOff?: (() => void) | null) => {
        takeOff?.()
        return animationsTrace.exitSpy(items)
      },
      reset: () => {},
    }),
  }
})
const placed = (sudo = false) => ({
  kind: 'operationPlaced' as const,
  key: 'operation:1',
  eventId: 1,
  player: 'p2',
  card: 'operation-git-branch',
  sudo,
  spent: [
    { eventId: 3, card: 'operation-git-branch' },
    ...(sudo ? [{ eventId: 4, card: 'support-sudo' }] : []),
  ],
})
const base = {
  you: { name: 'One', hand: [], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  selfId: 'p1',
  decks: { main: [10], events: 5, discardCount: 0 },
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState
it.each([
  false,
  true,
])('keeps public operation at measured centre until effects finish (sudo=%s)', async (sudo) => {
  const anchors = anchorsFixture()
  const { result, view } = renderBeat(() => useOperationBeat(anchors))
  const { published } = await runBeat(result.current.runPlaced, placed(sudo), anchors, { base })
  // Paid for with a sudo, TWO cards travel and land in the two places of the
  // centre's row — the sudo enhances the card beside it and stays its own card,
  // so there is no pair to carry. Alone, one card lands in the middle.
  expect(animationsTrace.played).toEqual(sudo ? ['playToCenter', 'playToCenter'] : ['playToCenter'])
  expect(animationsTrace.params[0]).toMatchObject(
    sudo ? { to: { top: 300, width: 150 } } : { to: { left: 400, top: 300, width: 150 } },
  )
  // the row is centred on the middle the single card would have taken
  if (sudo) {
    const lands = animationsTrace.params.map((p) => (p?.to as { left: number }).left)
    expect((lands[0] + lands[1]) / 2).toBeCloseTo(400)
  }
  expect(published.at(-1)?.opponents[0].handCount).toBe(sudo ? 1 : 2)
  expect(result.current.standing).toBe(true)
  // landed: the table draws it now — the carrier (the flight layer) is down
  expect(result.current.landed).toEqual({ card: 'operation-git-branch', sudo })
  expect(view.container.querySelector('[data-public-operation]')).toBeNull()
  expect(anchors.exitSpy).not.toHaveBeenCalled()
  const exited = await runBeat(
    result.current.runExit,
    { kind: 'operationExit', key: 'out' },
    anchors,
    {
      base: published.at(-1),
    },
  )
  expect(exited.published.at(-1)?.decks.discardCount).toBe(sudo ? 2 : 1)
  // the support half (d4) joins the heap UNDER the card it paid for (d3) — the
  // layer it had on the table, and the same order the projection's own fold
  // keeps, so nothing swaps when this publish hands over to `live`
  expect(exited.published.at(-1)?.decks.discardHeap?.map((c) => c.uid)).toEqual(
    sudo ? ['d4', 'd3'] : ['d3'],
  )
  expect(anchors.exitSpy.mock.calls[0][0]).toHaveLength(sudo ? 2 : 1)
  expect(result.current.standing).toBe(false)
  expect(result.current.landed).toBeNull()
})
it('adopts a local stage without replaying entrance or leaving its hand copy', async () => {
  const anchors = anchorsFixture()
  const handoff: StagedHandoff = {
    mainUid: 'branch',
    el: document.createElement('div'),
    release: vi.fn(),
  }
  const { result } = renderBeat(() => useOperationBeat(anchors, { current: handoff }))
  const mine = {
    ...base,
    you: {
      ...base.you,
      hand: [
        {
          uid: 'branch',
          card: cardById('operation-git-branch') as NonNullable<ReturnType<typeof cardById>>,
        },
      ],
    },
  }
  const { published } = await runBeat(
    result.current.runPlaced,
    { ...placed(), player: 'p1' },
    anchors,
    { base: mine },
  )
  expect(animationsTrace.played).toEqual([])
  expect(handoff.release).toHaveBeenCalledOnce()
  expect(published.at(-1)?.you.hand).toEqual([])
  await act(async () => result.current.reset())
  expect(result.current.standing).toBe(false)
})

// THE HAND-OVER IS THE SAME EXIT, and that means both halves of it: the cards
// go into the heap, and the card stops standing. It is the second exit this
// beat has — the centre it rests in is sometimes emptied by another beat (the
// System Upgrade's row leaves with it), and that one used to fly the card and
// file nothing. The heap is then one card short of its own count, which the
// discard answers by standing a place-holder on top whose pose follows the
// count: every later landing re-posed it, and the whole discard looked as if
// it were shuffling itself (owner, 23.09).
it.each([false, true])('files the handed-over card into the heap too (sudo=%s)', async (sudo) => {
  const anchors = anchorsFixture()
  const { result } = renderBeat(() => useOperationBeat(anchors))
  const { published } = await runBeat(result.current.runPlaced, placed(sudo), anchors, { base })
  const standing = published.at(-1) as BoardState
  const ctx = { base: standing, publish: () => {} }
  const over = result.current.handOver(ctx)
  if (!over) throw new Error('nothing handed over')
  act(() => {
    over.takeOff()
    over.settle()
  })
  // the same heap the beat's own exit builds: the support under the card it
  // paid for, and the count moved with it
  expect(ctx.base.decks.discardHeap?.map((c) => c.uid)).toEqual(sudo ? ['d4', 'd3'] : ['d3'])
  expect(ctx.base.decks.discardCount).toBe(sudo ? 2 : 1)
  // …and the card is off the table, which is what the settle is FOR
  expect(result.current.standing).toBe(false)
  expect(result.current.landed).toBeNull()
})

// A card with nothing to fly still has to leave. The only thing that ever takes
// it off the table is this settle, so a hand-over that answers "nothing" leaves
// it standing at the centre long after its effect is over.
it('hands over an exit even when there is nothing to carry', async () => {
  const anchors = anchorsFixture()
  const { result } = renderBeat(() => useOperationBeat(anchors))
  const { published } = await runBeat(result.current.runPlaced, placed(false), anchors, { base })
  // the card IS standing, and by the time the centre is emptied there is
  // nothing left to measure it against
  expect(result.current.standing).toBe(true)
  anchors.centre.current = null
  const ctx = { base: (published.at(-1) ?? base) as BoardState, publish: () => {} }
  const over = result.current.handOver(ctx)
  expect(over).not.toBeNull()
  act(() => {
    over?.takeOff()
    over?.settle()
  })
  expect(result.current.standing).toBe(false)
})
