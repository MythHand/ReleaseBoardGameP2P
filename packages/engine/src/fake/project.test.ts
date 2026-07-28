import type { GameConfig } from '../engine'
import { project } from './project'
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
