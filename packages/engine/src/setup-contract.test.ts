import { describe, expect, it } from 'vitest'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './fake'
import { normalizeSetup } from './setup-contract'

const engine = createFakeEngine()

const game = (setup: Record<string, string>, deck = FAKE_DECK, events = FAKE_EVENTS) =>
  engine.createGame({
    gameId: 'g',
    seed: 1,
    players: [
      { id: 'p1', name: 'a' },
      { id: 'p2', name: 'b' },
    ],
    setup,
    deck,
    events,
  })

describe('an unrecognised mode value (#75.2)', () => {
  it('does not quietly become the opposite of what was asked for', () => {
    // `HAND_LIMITS[setup.handLimit] ?? Infinity` turned a typo into *no* hand
    // limit — the loosest mode, when the player had picked the strictest.
    const { setup, ignored } = normalizeSetup({ handLimit: 'memoryProblem' })
    expect(setup.handLimit).toBe('base')
    expect(ignored).toContain('handLimit=memoryProblem')
  })

  it('keeps every value the lobby can actually produce', () => {
    const { setup, ignored } = normalizeSetup({
      handLimit: 'memory',
      releases: 'fast',
      releaseCond: 'easy',
      ai: 'no',
      gitBranch: 'strategic',
    })
    expect(ignored).toEqual([])
    expect(setup).toMatchObject({ handLimit: 'memory', releases: 'fast', gitBranch: 'strategic' })
  })

  it('fills in the axes a caller left out, so no consumer needs a fallback', () => {
    const { setup, ignored } = normalizeSetup({})
    expect(ignored).toEqual([])
    expect(setup).toMatchObject({ handLimit: 'base', releases: 'base', releaseCond: 'base' })
  })

  it('names an axis the engine has no opinion on rather than pretending to read it', () => {
    const { ignored } = normalizeSetup({ tempo: 'blitz' })
    expect(ignored).toContain('tempo?')
  })

  it('reaches the game state, so a bad lobby config is inspectable', () => {
    expect(game({ handLimit: 'nope' }).ignored.setup).toContain('handLimit=nope')
    expect(game({ handLimit: 'memory' }).ignored.setup).toEqual([])
  })
})

describe('a deck entry the engine has no rules for (#75.3)', () => {
  it('is still dropped, but named instead of vanishing', () => {
    // Dropping it is right — an inert card nobody can play is worse than no
    // card. Dropping it silently is what turns a 104-card catalogue into a
    // 91-card deck that nobody notices until they count.
    const withGhost = [...FAKE_DECK, { id: 'card-that-does-not-exist', qty: 3 }]
    const state = game({}, withGhost)

    expect(state.ignored.cards).toEqual(['card-that-does-not-exist'])
    expect(state.decks.main.flat().some((c) => c.id === 'card-that-does-not-exist')).toBe(false)
  })

  it('says nothing when the whole deck is supported', () => {
    expect(game({}).ignored.cards).toEqual([])
  })
})
