import type { Action } from '../actions'
import type { CardInstance, GameState, ReleaseSlot } from '../state'
import { botAction } from './bots'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

const engine = createFakeEngine()
const card = (id: string, suffix = id): CardInstance => ({ id, uid: suffix })
const release = (slot: ReleaseSlot) => ({ card: card(`release-${slot}`) })

function table(hand: CardInstance[]): GameState {
  const state = engine.createGame({
    gameId: 'bot-policy',
    seed: 42,
    players: ['p1', 'p2', 'p3'].map((id) => ({ id, name: id })),
    setup: {
      handLimit: 'base',
      releases: 'base',
      releaseCond: 'easy',
      ai: 'base',
      gitBranch: 'base',
    },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  return {
    ...state,
    turn: { ...state.turn, player: 'p2' },
    decks: { ...state.decks, main: [[card('defense-hotfix', 'draw-pile')]] },
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => [
        id,
        { ...player, hand: id === 'p2' ? hand : [], release: {}, shown: [] },
      ]),
    ),
  }
}

function acceptedAction(state: GameState): Action {
  const action = botAction(engine, state, 'p2', 1_000)
  if (!action) throw new Error('expected bot progress')
  const rejected = engine.reduce(state, action).events.find((event) => event.type === 'rejected')
  if (rejected) throw new Error(JSON.stringify(rejected))
  return action
}

it.each([
  'attack-bug',
  'attack-security-bug',
  'attack-legacy-code',
  'attack-out-of-memory',
])('aims %s at a nonempty hand instead of the first empty player', (id) => {
  const state = table([card(id)])
  state.players.p3.hand = [card('defense-hotfix')]
  const action = acceptedAction(state)
  expect(action).toMatchObject({ type: 'PLAY', card: id, target: { kind: 'player', player: 'p3' } })
  expect(engine.reduce(state, action).state.pending).toMatchObject({ kind: 'defend', player: 'p3' })
})

it.each([false, true])('keeps a useless theft and progresses when hasDrawn=%s', (hasDrawn) => {
  const state = table([card('attack-bug')])
  if (hasDrawn) state.turn.drawnFrom = state.decks.main.map((_, index) => index)
  const action = acceptedAction(state)
  expect(action.type).toBe(hasDrawn ? 'PUSH' : 'DRAW')
  expect(engine.reduce(state, action).state.players.p2.hand).toContainEqual(card('attack-bug'))
})

it('skips a useless theft to play another useful card', () => {
  const state = table([card('attack-bug'), card('release-frontend')])
  expect(acceptedAction(state)).toMatchObject({ type: 'PLAY', card: 'release-frontend' })
})

it('uses DDoS against the release leader regardless of seating order', () => {
  const state = table([card('attack-ddos')])
  state.players.p1.release = { frontend: release('frontend') }
  state.players.p3.release = { frontend: release('frontend'), backend: release('backend') }
  for (const seating of [
    ['p1', 'p2', 'p3'],
    ['p3', 'p2', 'p1'],
  ]) {
    for (const seed of [1, 42, 4242]) {
      expect(acceptedAction({ ...state, seating, seed })).toMatchObject({
        type: 'PLAY',
        target: { kind: 'release', player: 'p3' },
      })
    }
  }
})

it('returns a leader release rather than merely removing their Monitoring', () => {
  const state = table([card('attack-ddos')])
  state.players.p3.release = {
    frontend: release('frontend'),
    backend: release('backend'),
    monitoring: card('protection-monitoring'),
  }
  const action = acceptedAction(state)
  expect(action).toMatchObject({ type: 'PLAY', target: { kind: 'release', player: 'p3' } })
  const result = engine.reduce(state, action).state
  expect(result.players.p3.hand).toHaveLength(1)
  expect(result.players.p3.release.monitoring).toBeDefined()
})

it('uses a later DDoS to strip Code Review from the leader instead of stealing a hand card', () => {
  const state = table([card('attack-bug'), card('attack-ddos')])
  state.players.p1.hand = [card('defense-hotfix')]
  state.players.p3.release = {
    frontend: { ...release('frontend'), codeReview: card('support-code-review') },
    backend: release('backend'),
  }
  const action = acceptedAction(state)
  expect(action).toMatchObject({
    type: 'PLAY',
    card: 'attack-ddos',
    target: { kind: 'release', player: 'p3', slot: 'frontend' },
  })
  const result = engine.reduce(state, action).state
  expect(result.players.p3.release.frontend).toBeUndefined()
  expect(result.decks.discard).toContainEqual(card('support-code-review'))
})

it('uses DDoS against Monitoring when that is the useful target on the field', () => {
  const state = table([card('attack-ddos')])
  state.players.p3.release = { monitoring: card('protection-monitoring') }
  const action = acceptedAction(state)
  expect(action).toMatchObject({ target: { kind: 'monitoring', player: 'p3' } })
  expect(engine.reduce(state, action).state.players.p3.release.monitoring).toBeUndefined()
})

it('breaks equal-target ties reproducibly without favoring seating order or reading hidden faces', () => {
  const state = table([card('attack-bug')])
  state.players.p1.hand = [card('defense-hotfix')]
  state.players.p3.hand = [card('release-frontend')]
  const targets = new Set<string>()
  for (let seed = 0; seed < 32; seed++) {
    const original = { ...state, seed }
    const action = acceptedAction(original)
    if (action.type !== 'PLAY' || action.target?.kind !== 'player')
      throw new Error('expected theft')
    targets.add(action.target.player)
    const changed = structuredClone(original)
    changed.seating = ['p3', 'p2', 'p1']
    changed.players.p1.hand = [card('release-database', 'hidden-other-1')]
    changed.players.p3.hand = [card('defense-not-a-bug', 'hidden-other-3')]
    expect(acceptedAction(changed)).toEqual(action)
  }
  expect([...targets].sort()).toEqual(['p1', 'p3'])
})

it('does not attack an eliminated leader or spend a frozen DDoS', () => {
  const state = table([card('attack-bug'), card('attack-ddos')])
  state.eliminated = ['p1']
  state.players.p1.release = {
    frontend: release('frontend'),
    backend: release('backend'),
    database: release('database'),
  }
  state.players.p3.hand = [card('defense-hotfix')]
  state.players.p2.frozen = ['attack-ddos']
  expect(acceptedAction(state)).toMatchObject({
    type: 'PLAY',
    card: 'attack-bug',
    target: { kind: 'player', player: 'p3' },
  })
})
