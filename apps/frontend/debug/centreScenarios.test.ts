import { expect, it } from 'vitest'
import { forViewer } from '~/network/session/audience'
import { createScenario, engine } from './scenarios'

it('starts Security Bug after taking the hit, with duplicate named copies still in hand', () => {
  const state = createScenario('securityRequest', 'security')
  expect(state.pending).toMatchObject({ kind: 'requestCard', player: 'you', target: 'p2' })
  expect(state.players.p2.hand.filter((c) => c.id === 'defense-hotfix')).toHaveLength(2)
  expect(state.decks.discard.some((c) => c.id === 'attack-security-bug')).toBe(false)
  const requested = engine.reduce(state, {
    type: 'RESOLVE',
    player: 'you',
    choice: { kind: 'requestCard', card: 'defense-hotfix' },
    at: Date.now(),
  })
  expect(requested.events.some((e) => e.type === 'rejected')).toBe(false)
  expect(requested.events).toContainEqual(expect.objectContaining({ type: 'requested', hit: true }))
})

it('starts a named hit with the actual requested pending and two copies', () => {
  const state = createScenario('securityGive', 'give')
  expect(state.pending).toMatchObject({
    kind: 'giveCard',
    player: 'p2',
    requested: 'defense-hotfix',
  })
  expect(state.players.p2.hand.filter((c) => c.id === 'defense-hotfix')).toHaveLength(2)
})

it('starts a real blind-pick decision and spends the attack only after choosing a slot', () => {
  const state = createScenario('blindSteal', 'steal')
  expect(state.pending).toMatchObject({ kind: 'stealCard', player: 'you', target: 'p2' })
  expect(state.decks.discard.some((c) => c.id === 'attack-bug')).toBe(false)
  const result = engine.reduce(state, {
    type: 'RESOLVE',
    player: 'you',
    choice: { kind: 'stealCard', index: 1 },
    at: Date.now(),
  })
  expect(result.events.some((e) => e.type === 'rejected')).toBe(false)
  expect(result.events).toContainEqual(expect.objectContaining({ type: 'handTransfer', index: 1 }))
  expect(result.state.players.p2.hand).toHaveLength(state.players.p2.hand.length - 1)
})

it('offers a real defence against the staged attack', () => {
  const state = createScenario('handDefense', 'defence')
  expect(state.pending).toMatchObject({ kind: 'defend', player: 'p2', scope: 'hand' })
  const hotfix = state.players.p2.hand.find((c) => c.id === 'defense-hotfix')
  if (!hotfix) throw new Error('Missing defence fixture')
  const result = engine.reduce(state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: hotfix.uid },
    at: Date.now(),
  })
  expect(result.events.some((e) => e.type === 'rejected')).toBe(false)
  expect(result.events).toContainEqual(
    expect.objectContaining({ type: 'defended', card: 'defense-hotfix' }),
  )
})

it.each([
  { scenario: 'branch' as const, count: 2 },
  { scenario: 'branchSudo' as const, count: 3 },
])('plays $scenario to produce $count draw piles', ({ scenario, count }) => {
  const state = createScenario(scenario, 'branch')
  const branch = state.players.you.hand.find((c) => c.id === 'operation-git-branch')
  if (!branch) throw new Error('Missing Branch fixture')
  const result = engine.reduce(state, {
    type: 'PLAY',
    player: 'you',
    card: branch.uid,
    combo:
      scenario === 'branchSudo'
        ? state.players.you.hand.find((c) => c.id === 'support-sudo')?.uid
        : undefined,
    at: Date.now(),
  })
  expect(result.events.some((e) => e.type === 'rejected')).toBe(false)
  expect(result.state.decks.main).toHaveLength(count)
})

it('gives the blind-transfer observer the public event without the stolen identity', () => {
  const state = createScenario('blindSteal', 'observer')
  const result = engine.reduce(state, {
    type: 'RESOLVE',
    player: 'you',
    choice: { kind: 'stealCard', index: 0 },
    at: Date.now(),
  })
  expect(state.seating).toContain('p3')
  const observer = forViewer(result.events, 'p3').find((event) => event.type === 'handTransfer')
  const receiver = forViewer(result.events, 'you').find((event) => event.type === 'handTransfer')
  expect(observer).toMatchObject({ type: 'handTransfer', index: 0 })
  expect(observer).not.toHaveProperty('card')
  expect(receiver).toHaveProperty('card')
})

it('lets the giver send the second duplicate and exposes the named card to the observer', () => {
  const state = createScenario('securityGive', 'second-copy')
  const copies = state.players.p2.hand.filter((card) => card.id === 'defense-hotfix')
  const result = engine.reduce(state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'giveCard', card: copies[1].uid },
    at: Date.now(),
  })
  expect(result.events.some((event) => event.type === 'rejected')).toBe(false)
  expect(result.state.players.p2.hand).toContainEqual(copies[0])
  expect(result.state.players.p2.hand).not.toContainEqual(copies[1])
  expect(result.state.players.you.hand).toContainEqual(copies[1])
  expect(forViewer(result.events, 'p3')).toContainEqual(
    expect.objectContaining({
      type: 'handTransfer',
      card: 'defense-hotfix',
      publicCard: true,
    }),
  )
})
