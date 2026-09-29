import { cardById } from '@release/ui'
import { describe, expect, it } from 'vitest'
import type { PlayerBoardState } from '~/entities/game/board'
import type { DiscardCard } from './planBeats'
import { withoutFlown } from './withoutFlown'

const board = (): PlayerBoardState =>
  ({
    selfId: 'p1',
    you: {
      name: 'You',
      hand: [
        { uid: 'h1', card: { id: 'a' } },
        { uid: 'h2', card: { id: 'b' } },
      ],
      release: { frontend: { id: 'r1' }, backend: { id: 'r2' } },
    },
    opponents: [
      {
        id: 'p2',
        name: 'Two',
        handCount: 3,
        release: { frontend: { id: 'r3' } },
      },
    ],
    decks: { main: [1], events: 2, discardCount: 0 },
    history: [],
    setup: {},
    playable: [],
    frozen: [],
  }) as unknown as PlayerBoardState

describe('withoutFlown', () => {
  it('removes flying cards from hands, releases, and opponent seats without changing the base', () => {
    const base = board()
    const flown: DiscardCard[] = [
      { key: 'h', eventId: 1, card: 'a', source: { kind: 'hand', index: 0 } },
      {
        key: 'r',
        eventId: 2,
        card: 'r1',
        source: { kind: 'release', player: 'p1', slot: 'frontend' },
      },
      { key: 's', eventId: 3, card: 'b', source: { kind: 'seat', player: 'p2' } },
    ]

    const result = withoutFlown(base, flown)

    expect(result.you?.hand).toHaveLength(1)
    expect(result.you?.release).toEqual({ frontend: null, backend: { id: 'r2' } })
    expect(result.opponents[0]).toMatchObject({ handCount: 2, release: { frontend: { id: 'r3' } } })
    expect(result.decks).toBe(base.decks)
    expect(base.you?.hand).toHaveLength(2)
    expect(base.you?.release.frontend).toEqual({ id: 'r1' })
  })
})

it('keeps the public identity null when cards leave a seat or release', () => {
  const publicBoard = {
    ...board(),
    selfId: null,
    you: null,
    opponents: [
      { id: 'p1', name: 'One', handCount: 3, release: { frontend: cardById('release-frontend') } },
    ],
  }
  const result = withoutFlown(publicBoard, [
    { key: 'hand', eventId: 1, card: 'c1', source: { kind: 'seat', player: 'p1' } },
    {
      key: 'release',
      eventId: 2,
      card: 'r1',
      source: { kind: 'release', player: 'p1', slot: 'frontend' },
    },
  ])
  expect(result.you).toBeNull()
  expect(result.selfId).toBeNull()
  expect(result.opponents[0].handCount).toBe(2)
  expect(result.opponents[0].release.frontend).toBeNull()
})
