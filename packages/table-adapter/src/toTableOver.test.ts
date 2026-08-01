import type { PlayerView } from '@release/engine'
import { describe, expect, it } from 'vitest'
import { toTableOver } from './toTableOver'

const base = { over: null } as unknown as PlayerView

describe('toTableOver', () => {
  it('is null while the game is running', () => {
    expect(toTableOver(base)).toBeNull()
  })

  it('renames the engine winner to the kit winnerId and carries the condition', () => {
    const view = { ...base, over: { winner: 'p2', condition: 'release' as const } }
    expect(toTableOver(view)).toEqual({ winnerId: 'p2', condition: 'release' })
  })

  it('carries lastStanding as its own condition', () => {
    const view = { ...base, over: { winner: 'p1', condition: 'lastStanding' as const } }
    expect(toTableOver(view)).toEqual({ winnerId: 'p1', condition: 'lastStanding' })
  })
})
