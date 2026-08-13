import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import { describe, expect, it } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { planBeats } from './planBeats'

const card = (id: string) =>
  cardById(id) ?? { id, name: id, category: 'attack', deck: 'base', art: '', tags: [], qty: 0 }

const boardBefore = (over: Partial<BoardState> = {}): BoardState =>
  ({
    you: {
      name: 'You',
      hand: [
        { uid: 'u1', card: card('attack-bug') },
        { uid: 'u2', card: card('protection-debugger') },
      ],
      release: { frontend: card('release-frontend') },
    },
    opponents: [
      { id: 'p2', name: 'Two', handCount: 3, release: { backend: card('release-backend') } },
    ],
    decks: { main: 10, events: 5, discardCount: 0 },
    selfId: 'p1',
    history: [],
    setup: {},
    playable: [],
    frozen: [],
    ...over,
  }) as BoardState

const discarded = (id: number, over: Partial<Extract<Event, { type: 'discarded' }>> = {}): Event =>
  ({ id, type: 'discarded', player: 'p1', card: 'attack-bug', reason: 'effect', ...over }) as Event

describe('planBeats', () => {
  it('yields nothing for a batch with no choreography', () => {
    const events: Event[] = [
      { id: 1, type: 'turnStarted', player: 'p1', index: 0 },
      { id: 2, type: 'passed', player: 'p1' },
    ]
    expect(planBeats(events, boardBefore())).toEqual([])
  })

  it('flies the player’s own discard from its slot in the fan', () => {
    const [beat] = planBeats([discarded(4)], boardBefore())
    expect(beat.cards).toEqual([
      { key: 'd4', eventId: 4, card: 'attack-bug', source: { kind: 'hand', index: 0 } },
    ])
  })

  // The step's own rule: cards leave one by one but ALL AT ONCE. A hand-limit
  // discard of three is one gesture, not three.
  it('puts every discard of one batch in a single beat', () => {
    const events = [
      discarded(4, { reason: 'handLimit' }),
      discarded(5, { card: 'protection-debugger', reason: 'handLimit' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats).toHaveLength(1)
    expect(beats[0].cards.map((c) => c.key)).toEqual(['d4', 'd5'])
    expect(beats[0].key).toBe('discard:4')
  })

  it('claims each hand slot once when two copies of a card go out together', () => {
    const state = boardBefore({
      you: {
        name: 'You',
        hand: [
          { uid: 'u1', card: card('attack-bug') },
          { uid: 'u2', card: card('attack-bug') },
        ],
        release: {},
      },
    } as Partial<BoardState>)
    const [beat] = planBeats([discarded(4), discarded(5)], state)
    expect(beat.cards.map((c) => c.source)).toEqual([
      { kind: 'hand', index: 0 },
      { kind: 'hand', index: 1 },
    ])
  })

  it('flies a destroyed card out of the release slot it stood in', () => {
    const [beat] = planBeats(
      [discarded(4, { card: 'release-frontend', reason: 'destroyed' })],
      boardBefore(),
    )
    expect(beat.cards[0].source).toEqual({ kind: 'release', player: 'p1', slot: 'frontend' })
  })

  it('flies an opponent’s destroyed release out of their own slot', () => {
    const [beat] = planBeats(
      [discarded(4, { player: 'p2', card: 'release-backend', reason: 'destroyed' })],
      boardBefore(),
    )
    expect(beat.cards[0].source).toEqual({ kind: 'release', player: 'p2', slot: 'backend' })
  })

  it('flies an opponent’s hand discard from their seat', () => {
    const [beat] = planBeats([discarded(4, { player: 'p2' })], boardBefore())
    expect(beat.cards[0].source).toEqual({ kind: 'seat', player: 'p2' })
  })

  // THE UNDECIDED CASE. The rule for a beat whose target is already gone is not
  // settled (docs/animations/backlog.md), so nothing is invented here: a card
  // with no source is simply not flown, exactly like an event with no
  // choreography at all. It still reaches the discard, because the projection
  // puts it there — the animation is what is skipped, never the outcome.
  it('drops a card whose source is not on the board, rather than guessing one', () => {
    const beats = planBeats([discarded(4, { card: 'attack-ddos' })], boardBefore())
    expect(beats).toEqual([])
  })

  it('keeps the cards it can aim when one of a batch has no source', () => {
    const [beat] = planBeats(
      [discarded(4, { card: 'attack-ddos' }), discarded(5, { card: 'attack-bug' })],
      boardBefore(),
    )
    expect(beat.cards.map((c) => c.key)).toEqual(['d5'])
  })
})
