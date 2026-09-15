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
      send: (items: unknown[]) => animationsTrace.exitSpy(items),
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
  expect(animationsTrace.played).toEqual(['playToCenter'])
  expect(animationsTrace.params[0]).toMatchObject({ to: { left: 400, top: 300, width: 150 } })
  expect(published.at(-1)?.opponents[0].handCount).toBe(sudo ? 1 : 2)
  expect(result.current.standing).toBe(true)
  expect(view.container.querySelector('[data-public-operation]')).not.toBeNull()
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
  expect(exited.published.at(-1)?.decks.discardHeap?.map((c) => c.uid)).toEqual(
    sudo ? ['d3', 'd4'] : ['d3'],
  )
  expect(anchors.exitSpy.mock.calls[0][0]).toHaveLength(sudo ? 2 : 1)
  expect(result.current.standing).toBe(false)
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
