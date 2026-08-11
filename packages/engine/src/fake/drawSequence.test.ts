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

const AI: CardInstance = { uid: 'trigger-ai#gvc', id: 'trigger-ai' }
const c = (id: string, n: string): CardInstance => ({ uid: `${id}#${n}`, id })

// Good Vibe-Coding draws two cards. Stack exactly what those two draws will
// find on top of pile 0, and hand the events deck a fixed list so which event
// fires is never the shuffle's decision.
function goodVibeCoding(top: CardInstance[], events: CardInstance[], hand: CardInstance[] = []) {
  const base = engine.createGame(config)
  const staged: GameState = {
    ...base,
    turn: { ...base.turn, player: 'p1', drawnFrom: [] },
    players: { ...base.players, p1: { ...base.players.p1, hand } },
    decks: {
      ...base.decks,
      main: [[AI, ...top, ...base.decks.main[0]], ...base.decks.main.slice(1)],
      events: [c('ai-good-vibe-coding', 'e0'), ...events],
    },
  }
  return reduce(staged, { type: 'DRAW', player: 'p1', at: 1000 })
}

describe('Good Vibe-Coding draws two, one at a time (#72)', () => {
  it('pauses on the first Error 503 instead of drawing over its own pending', () => {
    // `GameState.pending` is a single slot. Drawing both cards with no check
    // between them let the second trigger overwrite the first: a player who
    // owed two neutralizations faced one, and the first threat vanished.
    const debuggers = [c('protection-debugger', 'd1'), c('protection-debugger', 'd2')]
    const r = goodVibeCoding(
      [c('trigger-error-503', 't1'), c('trigger-error-503', 't2')],
      [],
      debuggers,
    )

    expect(r.state.pending).toMatchObject({ kind: 'neutralize503', player: 'p1' })

    // The second card is still on the deck, owed — not silently consumed.
    const answered = reduce(r.state, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'neutralize503', method: 'debugger' },
      at: 1100,
    })

    // Resuming finds the second Error 503 and asks again, rather than the
    // sequence having quietly ended while the card stayed on the pile.
    expect(answered.state.pending).toMatchObject({ kind: 'neutralize503', player: 'p1' })
  })

  it('stops when Hallucination ends the turn mid-sequence', () => {
    // Draw 1 chains into ai-hallucination, which ends the turn. The loop went
    // on to draw card 2 for a player whose turn was already over.
    const r = goodVibeCoding(
      [c('trigger-ai', 'h1'), c('attack-bug', 'b1')],
      [c('ai-hallucination', 'e1')],
    )

    expect(r.state.turn.player).toBe('p2')
    // The bug card that would have been draw 2 never reached p1's hand.
    expect(r.state.players.p1.hand.map((x) => x.uid)).not.toContain('attack-bug#b1')
  })

  it('stops when the first card eliminates the drawer', () => {
    // With no neutralize method, Error 503 eliminates. Draw 2 then dealt a card
    // into an eliminated player's hand, where it was stranded off the board.
    const r = goodVibeCoding([c('trigger-error-503', 't1'), c('attack-bug', 'b1')], [])

    expect(r.state.eliminated).toContain('p1')
    expect(r.state.players.p1.hand).toHaveLength(0)
  })

  it('draws both when nothing interrupts', () => {
    const r = goodVibeCoding([c('attack-bug', 'b1'), c('attack-ddos', 'd1')], [])

    const uids = r.state.players.p1.hand.map((x) => x.uid)
    expect(uids).toContain('attack-bug#b1')
    expect(uids).toContain('attack-ddos#d1')
  })

  it('leaves nothing half-drawn once the sequence is over', () => {
    const r = goodVibeCoding([c('attack-bug', 'b1'), c('attack-ddos', 'd1')], [])
    expect(r.state.drawing).toBeNull()
  })

  it('refuses a play while a draw is still owed', () => {
    // Answer 2: "Playing cards from hand is impossible while a draw is in
    // progress." Nothing enforces that separately, and nothing needs to: the
    // sequence only ever pauses *on* a pending, and a pending already empties
    // `playable`. A dedicated `drawing` guard was written here and removed —
    // no mutation could make it fail, because it could never be reached.
    const bug = c('attack-bug', 'inhand')
    const r = goodVibeCoding(
      [c('trigger-error-503', 't1'), c('attack-ddos', 'd1')],
      [],
      [c('protection-debugger', 'd1'), bug],
    )
    // Paused: the 503 is owed and the second card is still to come. This state
    // does sit between actions, so it is exactly where a player could otherwise
    // spend the interruption on a play.
    expect(r.state.drawing).toMatchObject({ player: 'p1', piles: [0] })
    expect(engine.project(r.state, 'p1').self.playable).toEqual([])

    const answered = reduce(r.state, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'neutralize503', method: 'debugger' },
      at: 1100,
    })

    // Sequence spent, so the hand is live again.
    expect(answered.state.drawing).toBeNull()
    expect(engine.project(answered.state, 'p1').self.playable).toContain(bug.uid)
  })
})
