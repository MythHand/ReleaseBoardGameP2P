import type { GameConfig } from '../engine'
import { playableFor, project } from './project'
import { createGame } from './setup'

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: {
    handLimit: 'base',
    releases: 'base',
    releaseCond: 'base',
    ai: 'base',
    gitBranch: 'base',
  },
  deck: [
    { id: 'release-frontend', qty: 4 },
    { id: 'attack-bug', qty: 7 },
    { id: 'protection-debugger', qty: 8 },
    { id: 'protection-monitoring', qty: 5 },
    { id: 'support-sudo', qty: 5 },
    { id: 'trigger-ai', qty: 12 },
  ],
  events: [{ id: 'ai-hallucination', qty: 2 }],
})

it('shows the viewer their own hand in full', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  expect(v.self.id).toBe('p1')
  expect(v.self.hand).toEqual(s.players.p1.hand)
})

it('reduces opponents to a hand count', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  expect(v.opponents).toHaveLength(1)
  expect(v.opponents[0].id).toBe('p2')
  expect(v.opponents[0].handCount).toBe(5)
  expect(JSON.stringify(v.opponents[0])).not.toContain('uid')
})

it('leaks no opponent card identity anywhere in the view', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  const serialized = JSON.stringify(v)
  for (const c of s.players.p2.hand) {
    expect(serialized, `leaked ${c.uid}`).not.toContain(c.uid)
  }
})

it('never reveals the ordered draw pile, only its size', () => {
  const s = createGame(config())
  const v = project(s, 'p1')
  expect(v.decks.piles).toEqual([s.decks.main[0].length])
  const serialized = JSON.stringify(v)
  for (const c of s.decks.main[0]) {
    expect(serialized, `leaked ${c.uid}`).not.toContain(c.uid)
  }
})

it('publishes the discard top and count', () => {
  const s = createGame(config())
  const withDiscard = {
    ...s,
    decks: { ...s.decks, discard: [{ uid: 'attack-bug#0', id: 'attack-bug' }] },
  }
  const v = project(withDiscard, 'p1')
  expect(v.decks.discardTop).toBe('attack-bug')
  expect(v.decks.discardCount).toBe(1)
})

it('publishes release zones as card ids for both sides', () => {
  const s = createGame(config())
  const placed = {
    ...s,
    players: {
      ...s.players,
      p2: {
        ...s.players.p2,
        release: {
          frontend: {
            card: { uid: 'release-frontend#0', id: 'release-frontend' },
            codeReview: { uid: 'support-code-review#0', id: 'support-code-review' },
          },
          backend: undefined,
          database: undefined,
          monitoring: undefined,
        },
      },
    },
  }
  const v = project(placed, 'p1')
  expect(v.opponents[0].release.frontend).toEqual({
    uid: 'release-frontend#0',
    card: 'release-frontend',
    codeReview: 'support-code-review',
  })
})

it('marks a player on their own turn as able to play something', () => {
  const s = createGame(config())
  expect(project(s, 'p1').self.playable.length).toBeGreaterThan(0)
})

it('offers nothing playable to a player whose turn it is not', () => {
  const s = createGame(config())
  expect(project(s, 'p2').self.playable).toEqual([])
})

it('reports elimination on the opponent view', () => {
  const s = createGame(config())
  const out = { ...s, eliminated: ['p2'] }
  expect(project(out, 'p1').opponents[0].eliminated).toBe(true)
})

describe('projection privacy barrier', () => {
  it('copies setup so mutations do not reach the source', () => {
    const s = createGame(config())
    const v = project(s, 'p1')
    v.setup.handLimit = 'x' as never
    expect(s.setup.handLimit).toBe('base')
  })

  it('copies over so mutations do not reach the source', () => {
    const s = createGame(config())
    const withOver = { ...s, over: { winner: 'p1', condition: 'release' as const } }
    const v = project(withOver, 'p1')
    if (v.over) {
      v.over.winner = 'p2'
    }
    expect(withOver.over.winner).toBe('p1')
  })
})

describe('playableFor legality rules', () => {
  it('yields [] when game is over', () => {
    const s = createGame(config())
    const over = { ...s, over: { winner: 'p1', condition: 'release' as const } }
    expect(playableFor(over, 'p1')).toEqual([])
  })

  it('yields [] when a pending decision is set', () => {
    const s = createGame(config())
    const withPending = {
      ...s,
      pending: { kind: 'handLimit' as const, player: 'p1', excess: 2 },
    }
    expect(playableFor(withPending, 'p1')).toEqual([])
  })

  it('yields [] when a window is open', () => {
    const s = createGame(config())
    const withWindow = {
      ...s,
      window: {
        target: { player: 'p1', slot: 'frontend' as const, card: 'attack-bug#0' },
        round: 1,
        deadline: 0,
        passed: [],
      },
    }
    expect(playableFor(withWindow, 'p1')).toEqual([])
  })

  it('yields [] for an eliminated viewer', () => {
    const s = createGame(config())
    const eliminated = { ...s, eliminated: ['p1'] }
    expect(playableFor(eliminated, 'p1')).toEqual([])
  })

  it('does not include a frozen card', () => {
    const s = createGame(config())
    const p1Card = s.players.p1.hand[0]
    const frozen = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1, frozen: [p1Card.uid] },
      },
    }
    expect(playableFor(frozen, 'p1')).not.toContain(p1Card.uid)
  })

  it('does not include a release card when its slot is filled', () => {
    const s = createGame(config())
    const releasedCard = { uid: 'release-frontend#0', id: 'release-frontend' }
    const filled = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          release: {
            ...s.players.p1.release,
            frontend: { card: releasedCard },
          },
        },
      },
    }
    const playable = playableFor(filled, 'p1')
    // Check that no release-frontend card is playable
    expect(
      playable.every(
        (uid) => !s.players.p1.hand.find((c) => c.uid === uid && c.id === 'release-frontend'),
      ),
    ).toBe(true)
  })

  it('does not include a release card when the cap is hit under releases: base', () => {
    const s = createGame(config())
    const withPlayedRelease = {
      ...s,
      turn: { ...s.turn, releasesPlayed: 1 },
    }
    // Under releases: 'base', cap is 1, so with 1 already played, no more releases are playable
    const playable = playableFor(withPlayedRelease, 'p1')
    // No release cards should be playable
    expect(
      playable.every(
        (uid) => !s.players.p1.hand.find((c) => c.uid === uid && c.id.startsWith('release-')),
      ),
    ).toBe(true)
  })

  it('allows release cards when cap is not hit under releases: fast', () => {
    const fastConfig = { ...config(), setup: { ...config().setup, releases: 'fast' } }
    const fast = createGame(fastConfig)
    // Construct state with explicit release card in hand and cap already hit at 1
    const releaseCard = { uid: 'release-backend#0', id: 'release-backend' }
    const withRelease = {
      ...fast,
      players: {
        ...fast.players,
        p1: {
          ...fast.players.p1,
          hand: [releaseCard, ...fast.players.p1.hand],
          // backend slot is empty, so card can be played
          release: { ...fast.players.p1.release, backend: undefined },
        },
      },
      turn: { ...fast.turn, releasesPlayed: 1 },
    }
    const playable = playableFor(withRelease, 'p1')
    // Under releases: 'fast', cap is Infinity, so even after 1 played, this release is playable
    expect(playable).toContain(releaseCard.uid)
  })

  it('includes protection-monitoring when monitoring slot is empty', () => {
    const s = createGame(config())
    // Explicitly add protection-monitoring to hand
    const monitoringCard = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
    const withMonitoring = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [monitoringCard, ...s.players.p1.hand],
          // Ensure monitoring slot is empty
          release: { ...s.players.p1.release, monitoring: undefined },
        },
      },
    }
    const playable = playableFor(withMonitoring, 'p1')
    expect(playable).toContain(monitoringCard.uid)
  })

  it('does not include protection-monitoring when monitoring slot is filled', () => {
    const s = createGame(config())
    // Explicitly add protection-monitoring to hand and fill the monitoring slot
    const monitoringCard = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
    const filledMonitoring = { uid: 'protection-monitoring#1', id: 'protection-monitoring' }
    const filled = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [monitoringCard, ...s.players.p1.hand],
          release: {
            ...s.players.p1.release,
            monitoring: filledMonitoring,
          },
        },
      },
    }
    const playable = playableFor(filled, 'p1')
    expect(playable).not.toContain(monitoringCard.uid)
  })

  it('never includes protection-debugger', () => {
    const s = createGame(config())
    // Explicitly add protection-debugger to hand
    const debuggerCard = { uid: 'protection-debugger#0', id: 'protection-debugger' }
    const withDebugger = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [debuggerCard, ...s.players.p1.hand],
        },
      },
    }
    const playable = playableFor(withDebugger, 'p1')
    expect(playable).not.toContain(debuggerCard.uid)
  })

  it('never includes cancel (defence) cards', () => {
    const s = createGame(config())
    // Explicitly add defence cards to hand
    const cancelCard = { uid: 'defence-hotfix#0', id: 'defence-hotfix' }
    const notABugCard = { uid: 'defence-not-a-bug#0', id: 'defence-not-a-bug' }
    const withDefence = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [cancelCard, notABugCard, ...s.players.p1.hand],
        },
      },
    }
    const playable = playableFor(withDefence, 'p1')
    expect(playable).not.toContain(cancelCard.uid)
    expect(playable).not.toContain(notABugCard.uid)
  })

  it('never includes support cards', () => {
    const s = createGame(config())
    // Explicitly add support card to hand
    const supportCard = { uid: 'support-sudo#0', id: 'support-sudo' }
    const withSupport = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [supportCard, ...s.players.p1.hand],
        },
      },
    }
    const playable = playableFor(withSupport, 'p1')
    expect(playable).not.toContain(supportCard.uid)
  })

  it('never includes trigger cards', () => {
    const s = createGame(config())
    // Explicitly add trigger card to hand
    const triggerCard = { uid: 'trigger-ai#0', id: 'trigger-ai' }
    const withTrigger = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [triggerCard, ...s.players.p1.hand],
        },
      },
    }
    const playable = playableFor(withTrigger, 'p1')
    expect(playable).not.toContain(triggerCard.uid)
  })
})
