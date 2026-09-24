import { cardById } from '@release/ui'
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { BoardProps } from '~/entities/game/board'
import { mockReducedMotion } from '~/test/reducedMotion'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

afterEach(() => vi.restoreAllMocks())

const BUG_UID = 'attack-bug#0'

function props(): BoardProps {
  const base = makeBoardProps()
  const bug = cardById('attack-bug')
  if (!bug) throw new Error('Missing Bug card')
  return makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: [{ uid: BUG_UID, card: bug }] },
      turn: 'p2',
      playable: [],
      targets: {},
      comboOptions: {},
      window: null,
      pending: null,
    },
    actions: { onAttack: vi.fn(), onPlay: vi.fn() },
  })
}

function openWindow(base: BoardProps): BoardProps {
  return {
    ...base,
    state: {
      ...base.state,
      window: {
        player: 'p2',
        slot: 'frontend',
        round: 1,
        openedAt: 0,
        deadline: 15_000,
        passed: [],
        canAttackWith: [BUG_UID],
      },
    },
  }
}

function grabBug(container: HTMLElement) {
  const slot = container.querySelector<HTMLElement>(`[data-hand-slot="${BUG_UID}"]`)
  if (!slot) throw new Error('Missing Bug in hand')
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
}

it('attacks a fresh release when its window opens while Bug is being dragged', async () => {
  mockReducedMotion(true)
  const base = props()
  const { container, rerender } = render(<Board {...base} />)
  grabBug(container)

  await act(() => {
    rerender(<Board {...openWindow(base)} />)
  })
  await act(() => {
    fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  })

  expect(base.actions?.onAttack).toHaveBeenCalledExactlyOnceWith(BUG_UID, undefined)
  expect(base.actions?.onPlay).not.toHaveBeenCalled()
})

it('does not attack a release whose window closes while Bug is being dragged', async () => {
  mockReducedMotion(true)
  const base = props()
  const { container, rerender } = render(<Board {...openWindow(base)} />)
  grabBug(container)

  await act(() => {
    rerender(<Board {...base} />)
  })
  await act(() => {
    fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  })

  expect(base.actions?.onAttack).not.toHaveBeenCalled()
  expect(base.actions?.onPlay).not.toHaveBeenCalled()
})
