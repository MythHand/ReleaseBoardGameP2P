import type { Event, PlayerId } from '@release/engine'

// The engine is the only party that knows which secrets exist, so it declares
// each event's audience on `visibleTo` (absent means public). This layer reads
// that field and never re-derives the answer from an event's payload.
export function forViewer(events: Event[], viewerId: PlayerId): Event[] {
  return events.filter(
    (e) => e.type !== 'rejected' && (!e.visibleTo || e.visibleTo.includes(viewerId)),
  )
}

// A rejection is diagnostic, not a move: state is referentially unchanged, its
// id is neither unique nor monotonic, and it must never enter move history. It
// goes back to whoever submitted the action and to nobody else — hence a
// separate accessor rather than a flag on forViewer.
export function rejectionsIn(events: Event[]): Event[] {
  return events.filter((e) => e.type === 'rejected')
}
