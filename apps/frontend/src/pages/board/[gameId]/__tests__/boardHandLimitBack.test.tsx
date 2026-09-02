// Carry-back (#104): the grid is a decision in progress. A card in it can be
// pressed and carried back into the fan — its cell is freed for the next pull,
// and the count still adds up, because the grid was sized for the whole excess.
//
// Reduced motion defaults ON: the movement is covered by the recipe and the
// story; what this suite pins is the bookkeeping, which must be identical
// either way. One handoff assertion turns it off to prove carrier ownership.
import type { CardData, TableActions } from '@release/ui'
import { cardById } from '@release/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

const motion = vi.hoisted(() => ({ reduced: true }))

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }))

// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const bug = cardById('attack-bug')!
// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const debugger_ = cardById('protection-debugger')!

const HAND: { uid: string; card: CardData }[] = [
  { uid: 'attack-bug#0', card: bug },
  { uid: 'protection-debugger#0', card: debugger_ },
]

function boardOverLimit(excess: number, actions: TableActions = {}) {
  const base = makeBoardProps()
  return (
    <Board
      {...makeBoardProps({
        state: {
          ...base.state,
          you: { ...base.state.you, hand: HAND },
          turn: base.state.selfId,
          hasDrawn: true,
          pending: {
            kind: 'handLimit',
            player: base.state.selfId,
            excess,
            options: HAND.map((c) => c.uid),
          },
        },
        actions,
      })}
    />
  )
}

async function pullCardFromFan(index: number) {
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
}

// press the card in its cell, drag it over the fan, release
async function carryBack(slot: number) {
  const cell = document.querySelector<HTMLElement>(`[data-grid-cell="${slot}"] [data-grid-card]`)
  if (!cell) throw new Error('no card in that cell')
  const hand = document.querySelector<HTMLElement>('[class*="handWrap"]')
  const box = hand?.getBoundingClientRect()
  const y = (box?.top ?? 0) + 10
  fireEvent.mouseDown(cell, { clientX: 100, clientY: 100 })
  fireEvent.mouseMove(window, { clientX: 120, clientY: y })
  fireEvent.mouseUp(window, { clientX: 120, clientY: y })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700))
  })
}

const fanSlots = () => document.querySelectorAll('[data-hand-slot]').length
const filledCells = () => document.querySelectorAll('[data-grid-card]').length

it('a card carried back to the hand leaves the grid and returns to the fan', async () => {
  render(boardOverLimit(2))
  await pullCardFromFan(0)
  expect(filledCells()).toBe(1)
  expect(document.querySelector('[data-grid-card]')?.getAttribute('data-grid-card')).toBe(
    'attack-bug#0',
  )
  expect(fanSlots()).toBe(HAND.length - 1)
  await carryBack(0)
  expect(filledCells()).toBe(0)
  expect(fanSlots()).toBe(HAND.length)
  // the grid is still open — it was sized for the whole excess, and the card
  // that came back will have to be given up again
  expect(screen.getByTestId('board-discard-grid')).toBeTruthy()
})

it('frees the cell it left, so the next pull takes that one back', async () => {
  render(boardOverLimit(2))
  await pullCardFromFan(0)
  await carryBack(0)
  await pullCardFromFan(0)
  // cell 0 again — the claimed cells are a SET, not a running count
  expect(document.querySelector('[data-grid-cell="0"] [data-grid-card]')).toBeTruthy()
  expect(filledCells()).toBe(1)
})

it('does not fill and resolve the grid while a card is being carried back', async () => {
  const onResolve = vi.fn()
  render(boardOverLimit(2, { onResolve }))
  await pullCardFromFan(0)

  const cell = document.querySelector<HTMLElement>('[data-grid-cell="0"] [data-grid-card]')
  if (!cell) throw new Error('no card in that cell')
  fireEvent.mouseDown(cell, { clientX: 100, clientY: 100 })

  // A second pointer path cannot fill the vacancy while the first card's
  // carrier owns it. Its mouse-up also sends the carried card back to its cell.
  await pullCardFromFan(0)
  expect(onResolve).not.toHaveBeenCalled()
  expect(filledCells()).toBe(1)
  expect(fanSlots()).toBe(HAND.length - 1)
})

it('hands the card from the cursor carrier to the arrival before showing it in the fan', async () => {
  motion.reduced = false
  try {
    render(boardOverLimit(2))
    await pullCardFromFan(0)

    const cell = document.querySelector<HTMLElement>('[data-grid-cell="0"] [data-grid-card]')
    if (!cell) throw new Error('no card in that cell')
    const hand = document.querySelector<HTMLElement>('[class*="handWrap"]')
    const y = (hand?.getBoundingClientRect().top ?? 0) + 10
    fireEvent.mouseDown(cell, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 120, clientY: y })
    fireEvent.mouseUp(window, { clientX: 120, clientY: y })

    // The source and cursor carrier have gone, but the arrival owns the card;
    // rendering the fan copy now would duplicate it for the whole flight.
    expect(fanSlots()).toBe(HAND.length - 1)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })
    expect(fanSlots()).toBe(HAND.length)
  } finally {
    motion.reduced = true
  }
})
