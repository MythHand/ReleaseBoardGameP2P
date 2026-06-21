import { describe, expect, it } from 'vitest'
import { createSession, getSession, joinSession } from './sessions'

describe('sessions', () => {
  it('creates a session with a unique id and a join code', () => {
    const a = createSession()
    const b = createSession()
    expect(a.id).not.toEqual(b.id)
    expect(a.code).toHaveLength(8)
    expect(getSession(a.id)?.id).toEqual(a.id)
  })

  it('joins an existing session by code and registers a peer', () => {
    const s = createSession()
    const result = joinSession(s.code)
    expect(result).not.toBeNull()
    expect(result?.session.id).toEqual(s.id)
    expect(getSession(s.id)?.peers).toContain(result?.peerId)
  })

  it('returns null when joining an unknown code', () => {
    expect(joinSession('NOPE0000')).toBeNull()
  })
})
