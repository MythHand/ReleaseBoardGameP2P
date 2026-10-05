import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createLog } from './core'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'
import {
  handOverWindow,
  openWindow,
  SUDO_PARTNER_MS,
  WINDOW_FIRST_MS,
  WINDOW_NEXT_MS,
} from './window'

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
const BE: CardInstance = { uid: 'release-backend#0', id: 'release-backend' }
const DB: CardInstance = { uid: 'release-database#0', id: 'release-database' }
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

describe('handOverWindow', () => {
  it('closes the standing window and opens a fresh one for the new release', () => {
    const s = engine.createGame(config())
    const log = createLog(s.eventSeq)
    const open = openWindow(s, log, { player: 'p1', slot: 'frontend', card: 'fe#0' }, 1, 1000)
    const log2 = createLog(open.eventSeq)
    const next = handOverWindow(open, log2, { player: 'p2', slot: 'database', card: 'db#0' }, 2000)
    expect(log2.events.map((e) => e.type)).toEqual(['windowClosed', 'windowOpened'])
    expect(next.window).toMatchObject({
      target: { player: 'p2', slot: 'database', card: 'db#0' },
      round: 1,
      openedAt: 2000,
      deadline: 2000 + WINDOW_FIRST_MS,
      passed: [],
    })
  })

  it('does not settle the win on the close it performs', () => {
    // The whole point: the release that just arrived has not faced its window
    // yet, so the game must not end at this close. `closeWindow` would.
    const s = engine.createGame(config())
    const primed: GameState = {
      ...s,
      players: {
        ...s.players,
        p2: {
          ...s.players.p2,
          release: {
            frontend: { card: FE },
            backend: { card: BE },
            database: { card: DB },
          },
        },
      },
    }
    const log = createLog(primed.eventSeq)
    const open = openWindow(primed, log, { player: 'p1', slot: 'frontend', card: 'fe#9' }, 1, 1000)
    const log2 = createLog(open.eventSeq)
    const next = handOverWindow(open, log2, { player: 'p2', slot: 'database', card: DB.uid }, 2000)
    expect(next.over).toBeNull()
    expect(log2.events.some((e) => e.type === 'gameOver')).toBe(false)
  })

  it('settles the win immediately when nobody is left to answer the new window', () => {
    // `openWindow` declines with no living responders. Nothing would ever
    // close a window that never opened, so the win has to be decided here instead —
    // the same fallback `placeRelease` already carries.
    const s = engine.createGame(config())
    const primed: GameState = {
      ...s,
      eliminated: s.seating.filter((id) => id !== 'p1'),
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          release: {
            frontend: { card: FE },
            backend: { card: BE },
            database: { card: DB },
          },
        },
      },
    }
    const log = createLog(primed.eventSeq)
    const next = handOverWindow(
      { ...primed, window: null },
      log,
      { player: 'p1', slot: 'database', card: DB.uid },
      2000,
    )
    expect(next.window).toBeNull()
    expect(next.over).toEqual({ winner: 'p1', condition: 'release' })
  })
})

// ===== one attack at a time (resolution.md §1; owner, 02.10) =====
//
// Everyone may attack a fresh release, but one attack is dealt with at a time:
// whoever put theirs out at the centre first is the one, and until it is dealt
// with nobody else may put one out. A Sudo put out to attack with has its own
// time for the attack to join it; an attack card alone has none.

const BUG3: CardInstance = { uid: 'attack-bug#1', id: 'attack-bug' }

describe('one attack at a time', () => {
  it('refuses a second responder’s attack while the first is out, and the first goes through', () => {
    const s = released({ p2: [BUG], p3: [BUG3] })
    const first = reduce(s, { type: 'SHOW', player: 'p2', card: BUG.uid, at: 1100 })
    expect(first.events.map((e) => e.type)).toEqual(['shown'])

    const late = reduce(first.state, { type: 'SHOW', player: 'p3', card: BUG3.uid, at: 1101 })
    expect(late.events).toMatchObject([{ type: 'rejected', reason: 'another attack is out' }])
    const straight = reduce(first.state, { type: 'ATTACK', player: 'p3', card: BUG3.uid, at: 1102 })
    expect(straight.events.map((e) => e.type)).toEqual(['rejected'])
    // and it is not offered to them meanwhile
    expect(engine.project(first.state, 'p3').window?.canAttackWith).toEqual([])

    const attack = reduce(first.state, { type: 'ATTACK', player: 'p2', card: BUG.uid, at: 1103 })
    expect(attack.events.map((e) => e.type)).toContain('attacked')
    // while it is dealt with, nobody puts another out
    const during = reduce(attack.state, { type: 'SHOW', player: 'p3', card: BUG3.uid, at: 1104 })
    expect(during.events).toMatchObject([
      { type: 'rejected', reason: 'an attack is being dealt with' },
    ])
  })

  it('gives a Sudo its own time for the attack to join it', () => {
    const s = released({ p2: [SUDO, BUG] })
    const sudo = reduce(s, { type: 'SHOW', player: 'p2', card: SUDO.uid, at: 2000 })
    expect(sudo.state.window).toMatchObject({
      held: 'p2',
      openedAt: 2000,
      deadline: 2000 + SUDO_PARTNER_MS,
    })
    const joined = reduce(sudo.state, { type: 'SHOW', player: 'p2', card: BUG.uid, at: 2100 })
    expect(joined.events.map((e) => e.type)).toEqual(['shown'])
    const attack = reduce(joined.state, {
      type: 'ATTACK',
      player: 'p2',
      card: BUG.uid,
      combo: SUDO.uid,
      at: 2200,
    })
    expect(attack.events).toMatchObject([{ type: 'attacked', sudo: true }])
  })

  it('sends the Sudo home when its time runs out, and the time to attack starts anew', () => {
    const s = released({ p2: [SUDO, BUG] })
    const sudo = reduce(s, { type: 'SHOW', player: 'p2', card: SUDO.uid, at: 2000 })
    const early = reduce(sudo.state, { type: 'WINDOW_EXPIRED', at: 2000 + SUDO_PARTNER_MS - 1 })
    expect(early.events.map((e) => e.type)).toEqual(['rejected'])

    const over = 2000 + SUDO_PARTNER_MS
    const out = reduce(sudo.state, { type: 'WINDOW_EXPIRED', at: over })
    expect(out.events).toMatchObject([
      { type: 'takenBack', player: 'p2', cards: ['support-sudo'] },
      { type: 'windowOpened', player: 'p1', round: 2, deadline: over + WINDOW_NEXT_MS },
    ])
    expect(out.state.players.p2.shown).toEqual([])
    expect(out.state.window?.held).toBeUndefined()
  })

  it('starts the time to attack anew when the Sudo is taken back', () => {
    const s = released({ p2: [SUDO, BUG] })
    const sudo = reduce(s, { type: 'SHOW', player: 'p2', card: SUDO.uid, at: 2000 })
    const back = reduce(sudo.state, { type: 'TAKE_BACK', player: 'p2', at: 5000 })
    expect(back.events).toMatchObject([
      { type: 'takenBack', player: 'p2' },
      { type: 'windowOpened', round: 2, deadline: 5000 + WINDOW_NEXT_MS },
    ])
  })

  it('sends an attack card still out home when the time to attack runs out', () => {
    const s = released()
    const end = 1000 + WINDOW_FIRST_MS
    const shown = reduce(s, { type: 'SHOW', player: 'p2', card: BUG.uid, at: end - 1 })
    const out = reduce(shown.state, { type: 'WINDOW_EXPIRED', at: end })
    expect(out.events.map((e) => e.type)).toEqual(['takenBack', 'windowClosed'])
    expect(out.state.players.p2.shown).toEqual([])
    expect(out.state.window).toBeNull()
  })

  it('refuses the release owner a card put out while the release can be attacked', () => {
    const s = released()
    const r = reduce(s, { type: 'SHOW', player: 'p1', card: CR.uid, at: 1100 })
    expect(r.events).toMatchObject([{ type: 'rejected', reason: 'that card cannot be played now' }])
    expect(r.state.players.p1.shown).toEqual([])
  })

  it('files a release an attack destroys in the discard, caused by its destruction', () => {
    const s = released()
    const attacked = reduce(s, { type: 'ATTACK', player: 'p2', card: BUG.uid, at: 1001 })
    const hit = reduce(attacked.state, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'defend', card: null },
      at: 1002,
    })
    const destroyed = hit.events.find((e) => e.type === 'releaseDestroyed')
    expect(destroyed).toMatchObject({ player: 'p1', slot: 'frontend', card: FE.id })
    expect(hit.events).toContainEqual(
      expect.objectContaining({
        type: 'discarded',
        player: 'p1',
        card: FE.id,
        reason: 'destroyed',
        parent: destroyed?.id,
      }),
    )
    expect(hit.state.decks.discard.map((c) => c.uid)).toContain(FE.uid)
  })

  it('files the attacked release when a Security Bug finds its own slot taken, and keeps the thief’s', () => {
    const security: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
    const own: CardInstance = { uid: 'release-frontend#1', id: 'release-frontend' }
    const s = released({ p2: [security] })
    const holding: GameState = {
      ...s,
      players: { ...s.players, p2: { ...s.players.p2, release: { frontend: { card: own } } } },
    }
    const attacked = reduce(holding, {
      type: 'ATTACK',
      player: 'p2',
      card: security.uid,
      at: 1001,
    })
    const hit = reduce(attacked.state, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'defend', card: null },
      at: 1002,
    })
    expect(hit.events).toContainEqual(
      expect.objectContaining({
        type: 'discarded',
        player: 'p1',
        card: FE.id,
        reason: 'destroyed',
      }),
    )
    expect(hit.state.players.p2.release.frontend?.card.uid).toBe(own.uid)
  })

  // A PASS IS A MARK, nothing more (owner, 04.10): it costs the one who passed
  // nothing, and the time to attack ends early only when every opponent has
  // passed. Putting an attack or its Sudo out uses this chance to hit — the marks
  // start over, and nobody passes while it is out (ditayler, #211).
  it('starts the passes over when an attack is put out, and takes no pass while it is out', () => {
    const s = released({ p2: [SUDO, BUG], p3: [BUG3] })
    const passed = reduce(s, { type: 'PASS', player: 'p2', at: 1100 })
    expect(passed.state.window?.passed).toEqual(['p2'])
    const sudo = reduce(passed.state, { type: 'SHOW', player: 'p2', card: SUDO.uid, at: 1200 })
    expect(sudo.state.window).toMatchObject({ held: 'p2', passed: [] })
    const late = reduce(sudo.state, { type: 'PASS', player: 'p3', at: 1300 })
    expect(late.events).toMatchObject([{ type: 'rejected', reason: 'an attack is out' }])
    expect(late.state.window).not.toBeNull()
    expect(late.state.players.p2.shown).toEqual([SUDO.uid])
  })

  it('declares no win on a third release while a Sudo still has its time', () => {
    const s = released({ p2: [SUDO, BUG], p3: [BUG3] })
    const third: GameState = {
      ...s,
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          release: { ...s.players.p1.release, backend: { card: BE }, database: { card: DB } },
        },
      },
    }
    const passed = reduce(third, { type: 'PASS', player: 'p2', at: 1100 })
    const sudo = reduce(passed.state, { type: 'SHOW', player: 'p2', card: SUDO.uid, at: 1200 })
    const late = reduce(sudo.state, { type: 'PASS', player: 'p3', at: 1300 })
    expect(late.events.map((e) => e.type)).not.toContain('gameOver')
    expect(late.state.over).toBeFalsy()
  })

  it('leaves the passes empty after an attack put out is taken back', () => {
    const s = released({ p2: [BUG], p3: [BUG3] })
    const passed = reduce(s, { type: 'PASS', player: 'p3', at: 1100 })
    const out = reduce(passed.state, { type: 'SHOW', player: 'p2', card: BUG.uid, at: 1200 })
    const back = reduce(out.state, { type: 'TAKE_BACK', player: 'p2', at: 1300 })
    expect(back.state.window?.passed).toEqual([])
  })

  it('takes a pass back, and only a pass that was made', () => {
    const s = released({ p2: [BUG], p3: [BUG3] })
    const never = reduce(s, { type: 'UNPASS', player: 'p2', at: 1050 })
    expect(never.events).toMatchObject([{ type: 'rejected', reason: 'you have not passed' }])
    const passed = reduce(s, { type: 'PASS', player: 'p2', at: 1100 })
    const back = reduce(passed.state, { type: 'UNPASS', player: 'p2', at: 1200 })
    expect(back.events).toMatchObject([{ type: 'unpassed', player: 'p2' }])
    expect(back.state.window?.passed).toEqual([])
    // the mark is gone, so the last pass no longer ends the time to attack
    const p3 = reduce(back.state, { type: 'PASS', player: 'p3', at: 1300 })
    expect(p3.state.window).not.toBeNull()
  })

  it('lets the player under attack put a Sudo out for their defence', () => {
    const sudo: CardInstance = { uid: 'support-sudo#1', id: 'support-sudo' }
    const rollback: CardInstance = { uid: 'defense-rollback#0', id: 'defense-rollback' }
    const s = released({ p1: [sudo, rollback] })
    const attacked = reduce(s, { type: 'ATTACK', player: 'p2', card: BUG.uid, at: 1001 })
    expect(attacked.state.pending).toMatchObject({ kind: 'defend' })
    const r = reduce(attacked.state, { type: 'SHOW', player: 'p1', card: sudo.uid, at: 1002 })
    expect(r.events.map((e) => e.type)).toEqual(['shown'])
  })
})
