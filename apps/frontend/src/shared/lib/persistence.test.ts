import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLog,
  clearSession,
  getResumeToken,
  RESTORE_TTL_MS,
  readKeeper,
  readLog,
  readSession,
  type StoredLobbyConfig,
  writeKeeper,
  writeLog,
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

it('keeps a private resume token only while reconnecting to the same room', () => {
  const first = getResumeToken('ABC-123')
  expect(first).toBeTruthy()
  expect(getResumeToken('ABC-123')).toBe(first)
  expect(getResumeToken('XYZ-789')).not.toBe(first)
})

it('rotates the room credential when its session is cleared', () => {
  const first = getResumeToken('ABC-123')
  clearSession()
  expect(getResumeToken('ABC-123')).not.toBe(first)
})

// The reported bug in one assertion. These records describe ONE peer — who this
// browser is at the table. localStorage is per-origin, so a host tab and a guest
// tab would share one copy and the last writer would win: the host then reloads,
// reads "you are a guest", declines its own restore, and dials its own dead room
// code forever. sessionStorage is per-tab, so two tabs are two peers.
it('keeps its records out of localStorage, so a second tab is a second peer', () => {
  writeSession(session())
  getResumeToken('ABC-123')
  writeKeeper({
    gameId: 'g1',
    keeperId: 'p1',
    state: {},
    seats: [],
    privateSeats: [],
    log: [],
    savedAt: 0,
  })

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
  const expiredCredential = getResumeToken('ABC-123')
  expect(readSession(RESTORE_TTL_MS - 1)).not.toBeNull()
  expect(readSession(RESTORE_TTL_MS + 1)).toBeNull()
  expect(getResumeToken('ABC-123')).not.toBe(expiredCredential)
})

it('discards a keeper snapshot past the TTL', () => {
  writeKeeper({
    gameId: 'g1',
    keeperId: 'p1',
    state: { a: 1 },
    seats: [],
    privateSeats: [],
    log: [],
    savedAt: 0,
  })
  expect(readKeeper(RESTORE_TTL_MS - 1)).not.toBeNull()
  expect(readKeeper(RESTORE_TTL_MS + 1)).toBeNull()
})

// A host reload restores the position AND how the match got there — the log is
// what lets a rejoining board render its move history rather than starting
// blank at whatever state the keeper happened to be in.
it('restores the match log along with the state', () => {
  writeKeeper({
    gameId: 'g1',
    keeperId: 'p1',
    state: {},
    seats: [],
    privateSeats: [],
    log: [{ id: 1 }, { id: 2 }],
    savedAt: 1_000,
  })
  expect(readKeeper(1_000)?.log).toEqual([{ id: 1 }, { id: 2 }])
})

it('round-trips a keeper snapshot lobby configuration', () => {
  const lobbyConfig = {
    maxPlayers: 3,
    setup: { ai: 'no', releases: 'fast' },
  } satisfies StoredLobbyConfig
  writeKeeper({
    gameId: 'g1',
    keeperId: 'p1',
    state: {},
    seats: [],
    privateSeats: [],
    log: [],
    savedAt: 1_000,
    lobbyConfig,
  })

  expect(readKeeper(1_000)?.lobbyConfig).toEqual(lobbyConfig)
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

describe('the move log record', () => {
  const event = (id: number) => ({ id, type: 'dealt', player: 'p1', count: 5 })

  it('round-trips the events it was given', () => {
    writeLog({ gameId: 'g1', events: [event(1), event(2)], savedAt: 1_000 })
    expect(readLog('g1', 1_000)).toEqual([event(1), event(2)])
  })

  // The persisted form of the guard useGame already runs in memory: seat ids
  // repeat between games, so another match's feed is not this match's history.
  it('refuses a log belonging to another game', () => {
    writeLog({ gameId: 'g1', events: [event(1)], savedAt: 1_000 })
    expect(readLog('g2', 1_000)).toBeNull()
  })

  it('drops a log older than the restore window', () => {
    writeLog({ gameId: 'g1', events: [event(1)], savedAt: 0 })
    expect(readLog('g1', RESTORE_TTL_MS + 1)).toBeNull()
  })

  it.each([
    ['a non-array feed', {}],
    ['an invalid array element', [null]],
    ['an event missing required fields', [{ id: 1, type: 'dealt' }]],
    ['an unknown event', [{ id: 1, type: 'futureEvent' }]],
    ['a non-finite event id', [{ ...event(1), id: Number.POSITIVE_INFINITY }]],
    ['duplicate event ids', [event(1), { ...event(2), id: 1 }]],
    ['out-of-order event ids', [event(2), event(1)]],
    ['malformed audience metadata', [{ ...event(1), visibleTo: 'p1' }]],
    [
      'a private event with a missing audience',
      [{ id: 1, type: 'takenFromDiscard', player: 'p1', card: 'sudo', to: 'deck' }],
    ],
    [
      'a private event with the wrong audience',
      [
        {
          id: 1,
          type: 'handTransfer',
          from: 'p1',
          to: 'p2',
          card: 'bug',
          visibleTo: ['p1', 'p3'],
        },
      ],
    ],
    ['an event with an unexpected field', [{ ...event(1), secret: 'card-id' }]],
  ] as const)('rejects and clears %s', (_case, events) => {
    sessionStorage.setItem('release:log', JSON.stringify({ gameId: 'g1', events, savedAt: 1_000 }))
    expect(readLog('g1', 1_000)).toBeNull()
    expect(sessionStorage.getItem('release:log')).toBeNull()
  })

  it('drops a record it cannot parse rather than failing the same way forever', () => {
    sessionStorage.setItem('release:log', '{not json')
    expect(readLog('g1', 1_000)).toBeNull()
    expect(sessionStorage.getItem('release:log')).toBeNull()
  })

  it('clears', () => {
    writeLog({ gameId: 'g1', events: [event(1)], savedAt: 1_000 })
    clearLog()
    expect(readLog('g1', 1_000)).toBeNull()
  })
})
