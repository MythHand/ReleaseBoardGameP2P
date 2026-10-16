import type { Event } from '@release/engine'
import { act, render, waitFor } from '@testing-library/react'
import { assert, expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => false }))
const flight = vi.hoisted(() => ({ finish: null as (() => void) | null }))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    useDiscardExit: () => ({
      overlay: [],
      reset() {},
      FLIGHT_MS: 420,
      send: () =>
        new Promise<void>((resolve) => {
          flight.finish = resolve
        }),
    }),
  }
})

it('does not acknowledge a batched non-host turn until its real Board queue presents the latest state', async () => {
  const base = makeBoardProps()
  assert(base.state.opponents.length >= 2)
  const [first, second] = base.state.opponents
  const seen: number[] = []
  const id = { gameId: 'g', incarnation: 'host', revision: 1 }
  const onPresented = (value: { revision: number }) => seen.push(value.revision)
  const before = { ...base.state, turn: first.id }
  const playback = { events: [] as Event[], restoredThrough: 0, presentation: id, onPresented }
  const view = render(<Board {...base} state={before} playback={playback} />)
  await waitFor(() => expect(seen).toEqual([1]))
  const discarded: Event = {
    id: 1,
    type: 'discarded',
    player: first.id,
    card: 'attack-bug',
    reason: 'effect',
  }
  const after = {
    ...before,
    turn: second.id,
    decks: { ...before.decks, discardCount: before.decks.discardCount + 1 },
  }
  view.rerender(
    <Board
      {...base}
      state={after}
      playback={{ ...playback, events: [discarded], presentation: { ...id, revision: 2 } }}
    />,
  )
  await waitFor(() => assert(flight.finish))
  expect(seen).toEqual([1])
  const latest = { ...after, turn: before.selfId }
  view.rerender(
    <Board
      {...base}
      state={latest}
      playback={{
        ...playback,
        events: [discarded, { id: 2, type: 'turnStarted', player: before.selfId, index: 2 }],
        presentation: { ...id, revision: 3 },
      }}
    />,
  )
  expect(seen).toEqual([1])
  await act(async () => {
    flight.finish?.()
    await Promise.resolve()
  })
  await waitFor(() => expect(seen).toEqual([1, 3]))
})
