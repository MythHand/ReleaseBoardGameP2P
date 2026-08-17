import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createLog } from './core'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'
import { openWindow, WINDOW_FIRST_MS, WINDOW_NEXT_MS } from './window'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
    { id: 'p3', name: 'segfault' },
  ],
  setup: EASY,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const SUDO: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }

// p1 releases; p2 holds a Bug, p3 holds nothing useful.
const released = (extra: Partial<Record<'p1' | 'p2' | 'p3', CardInstance[]>> = {}): GameState => {
  const s = engine.createGame(config())
  const primed: GameState = {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: [FE, CR, ...(extra.p1 ?? [])] },
      p2: { ...s.players.p2, hand: extra.p2 ?? [BUG] },
      p3: { ...s.players.p3, hand: extra.p3 ?? [] },
    },
  }
  return reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 }).state
}

it('opens a 15s window on a bare release', () => {
  const s = released()
  expect(s.window).toEqual({
    target: { player: 'p1', slot: 'frontend', card: FE.uid },
    round: 1,
    openedAt: 1000,
    deadline: 1000 + WINDOW_FIRST_MS,
    passed: [],
  })
})

it('opens no window when the release carries Code Review', () => {
  const s = engine.createGame(config())
  const primed: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, hand: [FE, CR] } },
  }
  const r = reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, combo: CR.uid, at: 1000 })
  expect(r.state.window).toBeNull()
  expect(r.events.map((e) => e.type)).toEqual(['released'])
})

it('closes once every responder has passed', () => {
  const one = reduce(released(), { type: 'PASS', player: 'p2', at: 1001 })
  expect(one.state.window?.passed).toEqual(['p2'])
  const two = reduce(one.state, { type: 'PASS', player: 'p3', at: 1002 })
  expect(two.state.window).toBeNull()
  expect(two.events.map((e) => e.type)).toEqual(['passed', 'windowClosed'])
})

it('lets a passer change their mind while the window lives', () => {
  const passed = reduce(released(), { type: 'PASS', player: 'p2', at: 1001 })
  const back = reduce(passed.state, { type: 'UNPASS', player: 'p2', at: 1002 })
  expect(back.state.window?.passed).toEqual([])
  expect(back.events.map((e) => e.type)).toEqual(['unpassed'])
})

it('refuses a pass from the release owner', () => {
  const s = released()
  const r = reduce(s, { type: 'PASS', player: 'p1', at: 1001 })
  expect(r.state).toBe(s)
  expect(r.events[0].type).toBe('rejected')
})

it('closes on expiry only once the deadline has passed', () => {
  const s = released()
  const early = reduce(s, { type: 'WINDOW_EXPIRED', at: 1000 })
  expect(early.state).toBe(s)
  expect(early.events[0].type).toBe('rejected')

  const late = reduce(s, { type: 'WINDOW_EXPIRED', at: 1000 + WINDOW_FIRST_MS })
  expect(late.state.window).toBeNull()
  expect(late.events.map((e) => e.type)).toEqual(['windowClosed'])
})

it('rejects an expiring window while the defend it opened is still pending, and resolving still closes it', () => {
  const s = released({ p2: [BUG, SUDO] })
  const attacked = reduce(s, {
    type: 'ATTACK',
    player: 'p2',
    card: BUG.uid,
    combo: SUDO.uid,
    at: 1001,
  })
  expect(attacked.state.pending).toMatchObject({ kind: 'defend' })

  // The window's own deadline (1000 + WINDOW_FIRST_MS) has arrived, but the
  // defend it opened has not been decided — closing the window here would
  // strand that pending: release-scope onDefend needs `state.window` back to
  // reopen the next round, and nothing else can ever supply it again.
  const expired = reduce(attacked.state, { type: 'WINDOW_EXPIRED', at: 1000 + WINDOW_FIRST_MS })
  expect(expired.state).toBe(attacked.state)
  expect(expired.events[0].type).toBe('rejected')

  // The exchange still resolves normally — and the window closes through that
  // resolution, not through expiry.
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1000 + WINDOW_FIRST_MS + 1,
  })
  expect(r.state.pending).toBeNull()
  expect(r.state.window).toBeNull()
  expect(r.state.players.p1.release.frontend).toBeUndefined()
})

it('blocks the turn owner from acting while a window is open', () => {
  const s = released()
  expect(reduce(s, { type: 'PUSH', player: 'p1', at: 1001 }).events[0].type).toBe('rejected')
  expect(reduce(s, { type: 'DRAW', player: 'p1', at: 1001 }).events[0].type).toBe('rejected')
})

it('projects the window with the viewer’s usable attacks', () => {
  // The owner holds an attack-eligible card too (not just the non-combat CR),
  // and a third responder holds a card that is not a release attack — so both
  // exclusions below are exercised by an implementation that would otherwise
  // have something to attack with, not vacuously satisfied by an empty hand.
  const ownerBug: CardInstance = { uid: 'attack-bug#1', id: 'attack-bug' }
  const p3Card: CardInstance = { uid: 'support-code-review#1', id: 'support-code-review' }
  const s = released({ p1: [ownerBug], p3: [p3Card] })

  const attacker = engine.project(s, 'p2')
  expect(attacker.window?.round).toBe(1)
  expect(attacker.window?.deadline).toBe(1000 + WINDOW_FIRST_MS)
  expect(attacker.window?.passed).toEqual([])
  expect(attacker.window?.canAttackWith).toEqual([BUG.uid])

  // The owner holds attack-bug too, but can never throw it into their own window.
  const owner = engine.project(s, 'p1')
  expect(owner.window?.canAttackWith).toEqual([])
  // A responder holding a card that is not a release attack sees an empty option set.
  expect(engine.project(s, 'p3').window?.canAttackWith).toEqual([])
})

it('does not count DDoS as a reaction-window attack', () => {
  const ddos: CardInstance = { uid: 'attack-ddos#0', id: 'attack-ddos' }
  const s = released({ p2: [ddos] })
  expect(engine.project(s, 'p2').window?.canAttackWith).toEqual([])
})

it('rejects UNPASS from a player who has not passed', () => {
  const s = released()
  const r = reduce(s, { type: 'UNPASS', player: 'p2', at: 1001 })
  expect(r.state).toBe(s)
  expect(r.events.map((e) => e.type)).toEqual(['rejected'])
})

it('opens a 10s window for a later round', () => {
  const s = engine.createGame(config())
  const log = createLog(s.eventSeq)
  const reopened = openWindow(s, log, { player: 'p1', slot: 'frontend', card: FE.uid }, 2, 1000)
  expect(reopened.window).toEqual({
    target: { player: 'p1', slot: 'frontend', card: FE.uid },
    round: 2,
    openedAt: 1000,
    deadline: 1000 + WINDOW_NEXT_MS,
    passed: [],
  })
  expect(log.events.map((e) => e.type)).toEqual(['windowOpened'])
})
