import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import type { BoardState, CentreOperation } from './types'

// AN OPERATION STANDS AT THE CENTRE for as long as its effect is being resolved
// (a pick from the discard, a row to reorder, the answers to a System Upgrade).
// It is a fact of the table, so the projection answers it — every board, a
// rebuilt one included, reads it from here, and the beats move it through
// `cardPlace` like any other card.
//
// The engine banks the operation's own cards the moment it is played, so the
// heap already counts them while they stand. Which `discarded` events they lie
// on is read off the feed: the play that opened this pending, and the first
// `effect` discard of that card by that player after it, with its Sudo right
// behind it.

function lastEventIndex(events: Event[], matches: (event: Event) => boolean): number {
  for (let i = events.length - 1; i >= 0; i--) if (matches(events[i])) return i
  return -1
}

export function standingOperation(
  pending: BoardState['pending'],
  events: Event[],
): CentreOperation | null {
  if (!pending || !('source' in pending) || !pending.source) return null
  const main = cardById(pending.source)
  if (main?.category !== 'operation') return null
  const player = 'actor' in pending ? pending.actor : pending.player
  const spentBy = (e: Event) =>
    e.type === 'discarded' && e.reason === 'effect' && e.player === player && e.card === main.id
  const opened = lastEventIndex(
    events,
    (e) => e.type === 'operationPlayed' && e.player === player && e.card === main.id,
  )
  const first =
    opened >= 0
      ? events.findIndex((e, i) => i > opened && spentBy(e))
      : lastEventIndex(events, spentBy)
  const spent = (first >= 0 ? events.slice(first, first + 2) : []).flatMap((e, i) =>
    e.type === 'discarded' &&
    e.reason === 'effect' &&
    e.player === player &&
    (i === 0 ? e.card === main.id : e.card === 'support-sudo')
      ? [{ eventId: e.id, card: e.card }]
      : [],
  )
  const sudo =
    spent.some((c) => c.card === 'support-sudo') || ('sudo' in pending && pending.sudo === true)
  return { card: main.id, sudo, spent }
}
