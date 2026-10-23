import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { mockReducedMotion } from '~/test/reducedMotion'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

it.each([2, 4, 6])('shows %i seats and no private controls for a spectator', (count) => {
  mockReducedMotion(true)
  const props = makeBoardProps()
  const actions = { onDraw: vi.fn(), onPush: vi.fn(), onPass: vi.fn(), onPlay: vi.fn() }
  const opponents = Array.from({ length: count }, (_, i) => ({
    id: `seat-${i}`,
    name: `Player ${i}`,
    handCount: 5,
    release: {},
  }))
  const { container } = render(
    <Board
      {...props}
      actions={actions}
      state={{ ...props.state, selfId: null, you: null, opponents, turn: 'seat-0' }}
    />,
  )
  for (const seat of opponents) expect(screen.getByTestId(`seat-${seat.id}`)).toBeTruthy()
  expect(screen.queryByTestId('board-you')).toBeNull()
  expect(container.querySelector('[data-hand-slot]')).toBeNull()
  fireEvent.keyDown(window, { key: ' ' })
  fireEvent.keyDown(window, { key: 'Enter' })
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
})

it('clears an active private gesture when the viewer becomes a spectator', () => {
  mockReducedMotion(true)
  const props = makeBoardProps()
  const onPlay = vi.fn()
  const { container, rerender } = render(<Board {...props} actions={{ onPlay }} />)
  const card = container.querySelector('[data-hand-slot]')
  if (!card) throw new Error('Missing player hand')
  fireEvent.mouseDown(card, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  rerender(
    <Board {...props} actions={{ onPlay }} state={{ ...props.state, selfId: null, you: null }} />,
  )
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  expect(screen.queryByTestId('board-you')).toBeNull()
  expect(container.querySelector('[data-hand-slot]')).toBeNull()
  expect(onPlay).not.toHaveBeenCalled()
})

it('keeps public Upgrade choices visible without letting the observer answer', () => {
  mockReducedMotion(true)
  const props = makeBoardProps()
  const onResolve = vi.fn()
  const { container } = render(
    <Board
      {...props}
      actions={{ onResolve }}
      state={{
        ...props.state,
        selfId: null,
        you: null,
        pending: {
          kind: 'systemUpgrade',
          phase: 'discarding',
          actor: 'p1',
          owed: ['p2'],
          source: 'operation-system-upgrade',
          sudo: false,
          thrown: [{ player: 'p1', card: { uid: 'shown', id: 'attack-bug' } }],
        },
      }}
    />,
  )
  const card = container.querySelector('[data-upgrade-card]')
  expect(card).toBeTruthy()
  if (card) fireEvent.click(card)
  expect(onResolve).not.toHaveBeenCalled()
})

// The spectator's seats stand in two rows (`Table.module.css`): a seat of the
// lower row is marked on its upper edge, facing the centre, the rest on their
// lower edge. The row is the stylesheet's own split — from the 2nd seat of 2,
// the 3rd of 3 or 4, the 4th of 5 or 6.
const LOWER_FROM: Record<number, number> = { 2: 1, 3: 2, 4: 2, 5: 3, 6: 3 }

it.each([
  2, 3, 4, 5, 6,
])('marks an attacked seat on the side facing the centre, %i seats', (count) => {
  mockReducedMotion(true)
  const props = makeBoardProps()
  const opponents = Array.from({ length: count }, (_, i) => ({
    id: `seat-${i}`,
    name: `Player ${i}`,
    handCount: 5,
    release: {},
  }))
  const board = (player: string) => (
    <Board
      {...props}
      state={{
        ...props.state,
        selfId: null,
        you: null,
        opponents,
        turn: 'seat-0',
        pending: {
          kind: 'defend',
          player,
          attacker: player === 'seat-0' ? 'seat-1' : 'seat-0',
          attackCard: 'attack-bug',
          sudo: false,
          options: [],
          openedAt: 0,
          deadline: 15_000,
          scope: 'hand',
        },
      }}
    />
  )
  const { rerender } = render(board(opponents[0].id))
  opponents.forEach((seat, i) => {
    rerender(board(seat.id))
    expect(screen.getByTestId(`seat-${seat.id}`).getAttribute('data-targeted')).toBe(
      i >= LOWER_FROM[count] ? 'above' : 'below',
    )
  })
})
