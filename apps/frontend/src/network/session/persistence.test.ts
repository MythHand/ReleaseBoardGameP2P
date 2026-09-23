import type { Engine } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrivateSeat } from '~/entities/game/seats'
import type { StoredKeeper } from '~/shared/lib/persistence'
import { createLobbyState } from '../lobby/state'
import {
  createKeeperWriter,
  matchSeqAfterRestore,
  normalizeKeeperSnapshot,
  normalizeLobbyConfig,
} from './persistence'
import { createSession, type Session } from './referee'

const HOST_TOKEN = 'host-token'
const GUEST_TOKEN = 'guest-token'

function sessionWithGuest(gameId = 'host-1'): Session {
  return createSession({
    gameId,
    keeperId: 'p1',
    engine: createFakeEngine(),
    seed: 1,
    players: [
      { playerId: 'p1', peerId: 'host', name: 'Host' },
      { playerId: 'p2', peerId: 'guest', name: 'Guest' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  }).session
}

function snapshotWithGuest(): StoredKeeper {
  const session = sessionWithGuest()
  return {
    gameId: session.gameId,
    keeperId: session.keeperId,
    state: session.state,
    seats: session.seats,
    privateSeats: [
      {
        seat: { playerId: 'p1', peerId: 'host', name: 'Host' },
        resumeToken: HOST_TOKEN,
      },
      {
        seat: { playerId: 'p2', peerId: 'guest', name: 'Guest' },
        resumeToken: GUEST_TOKEN,
      },
    ],
    log: session.log,
    savedAt: 123,
  }
}

function cloneSnapshot(): StoredKeeper {
  return structuredClone(snapshotWithGuest())
}

describe('normalizeLobbyConfig', () => {
  it('normalizes a valid legacy config without bots', () => {
    expect(normalizeLobbyConfig({ maxPlayers: 4, setup: { releases: 'fast' } })).toEqual({
      maxPlayers: 4,
      setup: { releases: 'fast' },
      bots: 0,
    })
  })

  it.each([
    null,
    { maxPlayers: 1, setup: {} },
    { maxPlayers: 7, setup: {} },
    { maxPlayers: 4.5, setup: {} },
    { maxPlayers: 4, setup: [] },
    { maxPlayers: 4, setup: { releases: 1 } },
    { maxPlayers: 4, setup: {}, bots: -1 },
  ])('rejects invalid config %#', (value) => {
    expect(normalizeLobbyConfig(value)).toBeNull()
  })
})

describe('normalizeKeeperSnapshot', () => {
  const normalize = (snapshot: StoredKeeper, engine: Engine = createFakeEngine()) =>
    normalizeKeeperSnapshot(snapshot, 'host-1', 'host', engine)

  it.each([
    [
      'non-finite savedAt',
      (snapshot: StoredKeeper) => {
        snapshot.savedAt = Number.NaN
      },
    ],
    [
      'wrong game id',
      (snapshot: StoredKeeper) => {
        snapshot.gameId = 'host-2'
      },
    ],
    [
      'malformed log',
      (snapshot: StoredKeeper) => {
        snapshot.log = [{}]
      },
    ],
    [
      'missing private seats',
      (snapshot: StoredKeeper) => {
        snapshot.privateSeats = []
      },
    ],
    [
      'duplicate private peer ids',
      (snapshot: StoredKeeper) => {
        const seats = snapshot.privateSeats as PrivateSeat[]
        seats[1].seat.peerId = seats[0].seat.peerId
      },
    ],
    [
      'duplicate private tokens',
      (snapshot: StoredKeeper) => {
        const seats = snapshot.privateSeats as PrivateSeat[]
        seats[1].resumeToken = seats[0].resumeToken
      },
    ],
    [
      'human without token',
      (snapshot: StoredKeeper) => {
        const seats = snapshot.privateSeats as PrivateSeat[]
        seats[1].resumeToken = null
      },
    ],
    [
      'bot with token',
      (snapshot: StoredKeeper) => {
        const seats = snapshot.privateSeats as PrivateSeat[]
        seats[1].seat.bot = true
      },
    ],
    [
      'referee and private order mismatch',
      (snapshot: StoredKeeper) => {
        const seats = snapshot.seats as unknown[]
        snapshot.seats = [seats[1], seats[0]]
      },
    ],
    [
      'wrong keeper',
      (snapshot: StoredKeeper) => {
        snapshot.keeperId = 'p2'
      },
    ],
    [
      'invalid state seating',
      (snapshot: StoredKeeper) => {
        snapshot.state = { ...(snapshot.state as object), seating: ['p2', 'p1'] }
      },
    ],
    [
      'invalid state players',
      (snapshot: StoredKeeper) => {
        const state = snapshot.state as { players: Record<string, unknown> }
        snapshot.state = { ...state, players: { p1: state.players.p1 } }
      },
    ],
  ] as const)('rejects %s', (_name, mutate) => {
    const snapshot = cloneSnapshot()
    mutate(snapshot)
    expect(normalize(snapshot)).toBeNull()
  })

  it('rejects a snapshot the engine cannot project', () => {
    const engine = createFakeEngine()
    engine.project = vi.fn(() => {
      throw new Error('invalid state')
    })

    expect(normalize(cloneSnapshot(), engine)).toBeNull()
  })

  it('accepts a valid snapshot with an absent guest', () => {
    const snapshot = cloneSnapshot()
    const seats = snapshot.seats as Array<{
      playerId: string
      peerId: string | null
      absentSince: number | null
    }>
    seats[1] = { ...seats[1], peerId: null, absentSince: 500 }

    expect(normalize(snapshot)?.seats[1]).toEqual({
      playerId: 'p2',
      peerId: null,
      absentSince: 500,
    })
  })

  it('accepts a valid bot seat without a resume token', () => {
    const engine = createFakeEngine()
    const session = createSession({
      gameId: 'host-1',
      keeperId: 'p1',
      engine,
      seed: 1,
      players: [
        { playerId: 'p1', peerId: 'host', name: 'Host' },
        { playerId: 'p2', peerId: null, name: 'Bot', bot: true },
      ],
      setup: {},
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    }).session
    const snapshot: StoredKeeper = {
      gameId: session.gameId,
      keeperId: session.keeperId,
      state: session.state,
      seats: session.seats,
      privateSeats: [
        {
          seat: { playerId: 'p1', peerId: 'host', name: 'Host' },
          resumeToken: HOST_TOKEN,
        },
        {
          seat: { playerId: 'p2', peerId: 'bot:1', name: 'Bot', bot: true },
          resumeToken: null,
        },
      ],
      log: session.log,
      savedAt: 123,
    }

    expect(normalize(snapshot, engine)?.privateSeats[1]).toEqual({
      seat: { playerId: 'p2', peerId: 'bot:1', name: 'Bot', bot: true },
      resumeToken: null,
    })
  })
})

describe('matchSeqAfterRestore', () => {
  it('uses the parsed positive match suffix', () => {
    expect(matchSeqAfterRestore('host-7', 99)).toBe(7)
  })

  it.each([
    'host',
    'host-nope',
    'host-0',
    'host-1.5',
  ])('uses a deterministic fallback for %s', (id) => {
    expect(matchSeqAfterRestore(id, 99)).toBe(99)
  })
})

describe('createKeeperWriter', () => {
  afterEach(() => vi.useRealTimers())

  const privateSeats: PrivateSeat[] = [
    {
      seat: { playerId: 'p1', peerId: 'host', name: 'Host' },
      resumeToken: HOST_TOKEN,
    },
  ]
  const lobby = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    bots: 1,
    setup: { releases: 'fast' },
    peers: [],
  })

  function setupWriter() {
    vi.useFakeTimers()
    const write = vi.fn()
    return { write, writer: createKeeperWriter({ delayMs: 50, now: () => 123, write }) }
  }

  it('coalesces commits and writes the latest session and metadata', () => {
    const { write, writer } = setupWriter()
    const first = sessionWithGuest('host-1')
    const latest = { ...first, gameId: 'host-2' }

    writer.queue(first, privateSeats, null)
    writer.queue(latest, privateSeats, lobby)
    vi.advanceTimersByTime(50)

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'host-2',
        privateSeats,
        savedAt: 123,
        lobbyConfig: { maxPlayers: 4, setup: { releases: 'fast' }, bots: 1 },
      }),
    )
  })

  it('does not rewrite an identical immutable session', () => {
    const { write, writer } = setupWriter()
    const session = sessionWithGuest()

    writer.queue(session, privateSeats, lobby)
    vi.advanceTimersByTime(50)
    writer.queue(session, privateSeats, lobby)
    vi.advanceTimersByTime(50)

    expect(write).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending write', () => {
    const { write, writer } = setupWriter()
    writer.queue(sessionWithGuest(), privateSeats, lobby)

    writer.cancel()
    vi.advanceTimersByTime(50)

    expect(write).not.toHaveBeenCalled()
  })

  it('allows the same session to be queued after cancel resets identity', () => {
    const { write, writer } = setupWriter()
    const session = sessionWithGuest()
    writer.queue(session, privateSeats, lobby)
    writer.cancel()

    writer.queue(session, privateSeats, lobby)
    vi.advanceTimersByTime(50)

    expect(write).toHaveBeenCalledTimes(1)
  })
})
