import { describe, expect, it } from 'vitest'
import type { CardInstance, GameState } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

// The deadline each decision a card raises opens with. The hand limit and the
// Error 503 out of the deck are pinned in reduce.test.ts and triggers.test.ts.

const engine = createFakeEngine()

const card = (id: string, tag = '0'): CardInstance => ({ uid: `${id}#t${tag}`, id })
const AT = 5000

// Two seats, p1 on turn and already drawn, hands and discard as given.
function game(
  p1: CardInstance[],
  p2: CardInstance[] = [],
  discard: CardInstance[] = [],
): GameState {
  const base = engine.createGame({
    gameId: 'g',
    seed: 3,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  return {
    ...base,
    turn: { ...base.turn, player: 'p1', drawnFrom: [0] },
    decks: { ...base.decks, discard },
    players: {
      ...base.players,
      p1: { ...base.players.p1, hand: p1 },
      p2: { ...base.players.p2, hand: p2 },
    },
  }
}

// p1 draws a trigger-ai with the events deck shrunk to one card, the way
// triggers.test.ts drives a single AI event.
function drawEvent(state: GameState, event: string): GameState {
  const ai = card('trigger-ai', 'ai')
  const staged: GameState = {
    ...state,
    turn: { ...state.turn, drawnFrom: [] },
    decks: {
      ...state.decks,
      main: [[ai, ...state.decks.main[0]], ...state.decks.main.slice(1)],
      events: [card(event, 'e')],
    },
  }
  return reduce(staged, { type: 'DRAW', player: 'p1', at: AT }).state
}

const play = (state: GameState, played: CardInstance, extra: object = {}) =>
  reduce(state, { type: 'PLAY', player: 'p1', card: played.uid, ...extra, at: AT }).state

describe('the deadline of a decision a card raises', () => {
  it('gives AI Crush 20 seconds', () => {
    const s = game([card('protection-debugger')])
    const zoned = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1, release: { frontend: { card: card('release-frontend') } } },
      },
    }
    expect(drawEvent(zoned, 'ai-crush-frontend').pending).toMatchObject({
      kind: 'crush',
      openedAt: AT,
      deadline: AT + 20_000,
    })
  })

  it('gives AI Bad Vibe-Coding 20 seconds', () => {
    expect(drawEvent(game([card('attack-bug')]), 'ai-bad-vibe-coding').pending).toMatchObject({
      kind: 'handLimit',
      openedAt: AT,
      deadline: AT + 20_000,
    })
  })

  it('gives the AI Error 503 20 seconds', () => {
    expect(drawEvent(game([card('protection-debugger')]), 'ai-error-503').pending).toMatchObject({
      kind: 'neutralize503',
      openedAt: AT,
      deadline: AT + 20_000,
    })
  })

  it('gives AI Inside 20 seconds', () => {
    const s = game([], [], [card('release-frontend')])
    expect(drawEvent(s, 'ai-inside').pending).toMatchObject({
      kind: 'pickFromDiscard',
      openedAt: AT,
      deadline: AT + 20_000,
    })
  })

  it('gives Git Cherry-pick 30 seconds', () => {
    const cherry = card('operation-git-cherry-pick')
    expect(play(game([cherry], [], [card('attack-bug')]), cherry).pending).toMatchObject({
      kind: 'pickFromDiscard',
      openedAt: AT,
      deadline: AT + 30_000,
    })
  })

  it('gives the Git Rebase order 30 seconds', () => {
    const rebase = card('operation-git-rebase')
    const target = { target: { kind: 'pile', pile: 0 } }
    expect(play(game([rebase]), rebase, target).pending).toMatchObject({
      kind: 'reorderTop',
      openedAt: AT,
      deadline: AT + 30_000,
    })
  })

  it("gives System Upgrade's discarding 20 seconds, and the pick under sudo 20 of its own", () => {
    const upgrade = card('operation-system-upgrade')
    const sudo = card('support-sudo')
    const thrown = card('attack-bug', 'p2')
    const opened = play(game([upgrade, sudo], [thrown]), upgrade, { combo: sudo.uid })
    expect(opened.pending).toMatchObject({
      phase: 'discarding',
      openedAt: AT,
      deadline: AT + 20_000,
    })
    const picking = reduce(opened, {
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'upgradeDiscard', card: thrown.uid },
      at: 9000,
    }).state
    expect(picking.pending).toMatchObject({
      phase: 'picking',
      openedAt: 9000,
      deadline: 9000 + 20_000,
    })
  })

  it('multiplies the deadline by the action time the host chose', () => {
    const rebase = card('operation-git-rebase')
    const slow = { ...game([rebase]), actionTime: 3 }
    expect(play(slow, rebase, { target: { kind: 'pile', pile: 0 } }).pending).toMatchObject({
      deadline: AT + 90_000,
    })
  })
})
