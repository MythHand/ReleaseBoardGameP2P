import { createFakeEngine, FAKE_DECK, FAKE_EVENTS, WINDOW_FIRST_MS } from '@release/engine/fake'
import { act, renderHook as renderTestingHook } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import type { PrivateSeat } from '~/entities/game/seats'
import type { ChatSystemEvent, UserChatEntry } from '~/shared/chat/types'
import {
  clearChat,
  clearKeeper,
  clearSession,
  readChat,
  type StoredKeeper,
  type StoredLobbyConfig,
  type StoredSession,
  writeChat,
} from '~/shared/lib/persistence'
import { backoffMs, MAX_RECONNECT_ATTEMPTS } from '../session/reconnect'
import { createSession, type Seat as RefereeSeat } from '../session/referee'
import { INTRO_CAP_MS } from '../session/startGate'
import { createTransport } from '../transport/peer'
import type { Message, Setup, WireMessage } from '../types'
import {
  formatRoomCode,
  KEEPER_SAVE_MS,
  makeRoomCode,
  parseRoomCode,
  type UseLobby,
  useLobby,
} from '../useLobby'

export type {
  ChatSystemEvent,
  Message,
  PrivateSeat,
  RefereeSeat,
  Setup,
  StoredKeeper,
  StoredLobbyConfig,
  StoredSession,
  UseLobby,
  UserChatEntry,
  WireMessage,
}
export {
  act,
  afterEach,
  backoffMs,
  beforeEach,
  clearChat,
  clearKeeper,
  clearSession,
  createFakeEngine,
  createSession,
  createTransport,
  FAKE_DECK,
  FAKE_EVENTS,
  formatRoomCode,
  INTRO_CAP_MS,
  KEEPER_SAVE_MS,
  MAX_RECONNECT_ATTEMPTS,
  makeRoomCode,
  parseRoomCode,
  readChat,
  renderTestingHook,
  useLobby,
  vi,
  WINDOW_FIRST_MS,
  writeChat,
}

export // Every fake transport createTransport hands out, with the callbacks useLobby
// passed in — so a test can fire an error or a disconnect by hand.
interface FakeTransport {
  id: string
  close: ReturnType<typeof vi.fn>
  connectTo: ReturnType<typeof vi.fn>
  broadcast: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  relay: ReturnType<typeof vi.fn>
  connectedIds: () => string[]
  authenticate: ReturnType<typeof vi.fn>
  receive: (message: WireMessage) => void
  replaceConnection: (peerId: string) => void
  onError?: (err: { type?: string; message: string }) => void
  onConnection?: (peerId: string) => void
  onDisconnect?: (peerId: string) => void
  onMessage?: (msg: WireMessage) => void
}

const { transports: hoistedTransports } = vi.hoisted(() => ({ transports: [] as FakeTransport[] }))

export const transports = hoistedTransports

export const renderedLobbies: ReturnType<typeof renderTestingHook<UseLobby, unknown>>[] = []

export function renderHook(callback: () => UseLobby) {
  const rendered = renderTestingHook(callback)
  renderedLobbies.push(rendered)
  return rendered
}

vi.mock('../transport/peer', () => ({
  createTransport: vi.fn(
    (args: {
      onError?: (err: { type?: string; message: string }) => void
      onConnection?: (peerId: string) => void
      onDisconnect?: (peerId: string) => void
      onMessage?: (msg: WireMessage) => void
    }) => {
      const authenticated = new Set<string>()
      const fake = {
        id: `peer${hoistedTransports.length}`,
        close: vi.fn(),
        connectTo: vi.fn(),
        send: vi.fn(),
        broadcast: vi.fn(),
        relay: vi.fn(),
        connectedIds: () => [],
        authenticate: vi.fn((peerId: string) => authenticated.add(peerId)),
        receive: (message: WireMessage) => {
          if (message.type === 'JOIN_REQUEST' || authenticated.has(message.from)) {
            args.onMessage?.(message)
          }
        },
        replaceConnection: (peerId: string) => {
          authenticated.delete(peerId)
          args.onDisconnect?.(peerId)
          args.onConnection?.(peerId)
        },
        onError: args.onError,
        onConnection: args.onConnection,
        onDisconnect: args.onDisconnect,
        onMessage: args.onMessage,
      }
      hoistedTransports.push(fake)
      return fake
    },
  ),
}))

export function resetLobbyHarness() {
  transports.length = 0
  // createTransport is one shared vi.fn() for the whole file, so its call
  // history accumulates across every test unless cleared here — without this,
  // a solo test asserting `.not.toHaveBeenCalled()` would see every networked
  // test that ran before it and fail no matter what it does itself.
  vi.mocked(createTransport).mockClear()
  // The hook writes `release:session` / `release:keeper` now, so a record left
  // by the previous test would be read as this one's — and now that the mount
  // effect restores from one automatically (host restore, below), a leftover
  // record does not just sit unread, it drives a real reconnect during a later
  // test's mount. `sessionStorage.clear()` alone is not enough: persistence.ts
  // falls back to an in-memory cache when storage throws (Safari private
  // mode), and that cache is a module-level singleton that outlives any one
  // test — clearSession/clearKeeper are what actually empty it, on top of the
  // browser storage.
  sessionStorage.clear()
  clearSession()
  clearKeeper()
  clearChat()
}
beforeEach(resetLobbyHarness)

export function userChatEntry(
  input: Pick<UserChatEntry, 'id' | 'sequence' | 'text'>,
): UserChatEntry {
  return {
    kind: 'message',
    createdAt: input.sequence * 1_000,
    author: { memberId: 'member-b', name: 'Bo', role: 'player' },
    ...input,
  }
}

export function systemEvents(lobby: UseLobby): ChatSystemEvent[] {
  return lobby.chat.entries.flatMap((entry) => (entry.kind === 'system' ? [entry.event] : []))
}

export function cleanupLobbyHarness() {
  act(() => {
    for (const rendered of renderedLobbies) rendered.result.current.leaveSession()
  })
  renderedLobbies.length = 0
}
afterEach(cleanupLobbyHarness)

export async function liveGuestReturningToStart() {
  const rendered = renderHook(() => useLobby())
  await act(async () => {
    await rendered.result.current.joinRoom('ABC-123', 'Bo')
  })
  const hostId = parseRoomCode('ABC-123')
  act(() => {
    transports[0].onConnection?.(hostId)
    transports[0].onMessage?.({
      type: 'GAME_STARTING',
      payload: { gameId: 'abc123-1', seats: SEATING },
      from: hostId,
      seq: 1,
    } as WireMessage)
    transports[0].onMessage?.({
      type: 'SYNC',
      payload: { view: { over: null }, events: [] },
      from: hostId,
      seq: 2,
    } as unknown as WireMessage)
  })
  sessionStorage.setItem('release:keeper', JSON.stringify({ stale: true }))
  sessionStorage.setItem('release:log', JSON.stringify({ stale: true }))
  return rendered
}

export // --- reporting the opening deal is done ---

// Every frame the hook addressed to a single peer, in order.
function sentTo(peerId: string): Message[] {
  return transports[0].send.mock.calls
    .filter((call) => call[0] === peerId)
    .map((call) => call[1] as Message)
}

export // Everything that left this peer at all — targeted or broadcast.
function sentAll(): Message[] {
  const t = transports[0]
  if (!t) return []
  return [
    ...t.send.mock.calls.map((call) => call[1] as Message),
    ...t.broadcast.mock.calls.map((call) => call[0] as Message),
  ]
}

export function publicFrames(transport: FakeTransport): unknown[] {
  return [
    ...transport.send.mock.calls.map((call) => call[1]),
    ...transport.broadcast.mock.calls.map((call) => call[0]),
    ...transport.relay.mock.calls.map((call) => call[1]),
  ]
}

export // A hosted lobby with one other seated player. The guest's peer id sorts after
// the host's ('peer0'), so the host takes seat p1 and holds the opening turn —
// otherwise the intent below would be rejected for being out of turn and prove
// nothing about the gate.
const GUEST = 'zguest'

export // The browser behind that guest, as its JOIN_REQUEST announces it. Stable
// across a reload, which is the whole point: it is what says a join is a
// return.
const HOST_RESUME_TOKEN = 'resume-host'

export const GUEST_RESUME_TOKEN = 'resume-guest'

export // A seating as a guest receives it: peers this guest's own roster has never
// heard of, so nothing derived locally could produce it.
const SEATING = [
  { playerId: 'p1', peerId: 'aaa', name: 'Ann' },
  { playerId: 'p2', peerId: 'bbb', name: 'Bo' },
]

export async function hostWithGuest(): Promise<ReturnType<typeof renderHook>> {
  const rendered = renderHook(() => useLobby())
  await act(async () => {
    await rendered.result.current.createRoom('Dimbo', 6)
  })
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: GUEST,
    } as WireMessage)
  })
  return rendered
}

export // --- what survives a reload ---

const SESSION_KEY = 'release:session'

export const KEEPER_KEY = 'release:keeper'

export function storedSession(): StoredSession | null {
  return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null')
}

export function storedKeeper(): StoredKeeper | null {
  return JSON.parse(sessionStorage.getItem(KEEPER_KEY) ?? 'null')
}

export // How many times the keeper snapshot was actually serialized. The point of the
// throttle is that this is far smaller than the number of commits behind it.
function keeperWrites(spy: ReturnType<typeof vi.spyOn<Storage, 'setItem'>>): number {
  return spy.mock.calls.filter((call) => call[0] === KEEPER_KEY).length
}

export // --- coming back ---

// A host mid-match whose guest has dropped its channel. The returning peer
// arrives as a fresh join carrying the same resume token, which is the only thing
// that says otherwise.
async function hostWhoseGuestDropped(): Promise<ReturnType<typeof renderHook>> {
  const rendered = await hostWithGuest()
  act(() => {
    rendered.result.current.startGame([])
  })
  act(() => {
    transports[0].onDisconnect?.(GUEST)
  })
  return rendered
}

export const RETURNED = 'zguest-again'

export function rejoin(): void {
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: RETURNED,
    } as WireMessage)
  })
}

export async function hostWithOpenGame(): Promise<ReturnType<typeof renderHook>> {
  const rendered = await hostWithGuest()
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((values) => {
    if (values instanceof Uint32Array) values[0] = 1
    return values
  })
  act(() => {
    rendered.result.current.startGame([])
  })
  random.mockRestore()
  act(() => {
    rendered.result.current.introReady()
    transports[0].onMessage?.({
      type: 'INTRO_READY',
      payload: { gameId: rendered.result.current.gameId },
      from: GUEST,
    } as WireMessage)
  })
  return rendered
}

export function forgeFromStalePeerId(): void {
  act(() => {
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Mallory', resumeToken: 'not-the-seat-token' },
      from: GUEST,
    } as WireMessage)
  })
}

export // --- host restore ---

function storedHostSession(gameId: string | null, lobbyConfig?: StoredLobbyConfig): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      roomCode: formatRoomCode('peer0'),
      name: 'Dimbo',
      role: 'host',
      gameId,
      joinedAt: Date.now(),
      ...(lobbyConfig && { lobbyConfig }),
    } satisfies StoredSession),
  )
}

export // A snapshot built through the real referee, the same way `startGame` builds
// one — so the state a restore adopts is one the engine could actually have
// produced, not a hand-rolled shape that only happens to typecheck.
// `hostPeerId` is p1's peerId in the stored referee seats; the restore only
// keeps a seat whose peerId matches the freshly reclaimed transport id, so a
// test proving that has to control what that id will be.
function storedKeeperSnapshot(
  hostPeerId: string,
  gameId = 'g1',
  options: { setup?: Setup; lobbyConfig?: StoredLobbyConfig } = {},
): StoredKeeper {
  const engine = createFakeEngine()
  const { session } = createSession({
    gameId,
    keeperId: 'p1',
    engine,
    seed: 1,
    players: [
      { playerId: 'p1', peerId: hostPeerId, name: 'Dimbo' },
      { playerId: 'p2', peerId: 'old-guest', name: 'Bo' },
    ],
    setup: options.setup ?? {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const snapshot: StoredKeeper = {
    gameId,
    keeperId: 'p1',
    state: session.state,
    seats: session.seats,
    privateSeats: [
      {
        seat: { playerId: 'p1', peerId: hostPeerId, name: 'Dimbo' },
        resumeToken: HOST_RESUME_TOKEN,
      },
      {
        seat: { playerId: 'p2', peerId: 'old-guest', name: 'Bo' },
        resumeToken: GUEST_RESUME_TOKEN,
      },
    ],
    log: session.log,
    savedAt: Date.now(),
    ...(options.lobbyConfig && { lobbyConfig: options.lobbyConfig }),
  }
  sessionStorage.setItem(KEEPER_KEY, JSON.stringify(snapshot))
  return snapshot
}

export interface MutableRefereeSeat {
  playerId: string
  peerId: string | null
  absentSince: number | null
}

export const invalidKeeperSnapshots: [string, (snapshot: StoredKeeper) => void][] = [
  ['malformed referee seats', (snapshot) => (snapshot.seats = { playerId: 'p1' })],
  ['empty referee seats', (snapshot) => (snapshot.seats = [])],
  [
    'duplicate private player ids',
    (snapshot) => {
      const privateSeats = snapshot.privateSeats as PrivateSeat[]
      snapshot.privateSeats = [
        privateSeats[0],
        {
          ...privateSeats[1],
          seat: { ...privateSeats[1].seat, playerId: privateSeats[0].seat.playerId },
        },
      ]
    },
  ],
  [
    'duplicate referee player ids',
    (snapshot) => {
      const seats = snapshot.seats as MutableRefereeSeat[]
      snapshot.seats = [seats[0], { ...seats[1], playerId: seats[0].playerId }]
    },
  ],
  [
    'duplicate active referee peer ids',
    (snapshot) => {
      const seats = snapshot.seats as MutableRefereeSeat[]
      snapshot.seats = [seats[0], { ...seats[1], peerId: seats[0].peerId }]
    },
  ],
  [
    'duplicate historical peer ids',
    (snapshot) => {
      const privateSeats = snapshot.privateSeats as PrivateSeat[]
      snapshot.privateSeats = [
        privateSeats[0],
        {
          ...privateSeats[1],
          seat: { ...privateSeats[1].seat, peerId: privateSeats[0].seat.peerId },
        },
      ]
    },
  ],
  [
    'duplicate resume tokens',
    (snapshot) => {
      const privateSeats = snapshot.privateSeats as PrivateSeat[]
      snapshot.privateSeats = [
        privateSeats[0],
        { ...privateSeats[1], resumeToken: privateSeats[0].resumeToken },
      ]
    },
  ],
  [
    'cross-ledger player swaps',
    (snapshot) => {
      const seats = snapshot.seats as MutableRefereeSeat[]
      snapshot.seats = [
        { ...seats[0], playerId: seats[1].playerId },
        { ...seats[1], playerId: seats[0].playerId },
      ]
    },
  ],
  [
    'missing host and keeper seat',
    (snapshot) => {
      snapshot.privateSeats = (snapshot.privateSeats as PrivateSeat[]).slice(1)
      snapshot.seats = (snapshot.seats as MutableRefereeSeat[]).slice(1)
    },
  ],
  ['keeper assigned to the non-host seat', (snapshot) => (snapshot.keeperId = 'p2')],
  ['non-array log', (snapshot) => (snapshot.log = {} as unknown as unknown[])],
  ['invalid log element', (snapshot) => (snapshot.log = [null])],
  ['unknown log event', (snapshot) => (snapshot.log = [{ id: 1, type: 'futureEvent' }])],
  ['log event missing required fields', (snapshot) => (snapshot.log = [{ id: 1, type: 'dealt' }])],
  [
    'non-finite log event id',
    (snapshot) => {
      const first = (snapshot.log as Record<string, unknown>[])[0]
      snapshot.log = [{ ...first, id: Number.POSITIVE_INFINITY }]
    },
  ],
  [
    'duplicate log event ids',
    (snapshot) => {
      const events = snapshot.log as Record<string, unknown>[]
      snapshot.log = [events[0], { ...events[1], id: events[0].id }]
    },
  ],
  [
    'out-of-order log event ids',
    (snapshot) => {
      const events = snapshot.log as Record<string, unknown>[]
      snapshot.log = [events[1], events[0]]
    },
  ],
  [
    'malformed log audience',
    (snapshot) => {
      const first = (snapshot.log as Record<string, unknown>[])[0]
      snapshot.log = [{ ...first, visibleTo: 'p1' }]
    },
  ],
  [
    'missing private log audience',
    (snapshot) => {
      snapshot.log = [{ id: 1, type: 'takenFromDiscard', player: 'p1', card: 'sudo', to: 'deck' }]
    },
  ],
  [
    'wrong private log audience',
    (snapshot) => {
      snapshot.log = [
        {
          id: 1,
          type: 'handTransfer',
          from: 'p1',
          to: 'p2',
          card: 'bug',
          visibleTo: ['p1', 'p3'],
        },
      ]
    },
  ],
  [
    'unexpected log payload fields',
    (snapshot) => {
      const first = (snapshot.log as Record<string, unknown>[])[0]
      snapshot.log = [{ ...first, secret: 'card-id' }]
    },
  ],
  [
    'non-numeric lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: '3' as unknown as number, setup: {} }
    },
  ],
  [
    'negative lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: -1, setup: {} }
    },
  ],
  [
    'zero lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 0, setup: {} }
    },
  ],
  [
    'fractional lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 2.5, setup: {} }
    },
  ],
  [
    'above-maximum lobby config capacity',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 7, setup: {} }
    },
  ],
  [
    'non-object lobby config setup',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 3, setup: [] }
    },
  ],
  [
    'non-numeric lobby bot count',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 3, setup: {}, bots: '2' as unknown as number }
    },
  ],
  [
    'negative lobby bot count',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 3, setup: {}, bots: -1 }
    },
  ],
  [
    'fractional lobby bot count',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 3, setup: {}, bots: 1.5 }
    },
  ],
  [
    'above-maximum lobby bot count',
    (snapshot) => {
      snapshot.lobbyConfig = { maxPlayers: 3, setup: {}, bots: 6 }
    },
  ],
  ['malformed state', (snapshot) => (snapshot.state = {})],
  [
    'state for another game',
    (snapshot) => {
      snapshot.state = { ...(snapshot.state as Record<string, unknown>), gameId: 'other-game' }
    },
  ],
]

export function storedGuestSession(gameId: string | null): void {
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      roomCode: 'ABC-123',
      name: 'Bo',
      role: 'guest',
      gameId,
      joinedAt: Date.now(),
    } satisfies StoredSession),
  )
}

export // --- fix round: superseded runs must not settle or tear down another run ---

async function replacedGuestTransport(options: { startGame?: boolean } = {}) {
  const rendered = renderHook(() => useLobby())
  await act(async () => {
    await rendered.result.current.joinRoom('ABC-123', 'Bo')
    await rendered.result.current.joinRoom('ABC-123', 'Bo')
  })
  const oldTransport = transports[0]
  const liveTransport = transports[1]
  const hostId = parseRoomCode('ABC-123')
  act(() => {
    liveTransport.onConnection?.(hostId)
    if (options.startGame) {
      liveTransport.onMessage?.({
        type: 'GAME_STARTING',
        payload: {
          gameId: 'abc123-1',
          seats: [{ playerId: 'p1', peerId: liveTransport.id, name: 'Bo' }],
        },
        from: hostId,
        seq: 1,
      } as WireMessage)
    }
  })
  return { ...rendered, oldTransport, liveTransport, hostId }
}

export const renderLobby = renderHook
export function latestTransport(): FakeTransport {
  const transport = transports.at(-1)
  if (!transport) throw new Error('No fake transport was created')
  return transport
}
