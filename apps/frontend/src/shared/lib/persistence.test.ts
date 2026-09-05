import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearSession,
  getClientId,
  RESTORE_TTL_MS,
  readKeeper,
  readSession,
  writeKeeper,
  writeSession,
} from './persistence'

beforeEach(() => {
  sessionStorage.clear()
})

const session = (over: Partial<Parameters<typeof writeSession>[0]> = {}) => ({
  roomCode: 'ABC-123',
  name: 'Ann',
  role: 'guest' as const,
  gameId: 'g1',
  joinedAt: 1_000,
  ...over,
})

it('mints a client id once and returns the same one thereafter', () => {
  const first = getClientId()
  expect(first).toMatch(/[0-9a-f-]{8,}/)
  expect(getClientId()).toBe(first)
})

// The reported bug in one assertion. These records describe ONE peer — who this
// browser is at the table. localStorage is per-origin, so a host tab and a guest
// tab would share one copy and the last writer would win: the host then reloads,
// reads "you are a guest", declines its own restore, and dials its own dead room
// code forever. sessionStorage is per-tab, so two tabs are two peers.
it('keeps its records out of localStorage, so a second tab is a second peer', () => {
  writeSession(session())
  getClientId()
  writeKeeper({ gameId: 'g1', keeperId: 'p1', state: {}, seats: [], lobbySeats: [], savedAt: 0 })

  // The record is in the tab's own store...
  expect(sessionStorage.getItem('release:session')).not.toBeNull()

  // ...and nothing of ours is in the origin-wide one. Asserted over every key
  // rather than one at a time, so a record added later cannot quietly opt out
  // of the isolation this whole module depends on.
  const originWide = Object.keys(localStorage).filter((k) => k.startsWith('release:'))
  expect(originWide).toEqual([])
})

it('round-trips a session record', () => {
  writeSession(session())
  expect(readSession(1_000)).toEqual(session())
})

it('discards a session past the TTL', () => {
  writeSession(session({ joinedAt: 0 }))
  expect(readSession(RESTORE_TTL_MS - 1)).not.toBeNull()
  expect(readSession(RESTORE_TTL_MS + 1)).toBeNull()
})

it('discards a keeper snapshot past the TTL', () => {
  writeKeeper({
    gameId: 'g1',
    keeperId: 'p1',
    state: { a: 1 },
    seats: [],
    lobbySeats: [],
    savedAt: 0,
  })
  expect(readKeeper(RESTORE_TTL_MS - 1)).not.toBeNull()
  expect(readKeeper(RESTORE_TTL_MS + 1)).toBeNull()
})

it('returns null rather than throwing on corrupt JSON', () => {
  sessionStorage.setItem('release:session', '{not json')
  expect(readSession(1_000)).toBeNull()
})

it('clearing removes the record', () => {
  writeSession(session())
  clearSession()
  expect(readSession(1_000)).toBeNull()
})

describe('when sessionStorage throws (Safari private mode)', () => {
  it('falls back to memory instead of crashing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => writeSession(session())).not.toThrow()
    expect(readSession(1_000)).toEqual(session())
    vi.restoreAllMocks()
  })
})
