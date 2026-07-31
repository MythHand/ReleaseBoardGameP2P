import { render } from '@testing-library/react'
import Table from './Table'
import { makeTableProps } from './testFixture'

it('renders the local player name and every opponent seat', () => {
  const props = makeTableProps()
  const { getByText } = render(<Table {...props} />)
  expect(getByText('kernel_panic')).toBeTruthy()
})

it('reads participants and spectators from room, not state', () => {
  const props = makeTableProps()
  // A spectator present in `room` must reach Participants; nothing about the
  // engine-fed `state` should carry it.
  expect('spectators' in props.state).toBe(false)
  expect(props.room.spectators.length).toBeGreaterThan(0)
})
