import type { Sync } from './link'

// Local session state, never sent on the wire. The provider outlives Board,
// so it must retain every batch even before a page mounts or React commits.
export interface SyncSnapshot extends Sync {
  restoredThrough?: number
  // Refusals have repeating IDs and are never part of the persisted history.
  rejections?: Sync['events']
}

export function accumulateSync(previous: SyncSnapshot | null, incoming: Sync): SyncSnapshot {
  const received = incoming.events.filter((event) => event.type !== 'rejected')
  const byId = new Map(previous?.events.map((event) => [event.id, event]))
  for (const event of received) byId.set(event.id, event)
  return {
    view: incoming.view,
    rejections: [
      ...(previous?.rejections ?? []),
      ...incoming.events.filter((event) => event.type === 'rejected'),
    ],
    events: [...byId.values()].sort((a, b) => a.id - b.id),
    restoredThrough: Math.max(
      previous?.restoredThrough ?? 0,
      incoming.resync ? (received.at(-1)?.id ?? 0) : 0,
    ),
  }
}
