import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

// The Board must bind the named place geometry to its actual flight anchors.
// A CSS-only copy cannot follow changes to the shared TableCentre contract.
it.each([
  ['stage', -92, ''],
  ['cost', 92, ''],
  ['sudo', -180, '9'],
  ['attack', 0, '10'],
  ['cover', 0, '11'],
] as const)('positions the %s flight anchor through its named centre place', (name, dx, z) => {
  const { container } = render(<Board {...makeBoardProps()} />)
  const slot = container.querySelector<HTMLElement>(`[data-centre-slot="${name}"]`)
  expect(slot?.style.insetBlockStart).toBe('42%')
  expect(slot?.style.insetInlineStart).toBe('50%')
  expect(slot?.style.inlineSize).toBe('150px')
  expect(slot?.style.transform).toBe(
    dx === 0 ? 'translate(-50%, -50%)' : `translate(calc(-50% + ${dx}px), -50%)`,
  )
  expect(slot?.style.zIndex).toBe(z)
})

it.each([
  { main: [36] },
  { main: [18, 18] },
  { main: [12, 12, 12] },
])('keeps draw piles $main and omits the events pile in No AI mode', ({ main }) => {
  const props = makeBoardProps()
  const { container, getAllByText, queryByText } = render(
    <Board
      {...props}
      state={{
        ...props.state,
        setup: { ...props.state.setup, ai: 'no' },
        decks: { ...props.state.decks, main, events: 0 },
      }}
    />,
  )
  expect(getAllByText(props.copy.table.deck)).toHaveLength(main.length)
  expect(queryByText(props.copy.table.events)).toBeNull()
  expect(container.querySelector('[data-events-box]')).toBeNull()
})
