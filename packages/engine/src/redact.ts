import type { Event } from './events'
import type { PlayerId } from './state'

// `visibleTo` answers ONE question — who may see that this happened. A draw
// needs two answers: everybody at the table watches a card being taken, and
// nobody but the drawer sees its face. Encoding the second as
// `visibleTo: [drawer]` made the whole event private, so an opponent's draw
// reached other peers as nothing at all — no event to animate, only a hand
// count that ticked up.
//
// A hand transfer likewise stays public while only its two participants see
// the face. Security Bug explicitly marks the named face public.
//
// So the identity is redacted and the event survives. The rule lives HERE
// because the engine is the only party that knows which secrets exist; the
// transport applies what it is handed and never re-derives it from a payload.
export function redactFor(event: Event, viewerId: PlayerId): Event {
  if (event.type !== 'drawn' && event.type !== 'handTransfer') return event
  if (event.card === undefined) return event
  if (event.type === 'drawn' && event.player === viewerId) return event
  if (
    event.type === 'handTransfer' &&
    (event.publicCard || event.from === viewerId || event.to === viewerId)
  )
    return event
  const { card: _identity, ...open } = event
  return open
}
