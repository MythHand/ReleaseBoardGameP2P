import { fireEvent, render, within } from '@testing-library/react'
import { vi } from 'vitest'
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

it('opens a panel on its own when `panel` is not supplied', () => {
  const props = makeTableProps()
  const { getByRole, getByTestId } = render(<Table {...props} />)
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(getByTestId('panel-history')).toBeTruthy()
})

it('does not update itself when `panel` is supplied', () => {
  const props = makeTableProps()
  const onPanelChange = vi.fn()
  const { getByRole, queryByTestId } = render(
    <Table {...props} panel={null} onPanelChange={onPanelChange} />,
  )
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(onPanelChange).toHaveBeenCalledWith('history')
  // Controlled: the parent did not re-render with a new panel, so nothing opened.
  expect(queryByTestId('panel-history')).toBeNull()
})

it('reports null when the active tab is clicked again', () => {
  const props = makeTableProps()
  const onPanelChange = vi.fn()
  const { getByRole } = render(<Table {...props} panel="history" onPanelChange={onPanelChange} />)
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(onPanelChange).toHaveBeenCalledWith(null)
})

it('marks an eliminated opponent with the eliminated badge and leaves the others alone', () => {
  const base = makeTableProps()
  // Target index 1, not 0: the retired implementation was `i === 0`, so a
  // regression back to index-based selection would keep an index-0 target
  // green. Index 0 (`alive`) must stay the untouched live control.
  const [alive, out] = base.state.opponents
  const opponents = base.state.opponents.map((o) =>
    o.id === out.id ? { ...o, eliminated: true } : o,
  )
  const { getByTestId } = render(<Table {...base} state={{ ...base.state, opponents }} />)
  // The comparison against a live sibling is what makes this falsifiable — the
  // eliminated seat shows the eliminated badge and no card count; the live
  // sibling shows its (non-zero, per the mock) card count and no badge.
  expect(within(getByTestId(`seat-${out.id}`)).getByText(base.copy.seat.eliminated)).toBeTruthy()
  expect(within(getByTestId(`seat-${out.id}`)).queryByTestId('hand-count')).toBeNull()
  const aliveSeat = within(getByTestId(`seat-${alive.id}`))
  expect(aliveSeat.queryByText(base.copy.seat.eliminated)).toBeNull()
  expect(aliveSeat.getByTestId('hand-count').textContent).not.toBe('0')
})

it('shows the reconnect overlay from room.connection, not from a view flag', () => {
  const base = makeTableProps()
  const { getByText } = render(
    <Table {...base} room={{ ...base.room, connection: 'reconnecting' }} />,
  )
  expect(getByText(base.copy.reconnect.label)).toBeTruthy()
})

it('shows the youEliminated badge from state.you.eliminated', () => {
  const base = makeTableProps()
  const { getByText } = render(
    <Table {...base} state={{ ...base.state, you: { ...base.state.you, eliminated: true } }} />,
  )
  expect(getByText(base.copy.table.youEliminated)).toBeTruthy()
})

it('marks an opponent listed in room.disconnected and leaves the others alone', () => {
  const base = makeTableProps()
  // Same index-1 rationale as the elimination test above: index 0 stays the
  // untouched live control so an `i === 0` regression cannot pass this test.
  const [alive, out] = base.state.opponents
  const { getByTestId } = render(
    <Table {...base} room={{ ...base.room, disconnected: [out.id] }} />,
  )
  expect(within(getByTestId(`seat-${out.id}`)).getByText(base.copy.seat.disconnected)).toBeTruthy()
  expect(
    within(getByTestId(`seat-${alive.id}`)).queryByText(base.copy.seat.disconnected),
  ).toBeNull()
})
