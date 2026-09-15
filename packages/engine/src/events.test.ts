import { describe, expect, it } from 'vitest'
import { parseEventLog } from './events'
import { botAction, createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './fake'
import { redactFor } from './redact'
import { seatOwing } from './state'

describe('parseEventLog engine compatibility', () => {
  it('round-trips the persisted journal throughout a complete game', () => {
    const engine = createFakeEngine()
    let state = engine.createGame({
      gameId: 'event-log-round-trip',
      // Match the terminating all-bot fixture in fake/bots.test.ts.
      seed: 1,
      players: [
        { id: 'p1', name: 'Alice' },
        { id: 'p2', name: 'Bob' },
        { id: 'p3', name: 'Charlie' },
      ],
      setup: {
        handLimit: 'base',
        releases: 'base',
        releaseCond: 'base',
        ai: 'base',
        gitBranch: 'base',
      },
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    })
    const journal = engine.setupEvents(state)
    // Include the engine's opening deal (and its optional `open` payload).
    expect(journal.some((event) => event.type === 'dealt' && (event.open?.length ?? 0) > 0)).toBe(
      true,
    )
    expect(parseEventLog(JSON.parse(JSON.stringify(journal)))).toEqual(journal)

    for (let step = 0; step < 2000 && !state.over; step += 1) {
      const player = seatOwing(state.pending) ?? state.turn.player
      const action = botAction(engine, state, player, 1000 + step * 100)
      if (!action) throw new Error(`No action at step ${step}`)
      const result = engine.reduce(state, action)
      expect(result.events.some((event) => event.type === 'rejected')).toBe(false)
      journal.push(...result.events)
      // Match the JSON boundary used when persisting and restoring a host.
      expect(
        parseEventLog(JSON.parse(JSON.stringify(journal))),
        `Saved journal after step ${step}: ${JSON.stringify(action)}`,
      ).toEqual(journal)
      state = result.state
    }

    expect(state.over).not.toBeNull()
    expect(journal.some((event) => event.type === 'discarded')).toBe(true)
    expect(journal.some((event) => event.type === 'gameOver')).toBe(true)
  })
})

describe('parseEventLog privacy invariants', () => {
  it('accepts canonical private event audiences', () => {
    expect(
      parseEventLog([
        {
          id: 1,
          type: 'handTransfer',
          from: 'p1',
          to: 'p2',
          card: 'bug',
          visibleTo: ['p1', 'p2'],
        },
        {
          id: 2,
          type: 'takenFromDiscard',
          player: 'p1',
          card: 'sudo',
          to: 'deck',
          visibleTo: ['p1'],
        },
      ]),
    ).not.toBeNull()
  })

  it.each([
    [
      'a hand transfer with an invalid public marker',
      { id: 1, type: 'handTransfer', from: 'p1', to: 'p2', card: 'bug', publicCard: 'true' },
    ],
    [
      'a hand transfer with the wrong private audience',
      {
        id: 1,
        type: 'handTransfer',
        from: 'p1',
        to: 'p2',
        card: 'bug',
        visibleTo: ['p1', 'p3'],
      },
    ],
    [
      'a private discard-to-deck event with no audience',
      { id: 1, type: 'takenFromDiscard', player: 'p1', card: 'sudo', to: 'deck' },
    ],
    [
      'a private discard-to-deck event with the wrong audience',
      {
        id: 1,
        type: 'takenFromDiscard',
        player: 'p1',
        card: 'sudo',
        to: 'deck',
        visibleTo: ['p2'],
      },
    ],
    [
      'a public event with a forged private audience',
      { id: 1, type: 'dealt', player: 'p1', count: 5, visibleTo: ['p1'] },
    ],
    [
      'an event carrying an unexpected payload field',
      { id: 1, type: 'dealt', player: 'p1', count: 5, secret: 'card-id' },
    ],
  ] as const)('rejects %s', (_case, event) => {
    expect(parseEventLog([event])).toBeNull()
  })
})

describe('parseEventLog public card choreography', () => {
  it('restores public operations and transfers without revealing blind faces to observers', () => {
    const log = [
      { id: 1, type: 'operationPlayed', player: 'p1', card: 'operation-git-branch', sudo: true },
      { id: 2, type: 'handTransfer', from: 'p1', to: 'p2', card: 'bug', index: 1 },
      { id: 3, type: 'handTransfer', from: 'p1', to: 'p2', card: 'hotfix', publicCard: true },
    ]
    const restored = parseEventLog(JSON.parse(JSON.stringify(log)))
    expect(restored).toEqual(log)
    expect(restored?.map((event) => redactFor(event, 'p3'))).toEqual([
      log[0],
      { id: 2, type: 'handTransfer', from: 'p1', to: 'p2', index: 1 },
      log[2],
    ])
    const observer = restored?.map((event) => redactFor(event, 'p3'))
    expect(parseEventLog(observer)).toEqual(observer)
  })

  it.each([
    { id: 1, type: 'operationPlayed', player: 'p1', card: 'operation-git-branch', sudo: 'yes' },
    { id: 1, type: 'handTransfer', from: 'p1', to: 'p2', index: -1 },
    { id: 1, type: 'handTransfer', from: 'p1', to: 'p2', index: 0.5 },
    { id: 1, type: 'handTransfer', from: 'p1', to: 'p2', publicCard: true },
  ])('rejects malformed choreography payloads: %j', (event) => {
    expect(parseEventLog([event])).toBeNull()
  })
})
