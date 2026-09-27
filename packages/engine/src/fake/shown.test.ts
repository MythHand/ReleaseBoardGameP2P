import { expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import { parseEventLog } from '../events'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

// What is put out at the centre is seen by everyone (resolution.md §1).

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

const config: GameConfig = {
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: BASE,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
}

const SUDO: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }

const table = (hand: CardInstance[]): GameState => {
  const s = engine.createGame(config)
  return {
    ...s,
    turn: { ...s.turn, player: 'p1', drawnFrom: [0], openedAt: 500, deadline: 30_500 },
    players: { ...s.players, p1: { ...s.players.p1, hand } },
  }
}

it('shows a card put out at the centre to the whole table', () => {
  const r = reduce(table([SUDO, BUG, FE]), { type: 'SHOW', player: 'p1', card: SUDO.uid, at: 1000 })
  expect(r.events).toMatchObject([{ type: 'shown', player: 'p1', card: SUDO.id }])
  // it stays in the hand — showing is not a move
  expect(r.state.players.p1.hand).toHaveLength(3)

  const theirs = engine.project(r.state, 'p2')
  expect(theirs.shown).toEqual([{ player: 'p1', uid: SUDO.uid, card: SUDO.id }])
  // the card lies on the table, so it is no longer counted in the hand
  expect(theirs.opponents.find((o) => o.id === 'p1')?.handCount).toBe(2)
  expect(engine.project(r.state, 'p1').shown).toEqual(theirs.shown)
})

it('takes everything shown back into the hand, in everyone’s view', () => {
  const one = reduce(table([SUDO, BUG, FE]), {
    type: 'SHOW',
    player: 'p1',
    card: SUDO.uid,
    at: 1000,
  })
  const two = reduce(one.state, { type: 'SHOW', player: 'p1', card: BUG.uid, at: 1001 })
  const back = reduce(two.state, { type: 'TAKE_BACK', player: 'p1', at: 1002 })
  expect(back.events).toMatchObject([{ type: 'takenBack', player: 'p1', cards: [SUDO.id, BUG.id] }])
  expect(engine.project(back.state, 'p2').shown).toEqual([])
})

it('lets a shown card go when it is played', () => {
  const shown = reduce(table([SUDO, BUG, FE]), {
    type: 'SHOW',
    player: 'p1',
    card: BUG.uid,
    at: 1000,
  })
  const played = reduce(shown.state, {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1001,
  })
  expect(played.events.some((e) => e.type === 'rejected')).toBe(false)
  expect(played.state.players.p1.shown).toEqual([])
})

it('does not restart the turn clock', () => {
  const before = table([SUDO, BUG, FE])
  const shown = reduce(before, { type: 'SHOW', player: 'p1', card: SUDO.uid, at: 9000 })
  expect(shown.state.turn.deadline).toBe(before.turn.deadline)
  const back = reduce(shown.state, { type: 'TAKE_BACK', player: 'p1', at: 9001 })
  expect(back.state.turn.deadline).toBe(before.turn.deadline)
})

it('refuses a card not in the hand, a card already out, and taking back nothing', () => {
  const s = table([SUDO, BUG, FE])
  expect(reduce(s, { type: 'SHOW', player: 'p2', card: SUDO.uid, at: 1 }).events[0].type).toBe(
    'rejected',
  )
  const once = reduce(s, { type: 'SHOW', player: 'p1', card: SUDO.uid, at: 1 })
  expect(
    reduce(once.state, { type: 'SHOW', player: 'p1', card: SUDO.uid, at: 2 }).events[0].type,
  ).toBe('rejected')
  expect(reduce(s, { type: 'TAKE_BACK', player: 'p1', at: 1 }).events[0].type).toBe('rejected')
})

it('reads both events back from a log', () => {
  const one = reduce(table([SUDO, BUG, FE]), {
    type: 'SHOW',
    player: 'p1',
    card: SUDO.uid,
    at: 1000,
  })
  const back = reduce(one.state, { type: 'TAKE_BACK', player: 'p1', at: 1001 })
  const log = [...one.events, ...back.events]
  expect(parseEventLog(JSON.parse(JSON.stringify(log)))).toEqual(log)
})
