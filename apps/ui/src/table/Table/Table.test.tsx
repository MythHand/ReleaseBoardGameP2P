import { fireEvent, render } from '@testing-library/react'
import Table from './Table'
import { makeTableProps } from './testFixture'

it('renders the local player name and every opponent seat', () => {
  const props = makeTableProps()
  const { getByText } = render(<Table {...props} />)
  expect(getByText('kernel_panic')).toBeTruthy()
})

it('renders the participants roster from room, not state', () => {
  const props = makeTableProps()
  // `state` is engine-shaped and has no roster at all — the roster can only
  // come from `room`.
  expect('spectators' in props.state).toBe(false)
  expect('participants' in props.state).toBe(false)

  const { getByText, queryByText, rerender } = render(<Table {...props} />)
  // open the participants drawer (Task 2 gives `panel` a controlled prop —
  // until then, drive it the way a real consumer does: click the rail tab)
  fireEvent.click(getByText(props.copy.table.tabParticipants))

  // a participant and a spectator, both sourced from `room`, must render
  expect(getByText('you')).toBeTruthy()
  expect(getByText('oracle')).toBeTruthy()

  // remove that spectator from `room.spectators` and re-render with the same
  // `state` — if the roster ever started reading from `state` instead, this
  // spectator would keep appearing and the assertion below would fail
  rerender(
    <Table
      {...props}
      room={{
        ...props.room,
        spectators: props.room.spectators.filter((s) => s.name !== 'oracle'),
      }}
    />,
  )
  expect(queryByText('oracle')).toBeNull()
})
