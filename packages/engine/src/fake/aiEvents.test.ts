import { describe, expect, it } from 'vitest'
import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const BASE: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (setup: Setup = BASE): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const AI: CardInstance = { uid: 'trigger-ai#ai0', id: 'trigger-ai' }

// Drives one specific AI event: stack a trigger-ai on top of pile 0 and shrink
// the events deck to a single entry so which event fires is deterministic, then
// draw it. Same pattern triggers.test.ts uses throughout.
function fireEvent(base: GameState, eventId: string, player = 'p1') {
  const staged: GameState = {
    ...base,
    turn: { ...base.turn, player, drawnFrom: [] },
    decks: {
      ...base.decks,
      main: [[AI, ...base.decks.main[0]], ...base.decks.main.slice(1)],
      events: [{ uid: `${eventId}#e0`, id: eventId }],
    },
  }
  return reduce(staged, { type: 'DRAW', player, at: 1000 })
}

const game = (patch: Partial<GameState> = {}): GameState => ({
  ...engine.createGame(config()),
  ...patch,
})

describe('a release placed by an AI Release event (#73)', () => {
  it('can be attacked, so it opens a reaction window like any other', () => {
    // The window is the engine's only path to ATTACK, so a release that opens
    // none is permanently unattackable — strictly better than one a player
    // shipped, which inverts the rules ("Этот релиз можно атаковать").
    const r = fireEvent(game(), 'ai-release-database')

    expect(r.state.players.p1.release.database).toBeTruthy()
    expect(r.state.window).toBeTruthy()
    expect(r.state.window?.target).toMatchObject({ player: 'p1', slot: 'database' })
  })
})

describe('Crush against a slot that holds nothing (#70)', () => {
  it('does not open a neutralize prompt at all', () => {
    // Crush destroys "соответствующую карту Release". With that slot empty
    // there is nothing to destroy, but the prompt opened anyway whenever the
    // player held any neutralize method — so they burned a Debugger, or
    // sacrificed a different release, to answer a threat with no legal target.
    const base = engine.createGame(config())
    const dbg: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
    const be: CardInstance = { uid: 'release-backend#0', id: 'release-backend' }
    const state = game({
      players: {
        ...base.players,
        p1: { ...base.players.p1, hand: [dbg], release: { backend: { card: be } } },
      },
    })

    const r = fireEvent(state, 'ai-crush-frontend')

    expect(r.state.pending).toBeNull()
    // And the untargeted release it might have been sacrificed for is untouched.
    expect(r.state.players.p1.release.backend).toBeTruthy()
  })

  it('still opens the prompt when the targeted slot is occupied', () => {
    const base = engine.createGame(config())
    const dbg: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
    const fe: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
    const state = game({
      players: {
        ...base.players,
        p1: { ...base.players.p1, hand: [dbg], release: { frontend: { card: fe } } },
      },
    })

    const r = fireEvent(state, 'ai-crush-frontend')

    // `source` names the AI card this prompt belongs to (resolveAiEvent's
    // ai-crush-* branch) — driven through the real trigger resolution, not a
    // state literal, so a regression that drops the field here is caught.
    expect(r.state.pending).toMatchObject({
      kind: 'crush',
      player: 'p1',
      source: 'ai-crush-frontend',
    })
  })
})

// CRUSH IS ANSWERED BY A DEBUGGER, AND MAY BE REFUSED. A standing Monitoring
// answers it on its own (the block below). The rules forbid the 503's third
// method here — "Пожертвовать другой релиз нельзя: Crush бьёт строго по своему
// типу релиза" (docs/rules/cards.md) — and Pass is "I do not defend", the
// release it aims at destroyed (owner, 24.09).
describe('answering a Crush', () => {
  const dbg: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }
  const fe: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
  const be: CardInstance = { uid: 'release-backend#0', id: 'release-backend' }
  const crushed = () => {
    const base = engine.createGame(config())
    const state = game({
      players: {
        ...base.players,
        p1: {
          ...base.players.p1,
          hand: [dbg],
          release: { frontend: { card: fe }, backend: { card: be } },
        },
      },
    })
    return fireEvent(state, 'ai-crush-frontend').state
  }

  it('offers no sacrifice, even with another release standing', () => {
    expect(crushed().pending).toMatchObject({ kind: 'crush', methods: ['debugger'] })
  })

  it('destroys the release it aims at when its owner passes', () => {
    const r = reduce(crushed(), { type: 'PASS', player: 'p1', at: 2000 })

    expect(r.state.pending).toBeNull()
    expect(r.state.players.p1.release.frontend).toBeUndefined()
    // only the aimed-at slot: the other release is no part of the refusal
    expect(r.state.players.p1.release.backend).toBeTruthy()
    // the Debugger was not spent — refusing is not answering
    expect(r.state.players.p1.hand.map((c) => c.id)).toContain('protection-debugger')
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'releaseDestroyed', player: 'p1', slot: 'frontend' }),
    )
  })

  it('takes no refusal from anyone but its owner', () => {
    const state = crushed()
    const r = reduce(state, { type: 'PASS', player: 'p2', at: 2000 })

    expect(r.state.pending).toMatchObject({ kind: 'crush', player: 'p1' })
    expect(r.state.players.p1.release.frontend).toBeTruthy()
  })
})

describe.each([
  'frontend',
  'backend',
  'database',
] as const)('Monitoring against Crush %s (#159)', (slot) => {
  const release: CardInstance = { uid: `release-${slot}#guarded`, id: `release-${slot}` }
  const dbg: CardInstance = { uid: 'protection-debugger#guarded', id: 'protection-debugger' }
  const monitoring: CardInstance = {
    uid: 'protection-monitoring#guarded',
    id: 'protection-monitoring',
  }
  const aiMonitoring: CardInstance = {
    uid: 'ai-monitoring#guarded',
    id: 'protection-monitoring',
    event: 'ai-monitoring',
  }

  it.each([
    { name: 'Monitoring alone', monitor: monitoring, hand: [] },
    { name: 'Monitoring with a Debugger', monitor: monitoring, hand: [dbg] },
    { name: 'AI Monitoring alone', monitor: aiMonitoring, hand: [] },
    { name: 'AI Monitoring with a Debugger', monitor: aiMonitoring, hand: [dbg] },
  ])('automatically neutralizes with $name', ({ monitor, hand }) => {
    const base = game()
    const guarded: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: {
          ...base.players.p1,
          hand,
          release: { [slot]: { card: release }, monitoring: monitor },
        },
      },
    }

    const r = fireEvent(guarded, `ai-crush-${slot}`)

    expect(r.state.pending).toBeNull()
    expect(r.state.drawing).toBeNull()
    expect(r.state.players.p1.hand).toEqual(hand)
    expect(r.state.players.p1.release).toEqual({
      [slot]: { card: release },
      monitoring: monitor,
    })
    expect(r.state.decks.discard).toEqual([AI])
    expect(r.state.decks.events).toEqual([{ uid: `ai-crush-${slot}#e0`, id: `ai-crush-${slot}` }])
    expect(r.events.map((event) => event.type)).toEqual([
      'drawn',
      'aiRevealed',
      'discarded',
      'neutralized',
    ])
    const revealed = r.events.find((event) => event.type === 'aiRevealed')
    expect(revealed).toMatchObject({
      player: 'p1',
      aiCard: 'trigger-ai',
      eventCard: `ai-crush-${slot}`,
    })
    expect(r.events.find((event) => event.type === 'discarded')).toMatchObject({
      card: 'trigger-ai',
      reason: 'trigger',
      parent: revealed?.id,
    })
    const neutralized = r.events.find((event) => event.type === 'neutralized')
    expect(neutralized).toMatchObject({ player: 'p1', method: 'monitoring' })
    expect(neutralized?.visibleTo).toBeUndefined()
    expect(r.state.eventSeq).toBe(neutralized?.id)
  })

  it('does not spend a defense or report neutralization when the target slot is empty', () => {
    const base = game()
    const guarded: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: { ...base.players.p1, hand: [dbg], release: { monitoring } },
      },
    }

    const r = fireEvent(guarded, `ai-crush-${slot}`)

    expect(r.state.pending).toBeNull()
    expect(r.state.players.p1.hand).toEqual([dbg])
    expect(r.state.players.p1.release).toEqual({ monitoring })
    expect(r.events.map((event) => event.type)).toEqual(['drawn', 'aiRevealed', 'discarded'])
    expect(r.state.decks.events).toEqual([{ uid: `ai-crush-${slot}#e0`, id: `ai-crush-${slot}` }])
  })

  it('still allows a Debugger response without Monitoring', () => {
    const base = game()
    const unguarded: GameState = {
      ...base,
      players: {
        ...base.players,
        p1: { ...base.players.p1, hand: [dbg], release: { [slot]: { card: release } } },
      },
    }
    const fired = fireEvent(unguarded, `ai-crush-${slot}`)

    expect(fired.state.pending).toMatchObject({
      kind: 'crush',
      player: 'p1',
      slot,
      source: `ai-crush-${slot}`,
    })
    const resolved = reduce(fired.state, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'crush', method: 'debugger' },
      at: 1100,
    })

    expect(resolved.state.pending).toBeNull()
    expect(resolved.state.players.p1.hand).toEqual([])
    expect(resolved.state.players.p1.release[slot]?.card).toEqual(release)
    expect(resolved.state.decks.discard).toEqual([AI, dbg])
  })
})

describe('Bad Vibe-Coding (#69)', () => {
  it('does not end the turn — it is a discard, not a lost turn', () => {
    // The rules say only "сбросьте одну карту из руки". Reusing the handLimit
    // pending meant resolving it advanced the seat, turning a minor tax into
    // Hallucination.
    const base = engine.createGame(config())
    const bug: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
    const spare: CardInstance = { uid: 'attack-ddos#0', id: 'attack-ddos' }
    const state = game({
      players: { ...base.players, p1: { ...base.players.p1, hand: [bug, spare] } },
    })

    const fired = fireEvent(state, 'ai-bad-vibe-coding')
    // `source` names the AI card this prompt belongs to (resolveAiEvent's
    // ai-bad-vibe-coding branch) — driven through the real trigger
    // resolution, not a state literal, so a regression that drops the field
    // here is caught.
    expect(fired.state.pending).toMatchObject({ source: 'ai-bad-vibe-coding' })

    const resolved = reduce(fired.state, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'handLimit', cards: [bug.uid] },
      at: 1100,
    })

    expect(resolved.state.players.p1.hand.map((c) => c.uid)).toEqual([spare.uid])
    expect(resolved.state.turn.player).toBe('p1')
  })

  it('fizzles on an empty hand instead of deadlocking the table', () => {
    // With no cards there is no legal answer: `[]` never matches `excess: 1`,
    // and a pending blocks every action for every player, so the game stalls
    // permanently. The effect should simply have nothing to take.
    const base = engine.createGame(config())
    const state = game({
      players: { ...base.players, p1: { ...base.players.p1, hand: [] } },
    })

    const r = fireEvent(state, 'ai-bad-vibe-coding')

    expect(r.state.pending).toBeNull()
  })
})

// The phantom model is gone (#93): an event card that stays on the table is the
// event card, held out of its own deck until it leaves. What used to be checked
// here — that no phantom reaches the discard — is now the stronger rule that no
// event card does, covered end to end in ./eventCards.test.ts.
