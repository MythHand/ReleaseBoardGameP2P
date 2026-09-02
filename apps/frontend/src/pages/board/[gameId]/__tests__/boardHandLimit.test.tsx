// The hand limit on the board (#104): while the engine owes us the decision,
// the fan is the picker. A pull takes a cell in the grid; at the limit the fan
// refuses the drop and the kit glides the card home; the last card dispatches
// one RESOLVE carrying every uid.
//
// Reduced motion defaults ON here: most assertions are about what the board
// DID rather than about elapsed animation. The concurrency test turns it off
// and parks both carriers before landing, so the promise that one flight never
// blocks the next pull is tested directly.
import type { Event } from '@release/engine'
import type { CardData, TableActions } from '@release/ui'
import { cardById } from '@release/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

const motion = vi.hoisted(() => ({ reduced: true }))
const flights = vi.hoisted(() => ({ release: [] as (() => void)[] }))

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...actual,
    useFlyer: () => ({
      overlay: [],
      raise: () =>
        new Promise<HTMLDivElement[]>((resolve) => {
          flights.release.push(() => resolve([document.createElement('div')]))
        }),
      elOf: () => null,
      pin: () => {},
      glide: () => Promise.resolve(),
      patch: () => {},
      drop: () => {},
    }),
  }
})

// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const bug = cardById('attack-bug')!
// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const debugger_ = cardById('protection-debugger')!
// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const hotfix = cardById('defense-hotfix')!

const HAND: { uid: string; card: CardData }[] = [
  { uid: 'attack-bug#0', card: bug },
  { uid: 'protection-debugger#0', card: debugger_ },
  { uid: 'defense-hotfix#0', card: hotfix },
]

function boardOverLimit(
  excess: number,
  actions: TableActions = {},
  events: Event[] = [],
  pending = true,
) {
  const base = makeBoardProps()
  return (
    <Board
      {...makeBoardProps({
        state: {
          ...base.state,
          you: { ...base.state.you, hand: HAND },
          turn: base.state.selfId,
          hasDrawn: true,
          pending: pending
            ? {
                kind: 'handLimit',
                player: base.state.selfId,
                excess,
                options: HAND.map((c) => c.uid),
              }
            : null,
        },
        actions,
        intro:
          events.length > 0 ? { gameId: null, view: null, events, onDone: () => {} } : undefined,
      })}
    />
  )
}

// The same drag the kit's own contract expects: down on the slot, past Hand's
// 6px threshold, released well outside the hand's band.
async function pullCardFromFan(index: number) {
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
}

const fanSlots = () => document.querySelectorAll('[data-hand-slot]').length
const filledCells = () => document.querySelectorAll('[data-grid-card]').length

function rejectedHandLimit(cards: string[]): Event {
  return {
    id: 9,
    type: 'rejected',
    action: {
      type: 'RESOLVE',
      player: 'you',
      choice: { kind: 'handLimit', cards },
      at: 0,
    },
    reason: 'illegal',
  }
}

it('a pull under the limit takes a cell in the grid', async () => {
  render(boardOverLimit(2))
  await pullCardFromFan(0)
  expect(screen.getByTestId('board-discard-grid')).toBeTruthy()
  // the grid was sized for the WHOLE excess before the first card moved
  expect(document.querySelectorAll('[data-grid-cell]')).toHaveLength(2)
  expect(filledCells()).toBe(1)
  expect(fanSlots()).toBe(HAND.length - 1)
})

it('refuses the drop once the limit is met and the fan keeps the card', async () => {
  render(boardOverLimit(1))
  await pullCardFromFan(0)
  expect(fanSlots()).toBe(HAND.length - 1)
  // one card was owed and one is placed: this pull is refused, and the kit
  // settles the card back into its own slot (Hand.tsx's own glide)
  await pullCardFromFan(0)
  expect(fanSlots()).toBe(HAND.length - 1)
  expect(filledCells()).toBe(1)
})

it('dispatches one RESOLVE with exactly the excess when the last cell fills', async () => {
  const onResolve = vi.fn()
  render(boardOverLimit(2, { onResolve }))
  await pullCardFromFan(0)
  expect(onResolve).not.toHaveBeenCalled()
  await pullCardFromFan(0)
  expect(onResolve).toHaveBeenCalledTimes(1)
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'handLimit',
    cards: ['attack-bug#0', 'protection-debugger#0'],
  })
})

it('accepts another pull while the previous card is still in flight', async () => {
  motion.reduced = false
  flights.release = []
  const onResolve = vi.fn()
  render(boardOverLimit(2, { onResolve }))

  await pullCardFromFan(0)
  expect(flights.release).toHaveLength(1)
  await pullCardFromFan(0)

  // Both cards left the fan even though neither carrier has landed. A
  // single-flight guard would leave one card behind and one pending resolver.
  expect(flights.release).toHaveLength(2)
  expect(fanSlots()).toBe(HAND.length - 2)
  expect(onResolve).not.toHaveBeenCalled()

  await act(async () => {
    for (const land of flights.release.splice(0)) land()
    await new Promise((r) => setTimeout(r, 80))
  })
  expect(onResolve).toHaveBeenCalledTimes(1)
  motion.reduced = true
})

it('unlocks and returns the cards when the engine rejects the RESOLVE', async () => {
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(1, actions))
  await pullCardFromFan(0)
  expect(filledCells()).toBe(1)
  expect(fanSlots()).toBe(HAND.length - 1)

  view.rerender(boardOverLimit(1, actions, [rejectedHandLimit(['attack-bug#0'])]))
  await act(async () => {})
  expect(filledCells()).toBe(0)
  expect(fanSlots()).toBe(HAND.length)
})

it('clears the local grid when reduced motion skips the beat', async () => {
  const view = render(boardOverLimit(1))
  await pullCardFromFan(0)
  expect(filledCells()).toBe(1)

  // The accepted projection clears the pending. With reduced motion the queue
  // runs no hand-limit beat, so the hook's own catch-up is the only release.
  view.rerender(boardOverLimit(1, {}, [], false))
  await act(async () => {})
  expect(screen.queryByTestId('board-discard-grid')).toBeNull()
  expect(fanSlots()).toBe(HAND.length)
})

// Bad Vibe-Coding's own case: one card, mid-turn, no turn ending behind it.
it('plays the same gesture for a mid-turn single card', async () => {
  const onResolve = vi.fn()
  render(boardOverLimit(1, { onResolve }))
  await pullCardFromFan(0)
  expect(onResolve).toHaveBeenCalledWith({ kind: 'handLimit', cards: ['attack-bug#0'] })
})

it('asks for the discard in the ask line and offers no panel', () => {
  render(boardOverLimit(2))
  const copy = makeBoardProps().copy
  const ask = screen.getByTestId('board-ask')
  expect(ask.getAttribute('data-shown')).toBe('true')
  expect(ask.textContent).toBe(copy.table.askHandLimit)
  // the cards on the table are the question — a panel would ask it twice, and
  // would cover the grid it is asking about
  expect(screen.queryByText(copy.pending.handLimit.prompt)).toBeNull()
})
