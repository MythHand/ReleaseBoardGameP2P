import type { PlayerView } from '@release/engine'
import { describe, expect, it } from 'vitest'
import { toBoardOver } from './toBoardOver'

const base = { over: null } as unknown as PlayerView

describe('toBoardOver', () => {
  it('is null while the game is running', () => {
    expect(toBoardOver(base)).toBeNull()
  })

  it('renames the engine winner to the kit winnerId and carries the condition', () => {
    const view = { ...base, over: { winner: 'p2', condition: 'release' as const } }
    expect(toBoardOver(view)).toEqual({ winnerId: 'p2', condition: 'release' })
  })

  it('carries lastStanding as its own condition', () => {
    const view = { ...base, over: { winner: 'p1', condition: 'lastStanding' as const } }
    expect(toBoardOver(view)).toEqual({ winnerId: 'p1', condition: 'lastStanding' })
  })
})
