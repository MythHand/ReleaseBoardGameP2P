import { describe, expect, it } from 'vitest'
import type { Event } from './events'
import { redactFor } from './redact'

const drawn = (over: Partial<Extract<Event, { type: 'drawn' }>> = {}): Event =>
  ({
    id: 7,
    type: 'drawn',
    player: 'p1',
    card: 'attack-bug',
    pile: 0,
    deckSize: 39,
    ...over,
  }) as Event

describe('redactFor', () => {
  it('keeps the card for the player who drew it', () => {
    const own = drawn()
    expect(redactFor(own, 'p1')).toBe(own)
  })

  // The point of the whole change: the DRAW survives for everyone, only the
  // identity goes. Before this, the event was dropped and an opponent's draw
  // was invisible to every other peer.
  it('strips the card for everyone else, and keeps the draw itself', () => {
    const seen = redactFor(drawn(), 'p2') as Extract<Event, { type: 'drawn' }>
    expect(seen.card).toBeUndefined()
    expect(seen).toEqual({ id: 7, type: 'drawn', player: 'p1', pile: 0, deckSize: 39 })
  })

  // A trigger is turned up in front of everybody, so its `drawn` never carried
  // a card to begin with — there is nothing here to hide.
  it('leaves a trigger draw alone', () => {
    const trigger = drawn({ card: undefined })
    expect(redactFor(trigger, 'p2')).toBe(trigger)
  })

  it('leaves every other event untouched', () => {
    const revealed = { id: 8, type: 'revealed', player: 'p1', card: 'trigger-error-503' } as Event
    expect(redactFor(revealed, 'p2')).toBe(revealed)
  })
})
