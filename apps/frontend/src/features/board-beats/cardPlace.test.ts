import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { describe, expect, it, vi } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { liftOff, setDown, withCard, withoutCard } from './cardPlace'

// One card, one place (#168): a place is taken off — or put on — every field the
// board draws it from, and the two moments share one run with the carrier.

const c = (id: string) => cardById(id) as NonNullable<ReturnType<typeof cardById>>

const board = (over: Partial<BoardState> = {}): BoardState =>
  ({
    selfId: 'p1',
    you: {
      name: 'You',
      hand: [
        { uid: 'bug#1', card: c('attack-bug') },
        { uid: 'sudo#1', card: c('support-sudo') },
      ],
      release: { frontend: c('release-frontend') },
      support: { frontend: c('support-code-review') },
      releaseUid: { frontend: 'fe#1' },
    },
    opponents: [
      { id: 'p2', name: 'Two', handCount: 3, release: { backend: c('release-backend') } },
    ],
    decks: { main: [5, 2], events: 4, discardCount: 0, discardHeap: [] },
    shown: [
      { player: 'p1', uid: 'bug#1', card: c('attack-bug') },
      { player: 'p2', uid: 'oom#2', card: c('attack-out-of-memory') },
    ],
    history: [],
    setup: {},
    playable: [],
    frozen: [],
    ...over,
  }) as unknown as BoardState

describe('withoutCard', () => {
  // the whole discard leaving at once — recycled into a deck, merged into one
  it('takes the whole discard off at once: its heap, its top and its count', () => {
    const lying = board({
      decks: {
        main: [0],
        events: 4,
        discard: c('attack-bug'),
        discardCount: 2,
        discardHeap: [
          { uid: 'd1', card: c('release-frontend'), ...scatterAt(1) },
          { uid: 'd2', card: c('attack-bug'), ...scatterAt(2) },
        ],
      },
    })
    expect(withoutCard(lying, { kind: 'discard' }).decks).toMatchObject({
      discard: null,
      discardCount: 0,
      discardHeap: [],
    })
    // nothing to take: the very board, so nothing is published for it
    const empty = board()
    expect(withoutCard(empty, { kind: 'discard' })).toBe(empty)
  })

  it('takes our own card out of the hand AND the centre it was put out at, named either way', () => {
    for (const from of [
      { kind: 'hand', uid: 'bug#1' },
      { kind: 'shown', player: 'p1', uid: 'bug#1' },
    ] as const) {
      const next = withoutCard(board(), from)
      expect(next.you.hand.map((h) => h.uid)).toEqual(['sudo#1'])
      expect(next.shown?.map((s) => s.uid)).toEqual(['oom#2'])
    }
  })

  it('takes another player’s card off the centre and leaves their hand count alone', () => {
    const next = withoutCard(board(), { kind: 'shown', player: 'p2', uid: 'oom#2' })
    expect(next.shown?.map((s) => s.uid)).toEqual(['bug#1'])
    expect(next.opponents[0].handCount).toBe(3)
    expect(next.you.hand).toHaveLength(2)
  })

  it('takes an attack off the centre together with the answer it was waiting for', () => {
    const waiting = board({
      pending: {
        kind: 'defend',
        player: 'p2',
        attacker: 'p1',
        attackCard: 'attack-bug',
        sudo: true,
        options: [],
        openedAt: 0,
        deadline: 0,
        scope: 'hand',
      },
    })
    expect(withoutCard(waiting, { kind: 'centre', card: 'attack-bug' }).pending).toBeNull()
    expect(withoutCard(waiting, { kind: 'centre', card: 'support-sudo' }).pending).toMatchObject({
      sudo: false,
    })
  })

  it('takes the cards standing over a transfer off it, and the transfer goes on', () => {
    const asking = board({
      pending: {
        kind: 'stealCard',
        player: 'p1',
        target: 'p2',
        count: 1,
        attack: 'attack-bug',
        sudo: false,
        cover: 'defense-works-on-my-machine',
        coverSudo: false,
        openedAt: 0,
        deadline: 0,
      },
    })
    const next = withoutCard(withoutCard(asking, { kind: 'centre', card: 'attack-bug' }), {
      kind: 'centre',
      card: 'defense-works-on-my-machine',
    })
    expect(next.pending).toMatchObject({ kind: 'stealCard', attack: undefined, cover: undefined })
  })

  it('takes the answered attack and its cover off the centre fields', () => {
    const answered = board({
      centreAttack: { card: 'attack-bug', sudo: true },
      centreCover: { card: 'defense-hotfix', sudo: false },
    })
    const next = withoutCard(withoutCard(answered, { kind: 'centre', card: 'attack-bug' }), {
      kind: 'centre',
      card: 'defense-hotfix',
    })
    expect(next.centreAttack).toBeUndefined()
    expect(next.centreCover).toBeUndefined()
  })

  it('takes an AI cause off the centre and out of the heap it is waiting to land in', () => {
    const standing = board({
      aiCause: { card: 'trigger-ai', eventId: 7 },
      decks: {
        main: [5],
        events: 4,
        discardCount: 1,
        discardHeap: [{ uid: 'd7', card: c('trigger-ai'), ...scatterAt(7) }],
      },
    })
    const next = withoutCard(standing, { kind: 'centre', card: 'trigger-ai' })
    expect(next.aiCause).toBeUndefined()
    expect(next.decks.discardHeap).toEqual([])
    expect(next.decks.discardCount).toBe(0)
  })

  it('empties a zone slot of the card and of what rides under it', () => {
    const next = withoutCard(board(), { kind: 'zone', player: 'p1', slot: 'frontend' })
    expect(next.you.release.frontend).toBeNull()
    expect(next.you.support?.frontend).toBeNull()
    expect(next.you.releaseUid?.frontend).toBeUndefined()
    const theirs = withoutCard(board(), { kind: 'zone', player: 'p2', slot: 'backend' })
    expect(theirs.opponents[0].release.backend).toBeNull()
  })

  it('takes one seat’s answer out of the System Upgrade row and leaves the rest standing', () => {
    const row = board({
      pending: {
        kind: 'systemUpgrade',
        actor: 'p1',
        owed: [],
        sudo: true,
        phase: 'picking',
        source: 'operation-system-upgrade',
        thrown: [
          { player: 'p2', card: { uid: 'a', id: 'attack-bug' } },
          { player: 'p3', card: { uid: 'b', id: 'defense-hotfix' } },
        ],
      },
    } as unknown as Partial<BoardState>)
    const next = withoutCard(row, { kind: 'upgrade', player: 'p3' })
    expect(next.pending).toMatchObject({ kind: 'systemUpgrade', actor: 'p1' })
    expect(
      next.pending?.kind === 'systemUpgrade' && next.pending.thrown.map((t) => t.player),
    ).toEqual(['p2'])
    const none = board()
    expect(withoutCard(none, { kind: 'upgrade', player: 'p3' })).toBe(none)
  })

  it('lowers the counts a card leaves: a seat, a pile, the events deck', () => {
    expect(withoutCard(board(), { kind: 'seat', player: 'p2' }).opponents[0].handCount).toBe(2)
    expect(withoutCard(board(), { kind: 'pile', pile: 1 }).decks.main).toEqual([5, 1])
    expect(withoutCard(board(), { kind: 'events' }).decks.events).toBe(3)
  })

  it('hands the board back unchanged when the card is not there', () => {
    const base = board()
    expect(withoutCard(base, { kind: 'hand', uid: 'nobody' })).toBe(base)
  })
})

describe('withCard', () => {
  it('draws the card where it landed: hand, centre, seat, zone, heap, counts', () => {
    const base = board()
    expect(
      withCard(base, { kind: 'hand', uid: 'hot#3', card: 'defense-hotfix', at: 0 }).you.hand[0].uid,
    ).toBe('hot#3')
    expect(withCard(base, { kind: 'seat', player: 'p2', count: 2 }).opponents[0].handCount).toBe(5)
    const zoned = withCard(base, {
      kind: 'zone',
      player: 'p2',
      slot: 'database',
      card: 'release-database',
      under: 'support-code-review',
    })
    expect(zoned.opponents[0].release.database?.id).toBe('release-database')
    expect(zoned.opponents[0].support?.database?.id).toBe('support-code-review')
    const heaped = withCard(base, { kind: 'heap', filed: [{ eventId: 9, card: 'attack-bug' }] })
    expect(heaped.decks.discardCount).toBe(1)
    expect(withCard(base, { kind: 'pile', pile: 0 }).decks.main).toEqual([6, 2])
    expect(
      withCard(base, { kind: 'centre', attack: { card: 'attack-bug', sudo: false } }).centreAttack,
    ).toEqual({ card: 'attack-bug', sudo: false })
  })
})

describe('withCard — an AI release', () => {
  it('lands with both its marks: the rules card it stands for and its own events-deck card', () => {
    const empty = board({ you: { name: 'You', hand: [], release: {} } } as Partial<BoardState>)
    for (const player of ['p1', 'p2']) {
      const next = withCard(empty, {
        kind: 'zone',
        player,
        slot: 'frontend',
        card: 'ai-release-frontend',
        ai: { id: 'release-frontend', event: 'ai-release-frontend' },
      })
      const owner = player === 'p1' ? next.you : next.opponents[0]
      expect(owner.release.frontend?.id).toBe('ai-release-frontend')
      expect(owner.releaseId?.frontend).toBe('release-frontend')
      expect(owner.releaseEvent?.frontend).toBe('ai-release-frontend')
    }
  })
})

describe('liftOff / setDown', () => {
  it('publishes the board without the card once, moves the base, then lets the gesture go', () => {
    const order: string[] = []
    const run = { base: board(), publish: vi.fn(() => order.push('publish')) }
    const gesture = { release: vi.fn(() => order.push('release')) }
    liftOff(
      run,
      [
        { kind: 'hand', uid: 'bug#1' },
        { kind: 'centre', card: 'nothing' },
      ],
      gesture,
    )
    expect(run.publish).toHaveBeenCalledTimes(1)
    expect(run.base.you.hand.map((h) => h.uid)).toEqual(['sudo#1'])
    expect(run.base.shown?.map((s) => s.uid)).toEqual(['oom#2'])
    expect(order).toEqual(['publish', 'release'])
  })

  it('publishes nothing when nothing was standing there', () => {
    const run = { base: board(), publish: vi.fn() }
    liftOff(run, [{ kind: 'hand', uid: 'nobody' }])
    expect(run.publish).not.toHaveBeenCalled()
  })

  it('draws the card where it landed before its carrier is taken down', () => {
    const order: string[] = []
    const run = { base: board(), publish: vi.fn(() => order.push('publish')) }
    setDown(run, [{ kind: 'seat', player: 'p2' }], () => order.push('drop'))
    expect(run.base.opponents[0].handCount).toBe(4)
    expect(order).toEqual(['publish', 'drop'])
  })
})
