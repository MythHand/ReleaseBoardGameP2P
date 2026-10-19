import { readSession as legacyRead } from './persistence'
import { clearSession, RESTORE_TTL_MS, readSession, writeSession } from './sessionPersistence'

afterEach(() => clearSession())

it('expires a saved session only after its restore deadline', () => {
  writeSession({ roomCode: 'ABC-123', name: 'Ann', role: 'guest', gameId: null, joinedAt: 0 })
  expect(readSession(RESTORE_TTL_MS)?.roomCode).toBe('ABC-123')
  expect(readSession(RESTORE_TTL_MS + 1)).toBeNull()
})

it('shares records and cleanup with the existing persistence surface', () => {
  writeSession({ roomCode: 'ABC-123', name: 'Ann', role: 'host', gameId: null, joinedAt: 1000 })
  expect(legacyRead(1000)?.role).toBe('host')
  clearSession()
  expect(legacyRead(1000)).toBeNull()
})
