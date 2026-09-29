import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import Table from './Table'
import { makeTableProps } from './testFixture'

it.each([2, 4, 6])('renders %i seats with no local hand or action hotkeys', (count) => {
  const props = makeTableProps()
  const actions = { onDraw: vi.fn(), onPush: vi.fn(), onPass: vi.fn() }
  const opponents = Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    name: `Player ${i}`,
    handCount: 5,
    release: {},
  }))
  const { container } = render(
    <Table
      {...props}
      actions={actions}
      state={{ ...props.state, selfId: null, you: null, opponents, turn: 's0' }}
    />,
  )
  for (const seat of opponents) expect(screen.getByTestId(`seat-${seat.id}`)).toBeTruthy()
  expect(container.querySelector('[data-hand-slot]')).toBeNull()
  fireEvent.keyDown(window, { key: ' ' })
  fireEvent.keyDown(window, { key: 'Enter' })
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
})
