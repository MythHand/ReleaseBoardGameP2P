import type { Action } from '../actions'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'

const engine = createFakeEngine()
const c = (id: string, uid = id): CardInstance => ({ id, uid })
const FE = c('release-frontend')
const BE = c('release-backend')
const BUG = c('attack-bug')
const STEAL = c('attack-security-bug')
const BRANCH = c('operation-git-branch')
const MERGE = c('operation-git-merge')
const CR = c('support-code-review')
const DEBUGGER = c('protection-debugger')
const HOTFIX = c('defense-hotfix')
const AI = c('trigger-ai')
const filler = (n: number) => Array.from({ length: n }, (_, i) => c('defense-hotfix', `pile-${i}`))

function table(hand: CardInstance[], setup: Setup = {}): GameState {
  const state = engine.createGame({
    gameId: 'turn-limits',
    seed: 42,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
    setup: {
      handLimit: 'base',
      releases: 'base',
      releaseCond: 'easy',
      ai: 'base',
      gitBranch: 'base',
      ...setup,
    },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  return {
    ...state,
    players: {
      ...state.players,
      p1: { ...state.players.p1, hand, release: {} },
      p2: { ...state.players.p2, hand: [BUG, STEAL], release: {} },
    },
    decks: { main: [filler(8)], discard: [], events: [] },
  }
}

function apply(state: GameState, action: Action): GameState {
  const result = engine.reduce(state, action)
  const rejected = result.events.find((event) => event.type === 'rejected')
  if (rejected) throw new Error(JSON.stringify(rejected))
  return result.state
}
const play = (state: GameState, card: CardInstance, at = 1000) =>
  apply(state, { type: 'PLAY', player: 'p1', card: card.uid, at })
const pass = (state: GameState, player = 'p2', at = 1100) =>
  apply(state, { type: 'PASS', player, at })

it.each(['base', 'strategic'])('does not reopen a completed %s draw after Branch', (gitBranch) => {
  const drawn = apply(table([BRANCH], { gitBranch }), { type: 'DRAW', player: 'p1', at: 1000 })
  const branched = play(drawn, BRANCH, 1001)
  expect(engine.project(branched, 'p1').turn.hasDrawn).toBe(true)
  const again = engine.reduce(branched, { type: 'DRAW', player: 'p1', at: 1002 })
  expect(again.events).toMatchObject([{ type: 'rejected', reason: 'already drew this turn' }])
  expect(again.state).toBe(branched)
  expect(apply(branched, { type: 'PUSH', player: 'p1', at: 1003 }).turn.player).toBe('p2')
})

it.each([
  ['base', 2],
  ['strategic', 1],
] as const)('draws from the current piles when Branch precedes the first %s draw', (gitBranch, gain) => {
  const branched = play(table([BRANCH], { gitBranch }), BRANCH)
  const drawn = apply(branched, { type: 'DRAW', player: 'p1', at: 1001 })
  expect(drawn.players.p1.hand).toHaveLength(gain)
  expect(engine.project(drawn, 'p1').turn.hasDrawn).toBe(true)
})

it('keeps a draw completed across Merge followed by another Branch', () => {
  let state = apply(table([MERGE, BRANCH]), { type: 'DRAW', player: 'p1', at: 1000 })
  state = play(state, MERGE, 1001)
  state = play(state, BRANCH, 1002)
  expect(engine.project(state, 'p1').turn.hasDrawn).toBe(true)
  expect(engine.reduce(state, { type: 'DRAW', player: 'p1', at: 1003 }).events[0].type).toBe(
    'rejected',
  )
})

it('finishes the same draw after a trigger, then keeps it completed after Branch', () => {
  const state = table([BRANCH, DEBUGGER])
  state.decks.main = [[c('trigger-error-503'), ...filler(4)], [c('defense-hotfix', 'second-pile')]]
  const paused = apply(state, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(paused.drawing).toMatchObject({ player: 'p1', piles: [1] })
  expect(engine.project(paused, 'p1').turn.hasDrawn).toBe(false)
  const resumed = apply(paused, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'debugger' },
    at: 1001,
  })
  expect(resumed.drawing).toBeNull()
  expect(resumed.players.p1.hand).toContainEqual(c('defense-hotfix', 'second-pile'))
  const branched = play(resumed, BRANCH, 1002)
  expect(engine.project(branched, 'p1').turn.hasDrawn).toBe(true)
})

it('preserves the two Good Vibe-Coding draws without allowing another ordinary draw', () => {
  const state = table([BRANCH])
  state.decks.main = [[AI, ...filler(6)]]
  state.decks.events = [c('ai-good-vibe-coding')]
  const drawn = apply(state, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(drawn.players.p1.hand).toHaveLength(3)
  const branched = play(drawn, BRANCH, 1001)
  expect(engine.reduce(branched, { type: 'DRAW', player: 'p1', at: 1002 }).events[0].type).toBe(
    'rejected',
  )
})

it('resumes the remaining ordinary piles after Good Vibe-Coding bonus draws', () => {
  const state = table([BRANCH, DEBUGGER])
  const last = c('defense-hotfix', 'last-pile')
  state.decks.main = [[AI, c('trigger-error-503'), ...filler(4)], [last]]
  state.decks.events = [c('ai-good-vibe-coding')]
  const paused = apply(state, { type: 'DRAW', player: 'p1', at: 1000 })
  expect(paused.pending?.kind).toBe('neutralize503')
  const resumed = apply(paused, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'neutralize503', method: 'debugger' },
    at: 1001,
  })
  expect(resumed.players.p1.hand).toContainEqual(last)
  expect(resumed.players.p1.hand).toHaveLength(3)
  expect(engine.project(resumed, 'p1').turn.hasDrawn).toBe(true)
  expect(engine.reduce(resumed, { type: 'DRAW', player: 'p1', at: 1002 }).events[0].type).toBe(
    'rejected',
  )
})

it('allows a retry after a release is destroyed during its reaction window', () => {
  let state = play(table([FE, BE]), FE)
  state = apply(state, { type: 'ATTACK', player: 'p2', card: BUG.uid, at: 1001 })
  state = apply(state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  expect(state.window).toBeNull()
  expect(state.players.p1.release.frontend).toBeUndefined()
  expect(engine.project(state, 'p1').self.playable).toContain(BE.uid)
  expect(play(state, BE, 1003).players.p1.release.backend?.card).toEqual(BE)
})

it('allows a retry after theft and does not count the thief release against the original owner', () => {
  let state = play(table([FE, BE]), FE)
  state = apply(state, { type: 'ATTACK', player: 'p2', card: STEAL.uid, at: 1001 })
  state = apply(state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  expect(state.window?.target.player).toBe('p2')
  state = pass(state, 'p1', 1003)
  expect(state.players.p2.release.frontend?.card).toEqual(FE)
  expect(play(state, BE, 1004).players.p1.release.backend?.card).toEqual(BE)
})

it('spends the allowance only after a surviving release finishes, including after serialization', () => {
  const pending = play(table([FE, BE]), FE)
  expect(pending.turn.releasesPlayed).toBe(0)
  const finished = pass(JSON.parse(JSON.stringify(pending)))
  expect(finished.turn.releasesPlayed).toBe(1)
  expect(engine.project(finished, 'p1').self.playable).not.toContain(BE.uid)
  expect(
    engine.reduce(finished, { type: 'PLAY', player: 'p1', card: BE.uid, at: 1200 }).events[0].type,
  ).toBe('rejected')
})

it('does not spend another allowance for a repelled attack and its reopened window', () => {
  let state = play(table([FE, BE, HOTFIX]), FE)
  state = apply(state, { type: 'ATTACK', player: 'p2', card: BUG.uid, at: 1001 })
  state = apply(state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1002,
  })
  expect(state.window?.round).toBe(2)
  expect(state.turn.releasesPlayed).toBe(0)
  expect(pass(state).turn.releasesPlayed).toBe(1)
})

it('counts a Code Review release immediately without a reaction window', () => {
  const state = apply(table([FE, BE, CR]), {
    type: 'PLAY',
    player: 'p1',
    card: FE.uid,
    combo: CR.uid,
    at: 1000,
  })
  expect(state.window).toBeNull()
  expect(state.turn.releasesPlayed).toBe(1)
  expect(engine.project(state, 'p1').self.playable).not.toContain(BE.uid)
})

it('does not refund a successful release after a later Crush on the same turn', () => {
  let state = pass(play(table([FE, BE]), FE))
  state.decks.main = [[AI, ...filler(2)]]
  state.decks.events = [c('ai-crush-frontend')]
  state = apply(state, { type: 'DRAW', player: 'p1', at: 1200 })
  expect(state.players.p1.release.frontend).toBeUndefined()
  expect(state.turn.releasesPlayed).toBe(1)
  expect(engine.project(state, 'p1').self.playable).not.toContain(BE.uid)
})

it('does not spend the hand-release allowance for a successful AI release', () => {
  const state = table([BE])
  state.decks.main = [[AI, ...filler(2)]]
  state.decks.events = [c('ai-release-frontend')]
  const drawn = apply(state, { type: 'DRAW', player: 'p1', at: 1000 })
  const finished = pass(drawn)
  expect(finished.players.p1.release.frontend?.card.event).toBe('ai-release-frontend')
  expect(finished.turn.releasesPlayed).toBe(0)
  expect(play(finished, BE, 1200).players.p1.release.backend?.card).toEqual(BE)
})

it('still permits multiple successful releases under Fast Release', () => {
  let state = pass(play(table([FE, BE], { releases: 'fast' }), FE))
  state = play(state, BE, 1200)
  state = pass(state, 'p2', 1300)
  expect(state.turn.releasesPlayed).toBe(2)
  expect(state.players.p1.release.frontend?.card).toEqual(FE)
  expect(state.players.p1.release.backend?.card).toEqual(BE)
})
