import { describe, expect, it } from 'vitest'
import { toAction } from './toAction'

describe('toAction', () => {
  it('stamps the player and the clock onto a play', () => {
    expect(toAction({ kind: 'play', card: 'c1' }, 'you', 1234)).toEqual({
      type: 'PLAY',
      player: 'you',
      card: 'c1',
      target: undefined,
      combo: undefined,
      at: 1234,
    })
  })

  it('carries the target and the combo through untouched', () => {
    const target = { kind: 'player', player: 'p2' } as const
    const a = toAction({ kind: 'play', card: 'c1', target, combo: 'c2' }, 'you', 9)
    expect(a).toMatchObject({ type: 'PLAY', target, combo: 'c2' })
  })

  it('stamps the player and the clock onto a draw, carrying an optional pile', () => {
    expect(toAction({ kind: 'draw', pile: 1 }, 'you', 5)).toEqual({
      type: 'DRAW',
      player: 'you',
      pile: 1,
      at: 5,
    })
  })

  it('stamps a push', () => {
    expect(toAction({ kind: 'push' }, 'you', 6)).toEqual({ type: 'PUSH', player: 'you', at: 6 })
  })

  it('carries the combo through untouched on an attack', () => {
    expect(toAction({ kind: 'attack', card: 'c1', combo: 'c2' }, 'you', 8)).toEqual({
      type: 'ATTACK',
      player: 'you',
      card: 'c1',
      combo: 'c2',
      at: 8,
    })
  })

  it('stamps a pass and an unpass', () => {
    expect(toAction({ kind: 'pass' }, 'you', 1)).toEqual({ type: 'PASS', player: 'you', at: 1 })
    expect(toAction({ kind: 'unpass' }, 'you', 2)).toEqual({
      type: 'UNPASS',
      player: 'you',
      at: 2,
    })
  })

  it('omits the player on WINDOW_EXPIRED, which belongs to no one', () => {
    expect(toAction({ kind: 'windowExpired' }, 'you', 7)).toEqual({
      type: 'WINDOW_EXPIRED',
      at: 7,
    })
  })

  it('wraps a choice into RESOLVE', () => {
    const choice = { kind: 'defend', card: null } as const
    expect(toAction({ kind: 'resolve', choice }, 'you', 3)).toEqual({
      type: 'RESOLVE',
      player: 'you',
      choice,
      at: 3,
    })
  })

  it('keeps requestCard.card a catalogue id, not a uid — the defect this design guards against', () => {
    // Choice.requestCard.card is a CardId (a bluff naming a card TYPE), never
    // a CardUid. toAction does not know the difference — it only proves the
    // value survives the crossing untouched, whatever the caller supplies.
    const choice = { kind: 'requestCard', card: 'attack-security-bug' } as const
    const a = toAction({ kind: 'resolve', choice }, 'you', 11)
    expect(a).toMatchObject({ choice: { card: 'attack-security-bug' } })
  })
})
