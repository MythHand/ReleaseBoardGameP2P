import type { Event, PlayerId } from '@release/engine'
import { redactFor } from '@release/engine'

// The engine is the only party that knows which secrets exist, so it declares
// each event's audience on `visibleTo` (absent means public) and, where an event
// is public but one of its FIELDS is not, how to redact it. This layer reads the
// audience and applies the engine's own redaction; it never re-derives either
// answer from an event's payload.
export function forViewer(events: Event[], viewerId: PlayerId): Event[] {
  return events
    .filter((e) => e.type !== 'rejected' && (!e.visibleTo || e.visibleTo.includes(viewerId)))
    .map((e) => redactFor(e, viewerId))
}

// A rejection is diagnostic, not a move: state is referentially unchanged, its
// id is neither unique nor monotonic, and it must never enter move history. It
// goes back to whoever submitted the action and to nobody else — hence a
// separate accessor rather than a flag on forViewer.
export function rejectionsIn(events: Event[]): Event[] {
  return events.filter((e) => e.type === 'rejected')
}
