import {
  type Engine,
  type Event,
  type GameState,
  type PlayerId,
  parseEventLog,
} from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { DEFAULT_SETUP } from '@release/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  botSeats,
  type PrivateSeat,
  privateSeatsFor,
  publicSeats,
  seatOf,
  seatsFor,
} from '~/entities/game/seats'
import {
  clearKeeper,
  clearLog,
  clearSession,
  getResumeToken,
  readKeeper,
  readSession,
  type StoredKeeper,
  type StoredSession,
  writeKeeper,
  writeSession,
} from '~/shared/lib/persistence'
import {
  canStart as canStartFn,
  disbandLobby as disbandLobbyFn,
  handleJoinRequest,
  handleReady,
  handleWhereabouts,
  kick as kickFn,
  type Outgoing,
  setBots as setBotsFn,
  setMaxPlayers as setMaxPlayersFn,
  transferHost as transferHostFn,
} from './lobby/host'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  applyPeerList,
  createLobbyState,
  effectiveBots,
  type LobbyState,
} from './lobby/state'
import type { GameLink, Sync } from './session/link'
import { backoffMs, MAX_RECONNECT_ATTEMPTS, type ReconnectEvent } from './session/reconnect'
import {
  adoptSession,
  createSession,
  type Seat as RefereeSeat,
  type Session,
  type SessionRef,
} from './session/referee'
import { isRelayable, relayTargets } from './session/relay'
import { attachKeeper, createRemoteLink } from './session/remoteLink'
import { restoreSeats } from './session/restore'
import { createStartGate, type StartGate } from './session/startGate'
import { createTransport, type Transport } from './transport/peer'
import type { PeerInfo, Seat, Setup, Where, WireMessage } from './types'

// Room codes double as the host's PeerJS id, so the displayed code is exactly
// what a joiner connects to — formatRoomCode/parseRoomCode are inverses.
// Ambiguous characters (0/o/1/l/i) are omitted from the alphabet.
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function makeRoomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('')
}

export function formatRoomCode(peerId: string): string {
  const head = peerId.slice(0, 6).toUpperCase()
  return head.length > 3 ? `${head.slice(0, 3)}-${head.slice(3)}` : head
}

// Inverse of formatRoomCode: strip the separator/whitespace and lowercase back
// to the host peer id a joiner can connect to.
export function parseRoomCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

// What `matchSeqRef` must be seeded to after a restore, so the NEXT startGame
// mints an id that was never used. `gameId` is always `${hostId}-${seq}`
// (startGame), and the host id itself never contains a dash (room codes are
// drawn from ROOM_CODE_ALPHABET, which has none), so the numeric suffix after
// the last dash is the sequence number that produced this exact match.
//
// A restore starting a fresh `useRef(0)` and leaving it there is the bug this
// guards: the very next startGame would mint the SAME id as the match just
// restored — the id `matchSeqRef`'s own comment already warns a repeat would
// be "silently taken for the same game" by every gameId-keyed consumer
// (useGame's move-history feed among them). Parsed defensively: a suffix that
// is not a positive integer for any reason must not silently leave the
// counter at 0 and reproduce the exact collision this exists to prevent, so
// it falls back to the clock instead — a value no realistic sequence of
// startGame calls could ever collide with.
export function matchSeqAfterRestore(gameId: string): number {
  const suffix = gameId.slice(gameId.lastIndexOf('-') + 1)
  const parsed = Number(suffix)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : Date.now()
}

// How long to keep the transport alive after broadcasting LOBBY_DISBANDED, so
// the buffered frame can flush over the DataChannels before peer.destroy().
const DISBAND_FLUSH_MS = 200

// How long the keeper snapshot trails the commit that produced it. The keeper
// offers up every state it commits, and its ticker commits twice every 250ms
// whether or not the table moved — while each write serializes a whole
// GameState. Matching the ticker's own cadence means a burst of resolution
// events costs one serialization rather than ten.
export const KEEPER_SAVE_MS = 250

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'disbanded' | 'error'

// Semantic classification of a session failure, so the UI can show localized
// copy instead of the raw English PeerJS string. 'not-found' is specifically
// "no host answers to this code" (PeerJS `peer-unavailable`); everything else
// is a connection problem.
export type ErrorKind = 'not-found' | 'connection' | null

function classify(type?: string): Exclude<ErrorKind, null> {
  return type === 'peer-unavailable' ? 'not-found' : 'connection'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseJoinRequestPayload(value: unknown): { name: string; resumeToken: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const { name, resumeToken } = value as { name?: unknown; resumeToken?: unknown }
  if (!isNonEmptyString(name) || !isNonEmptyString(resumeToken)) return null
  return { name, resumeToken }
}

function normalizePrivateSeats(value: unknown): PrivateSeat[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const privateSeats: PrivateSeat[] = []
  const playerIds = new Set<string>()
  const peerIds = new Set<string>()
  const resumeTokens = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { seat, resumeToken } = entry as { seat?: unknown; resumeToken?: unknown }
    if (typeof seat !== 'object' || seat === null) return null
    const { playerId, peerId, name, bot } = seat as {
      playerId?: unknown
      peerId?: unknown
      name?: unknown
      bot?: unknown
    }
    if (bot !== undefined && typeof bot !== 'boolean') return null
    if (bot ? resumeToken !== null : !isNonEmptyString(resumeToken)) return null
    if (!isNonEmptyString(playerId) || !isNonEmptyString(peerId) || !isNonEmptyString(name))
      return null
    if (playerIds.has(playerId) || peerIds.has(peerId)) return null
    if (typeof resumeToken === 'string' && resumeTokens.has(resumeToken)) return null
    playerIds.add(playerId)
    peerIds.add(peerId)
    if (typeof resumeToken === 'string') resumeTokens.add(resumeToken)
    privateSeats.push({
      seat: { playerId, peerId, name, ...(bot ? { bot: true } : {}) },
      resumeToken: typeof resumeToken === 'string' ? resumeToken : null,
    })
  }
  return privateSeats
}

function normalizeRefereeSeats(value: unknown): RefereeSeat[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const seats: RefereeSeat[] = []
  const playerIds = new Set<string>()
  const peerIds = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { playerId, peerId, absentSince, bot } = entry as {
      playerId?: unknown
      peerId?: unknown
      absentSince?: unknown
      bot?: unknown
    }
    if (bot !== undefined && typeof bot !== 'boolean') return null
    if (!isNonEmptyString(playerId)) return null
    if (peerId !== null && !isNonEmptyString(peerId)) return null
    if (absentSince !== null && (typeof absentSince !== 'number' || !Number.isFinite(absentSince)))
      return null
    if (bot) {
      if (peerId !== null || absentSince !== null) return null
    } else if ((peerId === null) !== (typeof absentSince === 'number')) return null
    if (playerIds.has(playerId) || (typeof peerId === 'string' && peerIds.has(peerId))) return null
    playerIds.add(playerId)
    if (typeof peerId === 'string') peerIds.add(peerId)
    seats.push({ playerId, peerId, absentSince, ...(bot ? { bot: true } : {}) })
  }
  return seats
}

interface NormalizedLobbyConfig {
  maxPlayers: number
  setup: Setup
}

function normalizeLobbyConfig(value: unknown): NormalizedLobbyConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const { maxPlayers, setup } = value as { maxPlayers?: unknown; setup?: unknown }
  if (
    typeof maxPlayers !== 'number' ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < 2 ||
    maxPlayers > 6
  ) {
    return null
  }
  if (typeof setup !== 'object' || setup === null || Array.isArray(setup)) return null
  const entries = Object.entries(setup)
  if (!entries.every(([, option]) => typeof option === 'string')) return null
  return { maxPlayers, setup: Object.fromEntries(entries) }
}

interface NormalizedKeeperSnapshot {
  gameId: string
  keeperId: PlayerId
  state: GameState
  seats: RefereeSeat[]
  privateSeats: PrivateSeat[]
  log: Event[]
  lobbyConfig?: NormalizedLobbyConfig
}

function normalizeKeeperSnapshot(
  snapshot: StoredKeeper,
  expectedGameId: string,
  hostPeerId: string,
  engine: Engine,
): NormalizedKeeperSnapshot | null {
  if (
    !isNonEmptyString(snapshot.gameId) ||
    snapshot.gameId !== expectedGameId ||
    !isNonEmptyString(snapshot.keeperId) ||
    !Number.isFinite(snapshot.savedAt)
  ) {
    return null
  }
  const log = parseEventLog(snapshot.log)
  if (!log) return null
  const privateSeats = normalizePrivateSeats(snapshot.privateSeats)
  const seats = normalizeRefereeSeats(snapshot.seats)
  if (!privateSeats || !seats || privateSeats.length !== seats.length) return null
  let lobbyConfig: NormalizedLobbyConfig | undefined
  if (snapshot.lobbyConfig !== undefined) {
    const normalizedLobbyConfig = normalizeLobbyConfig(snapshot.lobbyConfig)
    if (!normalizedLobbyConfig) return null
    lobbyConfig = normalizedLobbyConfig
  }

  const privateByPlayer = new Map(
    privateSeats.map((privateSeat) => [privateSeat.seat.playerId, privateSeat]),
  )
  for (let index = 0; index < seats.length; index += 1) {
    const seat = seats[index]
    const privateSeat = privateByPlayer.get(seat.playerId)
    if (!privateSeat || privateSeats[index].seat.playerId !== seat.playerId) return null
    if (Boolean(seat.bot) !== Boolean(privateSeat.seat.bot)) return null
    if (seat.peerId !== null && privateSeat.seat.peerId !== seat.peerId) return null
  }

  const hostPrivateSeat = privateSeats.find(({ seat }) => seat.peerId === hostPeerId)
  const hostRefereeSeat = seats.find(({ peerId }) => peerId === hostPeerId)
  if (
    !hostPrivateSeat ||
    !hostRefereeSeat ||
    hostPrivateSeat.seat.playerId !== snapshot.keeperId ||
    hostRefereeSeat.playerId !== snapshot.keeperId
  ) {
    return null
  }

  if (typeof snapshot.state !== 'object' || snapshot.state === null) return null
  const state = snapshot.state as Record<string, unknown>
  const playerIds = seats.map(({ playerId }) => playerId)
  if (
    state.gameId !== snapshot.gameId ||
    !Array.isArray(state.seating) ||
    state.seating.length !== playerIds.length ||
    !state.seating.every((playerId, index) => playerId === playerIds[index]) ||
    typeof state.players !== 'object' ||
    state.players === null
  ) {
    return null
  }
  const players = state.players as Record<string, unknown>
  if (Object.keys(players).length !== playerIds.length) return null
  for (const playerId of playerIds) {
    const player = players[playerId]
    const privateSeat = privateByPlayer.get(playerId)
    if (
      typeof player !== 'object' ||
      player === null ||
      (player as { id?: unknown }).id !== playerId ||
      (player as { name?: unknown }).name !== privateSeat?.seat.name
    ) {
      return null
    }
  }

  try {
    for (const playerId of playerIds) engine.project(snapshot.state as GameState, playerId)
  } catch {
    return null
  }

  return {
    gameId: snapshot.gameId,
    keeperId: snapshot.keeperId,
    state: snapshot.state as GameState,
    seats,
    privateSeats,
    log,
    lobbyConfig,
  }
}

// The outcome of one dial's connection to the HOST — not this browser's own
// peer registering with the signaling server (joinRoom's own returned promise
// already reports that), but whether the DataChannel to the host itself
// opened, errored, or was told to close. Reported through a callback the
// caller supplies, never through a ref: see joinRoom's `onDialOutcome`
// parameter and runGuestReconnect's own `settleAttempt` for why.
type DialOutcome = { ok: true } | { ok: false; error: unknown }

// A guest's half of the reconnect overlay (restoring is the host's). Unlike
// restoring's single boolean, a guest reload re-dials through the ordinary
// joinRoom path — the same one a fresh join uses — so there is no separate
// wire protocol to narrate, only this hook's own view of the attempt: which
// number it's on, and the events the overlay renders as terminal lines.
export interface ReconnectState {
  attempt: number
  maxAttempts: number
  status: 'idle' | 'trying' | 'failed'
  events: ReconnectEvent[]
  // Starts a fresh run from attempt 1, superseding any run still in flight
  // (mid-backoff or otherwise) — the same epoch-guard pattern restoreHost and
  // joinRoom already use to let a newer attempt win over a stale one.
  retry(): void
}

export interface UseLobby {
  state: LobbyState | null
  status: LobbyStatus
  // True for the duration of a host's mount-time restore (createTransport
  // through adopting the keeper snapshot), false otherwise — including once it
  // settles into 'in-lobby' or 'error'. This is the host's half of the
  // reconnect overlay: a board rendered while this is true has a session that
  // exists but is not yet receiving anything, and without a distinct signal
  // for that a restoring host sits in front of a blank table with nothing on
  // screen explaining why. The guest's half is `reconnect` (a later task).
  restoring: boolean
  // The guest's half of the reconnect overlay — see ReconnectState. Idle
  // whenever there is nothing to reconnect: no stored guest session, a host
  // restore that already succeeded, or a run that finished either way.
  reconnect: ReconnectState
  roomCode: string | null
  isHost: boolean
  canStart: boolean
  // Set once the game has begun — on the host when it starts one, on a guest
  // when the host's GAME_STARTING arrives. Both roles navigate off this single
  // signal, so nobody is left behind in the lobby.
  gameId: string | null
  // The seam the page holds, and nothing else — it cannot tell a bot-driven
  // seat from a remote one, which is what keeps bot play and networked play on
  // the same code path. Null until a game starts, and for a spectator, who has
  // no seat to submit from.
  gameLink: GameLink | null
  // The most recent projection this peer received. Held here rather than
  // subscribed to by the page, because the link is born inside the message
  // handler and the page only mounts after navigating — a SYNC arriving in that
  // gap would reach an empty listener set and be lost, leaving the player
  // staring at an empty table until someone else moved.
  gameSync: Sync | null
  // The seating this match was dealt with, frozen at the deal and held until the
  // match is left. It is NOT derived from `state.peers`: the roster is live and
  // `applyPeerLeft` prunes a peer the instant its channel drops, so seats
  // recomputed at read time renumber whoever is left and hand one player
  // another's seat — and the results screen would then print another player's
  // counters under their name. Empty outside a match.
  seats: Seat[]
  error: string | null
  errorKind: ErrorKind
  createRoom(name: string, maxPlayers: number, setup?: Setup): Promise<string>
  joinRoom(code: string, name: string): Promise<string>
  ready(): void
  // Where this peer now is. The host applies its own move locally; a guest sends
  // it and learns the result from the broadcast that comes back — the same split
  // `ready` makes, for the same reason: only the host's roster is authoritative.
  setWhere(where: Where): void
  kick(peerId: string): void
  setMaxPlayers(n: number): void
  // How many of the free seats should be bots. A ceiling the table honours as
  // far as it fits — see `effectiveBots`.
  setBots(n: number): void
  transferHost(id: string): void
  setSetup(setup: Setup): void
  // `botNames` is display copy, so it arrives from the features layer rather
  // than being built here: `network/` may not import i18next.
  startGame(botNames: string[]): void
  // The local seat has finished its opening deal. A no-op outside a game, and
  // for a spectator, whose report the host's gate is not waiting on.
  introReady(): void
  disband(): void
  leaveSession(): void
  // Leaving the match without leaving the room. The local match id goes — it is
  // what useFollowGameStart watches, so a peer walking back to the lobby with it
  // still set would be sent straight to the board again — and the frozen seating
  // with it, since it describes a match this peer has now left.
  //
  // The keeper, the link and the last sync stay. link.close() is local-only
  // (session/link.ts), but the match is already over and another peer may still
  // be reading its results — there is nothing here to reclaim and a live
  // results screen to break. A rematch tears the old keeper and gate down inside
  // startGame before building new ones, and leaveSession tears everything down
  // when the room itself is left.
  leaveGame(): void
  clearError(): void
}

export function useLobby(): UseLobby {
  const [state, setState] = useState<LobbyState | null>(null)
  const [status, setStatus] = useState<LobbyStatus>('idle')
  // The host's half of the reconnect overlay (see the interface doc). Set for
  // the whole span of restoreHost, success or failure alike, in a finally —
  // every early return inside it must still clear this, or a restore that
  // bails out (no stored session, spent retries) would leave the board
  // believing a reconnect is still in flight forever.
  const [restoring, setRestoring] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<ErrorKind>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameLink, setGameLink] = useState<GameLink | null>(null)
  const [gameSync, setGameSync] = useState<Sync | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const transportRef = useRef<Transport | null>(null)
  const transportGenerationRef = useRef(0)
  // The keeper's session, held only by the host. `sessionRef` is the state the
  // referee reduces; `keeperRef` and `remoteRef` are the two mutually exclusive
  // ends of the wire — a peer is one or the other, never both.
  const sessionRef = useRef<SessionRef | null>(null)
  const keeperRef = useRef<ReturnType<typeof attachKeeper> | null>(null)
  const remoteRef = useRef<ReturnType<typeof createRemoteLink> | null>(null)
  // The host's start gate, born with the keeper and dying with it: it holds a
  // pending cap timer, so it must never outlive the session it gates.
  const gateRef = useRef<StartGate | null>(null)
  // `gameId` as a ref, so reporting readiness reads the live value instead of
  // whichever render closed over it.
  const gameIdRef = useRef<string | null>(null)
  // Counts matches within one session. The room's identity is the host's peer
  // id and never changes, but a match's must: every reset downstream keys on
  // gameId — the follower's navigation, useGame's event feed, the deal intro —
  // and a rematch that reused the id would silently be taken for the same game.
  const matchSeqRef = useRef(0)
  const stateRef = useRef<LobbyState | null>(null)
  const isHostRef = useRef(false)
  // Whether the guest's DataChannel to the host ever opened. Distinguishes a
  // host that genuinely left (channel was up, then dropped) from a connection
  // that never established (ICE/negotiation failure) — so the two report
  // different, accurate errors.
  const hostConnectedRef = useRef(false)
  const leaveSessionRef = useRef<() => void>(() => {})
  // `seats` as a ref, for exactly the reason `gameIdRef` is one: the message
  // handler is a closure and would otherwise read whichever render's seating it
  // captured — and a returning player is recognised against that seating. Every
  // write goes through `applySeats`, so the ref and the state cannot drift.
  const seatsRef = useRef<Seat[]>([])
  const resumeTokensRef = useRef(new Map<string, string>())
  const privateSeatsRef = useRef<PrivateSeat[]>([])
  // The keeper snapshot waiting to be serialized, and the trailing-edge timer
  // that will do it. `lastSavedRef` holds the session object already queued: a
  // Session is immutable, so an idle tick hands back that very object and is
  // dropped before the throttle is even reached.
  const lastSavedRef = useRef<Session | null>(null)
  const pendingKeeperRef = useRef<StoredKeeper | null>(null)
  const keeperSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumped on every teardown (leaveSession). joinRoom captures it before its
  // createTransport await so a teardown that lands mid-await (e.g. Cancel / Home
  // on the invite screen, whose leaveSession runs while transportRef is still
  // null) is detected below — otherwise the resolved transport would be assigned
  // over the ref and resurrect the very session the user just cancelled.
  const sessionEpochRef = useRef(0)

  // The guest's half of the reconnect overlay (see ReconnectState).
  const [reconnectStatus, setReconnectStatus] = useState<'idle' | 'trying' | 'failed'>('idle')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [reconnectEvents, setReconnectEvents] = useState<ReconnectEvent[]>([])
  // The stored session a guest reconnect run is re-dialing. Set once, by
  // whichever of the mount effect or retry() starts the run, and read by the
  // loop itself rather than threaded through as a parameter — retry() has no
  // fresher one to offer.
  const reconnectSessionRef = useRef<StoredSession | null>(null)
  // Bumped at the start of every run (mount-triggered or retry()). A run
  // checks this after every await and bails the instant it no longer matches,
  // so a retry() fired mid-backoff supersedes the run it interrupts instead of
  // running alongside it.
  const reconnectEpochRef = useRef(0)
  // Round 1 (retry() mid-dial) and round 2 (an earlier attempt's belated
  // event landing during the next one, same run) were both caused by the
  // same shape: a per-attempt outcome living in one shared, hook-level ref,
  // reachable by every dial this loop ever opens. Round 3 found the third
  // symptom of that same shape — an unconditional clear in the per-attempt
  // `finally` could null out a *different*, newer attempt's entry. Rather
  // than add a fourth guard, the outcome is no longer kept in a shared ref
  // at all: each attempt in runGuestReconnect's loop below owns a plain
  // local `settleAttempt` closure, and hands it directly to joinRoom's
  // `onDialOutcome` parameter — see joinRoom for how its
  // onConnection/onError/onDisconnect call it straight from a per-call
  // closure, never through a ref. No attempt can reach, settle, or clear
  // another attempt's handle, because there is no cell left for two
  // attempts to both reach into.
  //
  // reconnectDialRef and reconnectPendingRef below are what remains: a
  // separate, narrower need, unrelated to joinRoom's own callbacks.
  // leaveSession runs in a different closure entirely, with nothing to
  // close over an in-flight attempt's local `settleAttempt` — it needs some
  // cross-closure way to unstick whichever attempt is currently awaiting a
  // real connection result, or a teardown mid-dial would leave that
  // attempt's `await settled` hanging forever with no epoch check able to
  // catch it (the epoch is only re-checked once `settled` itself resolves).
  // Bumped once per dial, purely to key reconnectPendingRef below — no
  // longer read by joinRoom's callbacks at all.
  const reconnectDialRef = useRef(0)
  // The one attempt (if any) currently awaiting a real connection result,
  // keyed by the reconnectDialRef token that installed it. Read and written
  // ONLY by runGuestReconnect's own install/clear (both self-keyed: a clear
  // only clears the entry it itself installed) and by leaveSession (the one
  // caller allowed to act on "whichever attempt is current" without a key
  // of its own, since it represents the player leaving outright rather than
  // a dial's own outcome). joinRoom's onConnection/onError/onDisconnect
  // never read this — they call the closure they were handed directly.
  const reconnectPendingRef = useRef<{
    token: number
    settle: (outcome: DialOutcome) => void
  } | null>(null)

  const onError = useCallback((err: { type?: string; message: string }) => {
    // Signaling/peer errors (peer-unavailable, network, disconnected) always
    // mean the session can't proceed — surface them. A per-connection error is
    // softer: once a lobby is live it shouldn't tear the whole session down, but
    // during a join (status still 'connecting') it IS the join failing, so
    // surface it too — otherwise the invite screen spins on 'connecting' forever
    // with no error shown and no recovery.
    setError(err.type ? `${err.type}: ${err.message}` : err.message)
    setErrorKind(classify(err.type))
    setStatus((s) => (err.type !== 'connection' || s === 'connecting' ? 'error' : s))
  }, [])

  // A rejected createTransport (setup failed before the peer opened) bypasses
  // onError, so route it through the same error/status machinery to avoid a
  // stuck 'connecting' spinner.
  const surfaceSetupError = useCallback((err: unknown) => {
    const e = err as { type?: string; message?: string }
    const message = e?.message ?? String(err)
    setError(e?.type ? `${e.type}: ${message}` : message)
    setErrorKind(classify(e?.type))
    setStatus('error')
  }, [])

  const commit = useCallback((next: LobbyState) => {
    stateRef.current = next
    setState(next)
  }, [])

  // The only way the seating is ever written. The page reads the state and the
  // message handler reads the ref, so setting one without the other is a bug
  // that only shows up under real timing — a returning player measured against
  // a seating one frame out of date.
  const applySeats = useCallback((next: Seat[]) => {
    seatsRef.current = next
    setSeats(next)
  }, [])

  // Drop a snapshot that has not been serialized yet, and forget what was last
  // queued. Called from every teardown: the stored record is cleared there, and
  // a trailing write landing afterwards would put the abandoned match straight
  // back.
  const cancelKeeperSave = useCallback(() => {
    if (keeperSaveTimerRef.current !== null) clearTimeout(keeperSaveTimerRef.current)
    keeperSaveTimerRef.current = null
    pendingKeeperRef.current = null
    lastSavedRef.current = null
  }, [])

  // Queue one keeper commit for persistence. Two guards, cheapest first: a
  // commit that changed nothing hands back the session object already queued
  // and is skipped outright, and whatever survives that is coalesced onto a
  // trailing edge one ticker cadence wide.
  const persistKeeper = useCallback((session: Session) => {
    if (session === lastSavedRef.current) return
    lastSavedRef.current = session
    const lobby = stateRef.current
    pendingKeeperRef.current = {
      gameId: session.gameId,
      keeperId: session.keeperId,
      state: session.state,
      seats: session.seats,
      privateSeats: privateSeatsRef.current,
      log: session.log,
      savedAt: Date.now(),
      lobbyConfig: lobby ? { maxPlayers: lobby.maxPlayers, setup: lobby.setup } : undefined,
    }
    if (keeperSaveTimerRef.current !== null) return
    keeperSaveTimerRef.current = setTimeout(() => {
      keeperSaveTimerRef.current = null
      const snapshot = pendingKeeperRef.current
      pendingKeeperRef.current = null
      if (snapshot) writeKeeper(snapshot)
    }, KEEPER_SAVE_MS)
  }, [])

  // The room is stored the moment it is entered; the match id lands on top of
  // that record when one starts. Without it a restore knows the room but not
  // that a match is running, and would put this peer back in a lobby the table
  // has already left. A missing record means the session was never stored (or
  // has expired), and inventing one here would store a room with no `name` and
  // no `joinedAt` behind it.
  // `null` walks it back: the room stays stored, the match on it does not.
  const rememberGame = useCallback((id: string | null) => {
    const stored = readSession()
    if (stored) writeSession({ ...stored, gameId: id })
  }, [])

  // Everything this browser stored about a session it is leaving. The pending
  // snapshot goes first, or clearing the record and then letting the trailing
  // write land would restore exactly what was just discarded.
  const forgetStored = useCallback(() => {
    cancelKeeperSave()
    clearSession()
    clearKeeper()
  }, [cancelKeeperSave])

  const resetRemoteLink = useCallback(() => {
    remoteRef.current?.link.close()
    remoteRef.current = null
    setGameLink(null)
  }, [])

  const teardownSession = useCallback(
    (flushMs?: number) => {
      const transport = transportRef.current
      transportGenerationRef.current += 1
      sessionEpochRef.current += 1
      reconnectEpochRef.current += 1
      reconnectSessionRef.current = null
      reconnectPendingRef.current?.settle({ ok: false, error: new Error('session left') })
      reconnectPendingRef.current = null
      setReconnectStatus('idle')
      setReconnectAttempt(0)
      setReconnectEvents([])
      transportRef.current = null
      stateRef.current = null
      isHostRef.current = false
      hostConnectedRef.current = false
      gameIdRef.current = null
      matchSeqRef.current = 0
      setState(null)
      setStatus('idle')
      setRestoring(false)
      setRoomCode(null)
      setError(null)
      setErrorKind(null)
      setIsHost(false)
      setGameId(null)
      gateRef.current?.cancel()
      gateRef.current = null
      keeperRef.current?.close()
      keeperRef.current = null
      resetRemoteLink()
      sessionRef.current = null
      setGameSync(null)
      resumeTokensRef.current.clear()
      privateSeatsRef.current = []
      applySeats([])
      forgetStored()
      clearLog()
      if (!transport) return
      if (flushMs) setTimeout(() => transport.close(), flushMs)
      else transport.close()
    },
    [applySeats, forgetStored, resetRemoteLink],
  )

  const dispatch = useCallback((outgoing: Outgoing[]) => {
    const t = transportRef.current
    if (!t) return
    for (const o of outgoing) {
      if (o.to === 'broadcast') t.broadcast(o.message)
      else t.send(o.to, o.message)
    }
  }, [])

  // A peer (or the host) dropping its DataChannel must update the roster, or the
  // lobby keeps counting a ghost player toward canStart()/turn rotation.
  // `onDisconnect` is defined above `runGuestReconnect` and has to reach it, so
  // the runner is held here and assigned once it exists. A ref rather than a
  // dependency: onDisconnect is handed to the transport at creation time and
  // must not be rebuilt every time the runner's identity changes.
  const runGuestReconnectRef = useRef<(() => Promise<void>) | null>(null)

  const onDisconnect = useCallback(
    (peerId: string) => {
      const current = stateRef.current
      if (!current) return
      if (isHostRef.current) {
        // Host owns the roster: prune the peer and tell everyone else.
        if (!current.peers[peerId]) return
        resumeTokensRef.current.delete(peerId)
        // The roster and the keeper are separate books and both have to be
        // told. Without this the seat stays bound to a dead peer id: its SYNCs
        // are addressed into the void, `driveUnattended` never starts its grace
        // period, and a returning player finds their own seat occupied —
        // `rebind` refuses a seat whose peerId is not null.
        keeperRef.current?.peerLeft(peerId)
        commit(applyPeerLeft(current, peerId))
        dispatch([{ to: 'broadcast', message: { type: 'PLAYER_KICKED', payload: { peerId } } }])
      } else if (peerId === current.hostId) {
        // The guest can't proceed without the host. Only call it "host left" if
        // we were actually connected; a channel that never opened means the
        // connection failed (ICE/negotiation) — keep that more specific error.
        // errorKind must stay in lockstep with error: a genuine post-connect
        // host departure is a fresh, definite connection failure (both
        // overwrite unconditionally), but a channel that never opened may
        // already carry a more specific kind from onError (e.g. 'not-found'
        // from peer-unavailable) — preserve it the same way the message is
        // preserved, or the two would disagree and 'not-found' would become
        // unreachable.
        // Mid-match, a lost host is not the end of the session — it is the
        // other way a peer ends up off the table, and the one a reload cannot
        // help with because this tab never went away. It happens routinely:
        // when the HOST reloads, every guest's channel dies under it. Left as
        // an error, the guest sat on a frozen board with no dial running and
        // recovered only if the player happened to reload too.
        //
        // Only once the channel had actually opened: a channel that never
        // opened is a failed join, not a lost session, and keeps its more
        // specific error below.
        const stored = readSession()
        if (gameIdRef.current && hostConnectedRef.current && stored?.role === 'guest') {
          reconnectSessionRef.current = stored
          void runGuestReconnectRef.current?.()
          return
        }
        if (hostConnectedRef.current) {
          setError('disconnected: host left the lobby')
          setErrorKind('connection')
        } else {
          setError((prev) => prev ?? 'could not connect to the lobby')
          setErrorKind((prev) => prev ?? 'connection')
        }
        setStatus('error')
      } else {
        commit(applyPeerLeft(current, peerId))
      }
    },
    [commit, dispatch],
  )

  const onMessage = useCallback(
    (msg: WireMessage) => {
      const current = stateRef.current
      if (!current) return
      if (isHostRef.current) {
        if (msg.type === 'JOIN_REQUEST') {
          const liveGameId = gameIdRef.current
          const payload = parseJoinRequestPayload((msg as { payload?: unknown }).payload)
          if (!payload) {
            if (liveGameId) keeperRef.current?.peerLeft(msg.from)
            return
          }
          // The frozen seating is what tells a return from a first join, so it
          // has to be the live one — the ref, never a closed-over copy.
          //
          // And only while a match is actually running. The seating deliberately
          // outlives `leaveGame` (a results screen still mounted reads it), so
          // the match id is what says whether there is anything to come back to:
          // without this gate a player who left the match and rejoined the room
          // would be recognised as a returner and seated back into a match they
          // walked out of — arriving in the lobby already `ready`, in `game`.
          const privateSeat = liveGameId
            ? privateSeatsRef.current.find(({ resumeToken }) => resumeToken === payload.resumeToken)
            : undefined
          if (liveGameId && !privateSeat) keeperRef.current?.peerLeft(msg.from)
          if (
            !liveGameId &&
            [...resumeTokensRef.current].some(
              ([peerId, resumeToken]) => peerId !== msg.from && resumeToken === payload.resumeToken,
            )
          ) {
            return
          }
          if (!liveGameId) resumeTokensRef.current.set(msg.from, payload.resumeToken)
          const r = handleJoinRequest(current, msg.from, payload.name, {
            matchRunning: Boolean(liveGameId),
            returningSeat: privateSeat?.seat,
          })
          commit(r.state)
          dispatch(r.outgoing)

          const seat = privateSeat?.seat
          if (seat && liveGameId) {
            // Captured before the seating is patched: this is the dead peer
            // id the returner is replacing.
            const stalePeerId = seat.peerId
            // Patch our own copy of the seating — `handleJoinRequest` told
            // everyone else with the SEAT_REBOUND it just dispatched — then
            // send the whole thing: GAME_STARTING is what `useFollowGameStart`
            // watches, so it is also what puts the returner back on its board.
            const rebound = seatsRef.current.map((candidate) =>
              candidate.playerId === seat.playerId ? { ...candidate, peerId: msg.from } : candidate,
            )
            privateSeatsRef.current = privateSeatsRef.current.map((candidate) =>
              candidate.seat.playerId === seat.playerId
                ? { ...candidate, seat: { ...candidate.seat, peerId: msg.from } }
                : candidate,
            )
            resumeTokensRef.current.delete(stalePeerId)
            resumeTokensRef.current.set(msg.from, payload.resumeToken)
            applySeats(rebound)
            dispatch([
              {
                to: msg.from,
                message: { type: 'GAME_STARTING', payload: { gameId: liveGameId, seats: rebound } },
              },
            ])
            // Belt-and-braces ordering fix: WebRTC disconnect detection can
            // lag a fast manual reload, so this JOIN_REQUEST can land before
            // onDisconnect fires for the dead connection it replaces. Left
            // alone, the referee's seat would still name the stale peer id
            // and `rebind` (session/referee.ts) refuses to claim a seat whose
            // peerId is not null — soft-locking the seat with no self-healing
            // path, since `driveUnattended`'s bot fallback never engages either
            // (the referee believes the seat is still connected). Telling the
            // referee here does not replace onDisconnect's own call to this;
            // `disconnect` is a no-op for a peer id the referee does not
            // know, so this is harmless when onDisconnect already ran first.
            if (stalePeerId !== msg.from) {
              keeperRef.current?.peerLeft(stalePeerId)
            }
            // Called after GAME_STARTING on purpose: DataChannels preserve
            // order, so the catch-up projection this produces lands behind the
            // frame that routes the peer to its board — which is where that
            // peer builds the remote link the projection needs to arrive on.
            keeperRef.current?.peerReturned(seat.playerId, msg.from)
          }
          if (!liveGameId || seat) transportRef.current?.authenticate(msg.from)
        } else if (msg.type === 'PLAYER_READY') {
          const r = handleReady(current, msg.from)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'WHEREABOUTS') {
          const r = handleWhereabouts(current, msg.from, msg.payload.where)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'INTENT' || msg.type === 'INTRO_READY') {
          // The only party that calls into the engine. `applyIntent` resolves the
          // seat from the sender's peer id and stamps the player itself, so a
          // peer cannot act for anyone but itself however it labels the frame.
          // A seat's INTRO_READY is resolved the same way, off the connection —
          // and like an intent it is addressed to the keeper, never relayed.
          keeperRef.current?.handleMessage(msg)
        } else {
          // Star topology: the host forwards any other peer-originated message
          // to every other connected peer (never back to the sender or itself),
          // preserving the original sender via relay() rather than re-stamping.
          const t = transportRef.current
          if (!t || !isRelayable(msg.type)) return
          const targets = relayTargets({
            connectedPeerIds: t.connectedIds(),
            hostId: current.hostId,
            from: msg.from,
          })
          t.relay(targets, msg)
        }
        return
      }
      // Guest-side application of host broadcasts. Only the host is authoritative
      // for the roster, so ignore PEER_LIST/PEER_JOINED that don't come from it.
      const fromHost = msg.from === current.hostId
      switch (msg.type) {
        case 'PEER_LIST':
          if (fromHost) commit(applyPeerList(current, msg.payload.peers))
          break
        case 'PEER_JOINED': {
          if (!fromHost) break
          const peer: PeerInfo = { ...msg.payload }
          commit(applyPeerJoined(current, peer))
          break
        }
        case 'LOBBY_CONFIG_UPDATED':
          if (fromHost) commit(applyConfig(current, msg.payload))
          break
        case 'PLAYER_KICKED':
          if (!fromHost) break
          if (msg.payload.peerId === current.selfId) {
            setStatus('kicked')
            // A stored record here would offer to walk the kicked player
            // straight back into the room that just removed them.
            forgetStored()
          } else commit(applyPeerLeft(current, msg.payload.peerId))
          break
        case 'GAME_STARTING': {
          // The host has left for the board; follow it. The id is carried rather
          // than derived so a future host handover can rename the room without
          // every guest recomputing it.
          if (!fromHost) break
          const t = transportRef.current
          if (t && !remoteRef.current) {
            // The keeper is the host today. `keeperPeerId` is a peer id, never a
            // PlayerId — the two spaces are both `string`, so the distinction has
            // to be kept by hand (session/remoteLink.ts:34).
            const remote = createRemoteLink({ transport: t, keeperPeerId: current.hostId })
            remoteRef.current = remote
            remote.link.subscribe(setGameSync)
            setGameLink(() => remote.link)
          }
          // A rematch arrives as two separate DataChannel events — this frame,
          // then the new match's first SYNC — and React commits the navigation
          // between them. Left in place, the previous match's projection is what
          // the board mounts on: the deal intro arms on the new gameId, finds no
          // opening in the old view, reports itself done, and the rematch's deal
          // is never played (the old game-over overlay paints for that commit
          // too). The host has no such window because `startGame` batches its
          // state into one update.
          if (msg.payload.gameId !== gameIdRef.current) setGameSync(null)
          // The seating is the host's, taken as given: recomputing it locally is
          // the defect this payload exists to close. `?? []` only covers a peer
          // running an older build — the page then falls back to seatsFor.
          applySeats(msg.payload.seats ?? [])
          gameIdRef.current = msg.payload.gameId
          setGameId(msg.payload.gameId)
          rememberGame(msg.payload.gameId)
          break
        }
        case 'SEAT_REBOUND': {
          // The host's word, exactly like every roster patch above. A forged
          // one would repoint a seat at a peer id of the forger's choosing, and
          // that seat's private fan-out follows the peer id.
          if (!fromHost) break
          applySeats(
            seatsRef.current.map((s) =>
              s.playerId === msg.payload.playerId ? { ...s, peerId: msg.payload.peerId } : s,
            ),
          )
          break
        }
        case 'SYNC':
        case 'KEEPER_CHANGED':
          // The remote link re-checks the sender against the keeper it knows, so
          // this is a route rather than a trust decision.
          remoteRef.current?.handleMessage(msg)
          break
        case 'LOBBY_DISBANDED':
          if (fromHost) {
            leaveSessionRef.current()
            // leaveSession sets status to 'idle'; this override is batched in the
            // same React update, so 'disbanded' wins in the final render.
            setStatus('disbanded')
          }
          break
        default:
          break
      }
    },
    [commit, dispatch, applySeats, forgetStored, rememberGame],
  )

  const createRoom = useCallback(
    async (name: string, maxPlayers: number, setup?: Setup) => {
      teardownSession()
      const generation = ++transportGenerationRef.current
      const epoch = sessionEpochRef.current
      let owner: Transport | null = null
      const ownsTransport = () =>
        transportGenerationRef.current === generation && transportRef.current === owner
      const cancelled = () =>
        sessionEpochRef.current !== epoch || transportGenerationRef.current !== generation
      setStatus('connecting')
      setError(null)
      setErrorKind(null)
      try {
        // The host's peer id IS the room code, so the displayed code is exactly
        // what a joiner connects to — formatRoomCode/parseRoomCode round-trip it.
        const t = await createTransport({
          peerId: makeRoomCode(),
          onMessage: (msg) => {
            if (ownsTransport()) onMessage(msg)
          },
          onError: (err) => {
            if (ownsTransport()) onError(err)
          },
          onDisconnect: (peerId) => {
            if (ownsTransport()) onDisconnect(peerId)
          },
        })
        owner = t
        if (cancelled()) {
          t.close()
          throw new Error('create cancelled')
        }
        transportRef.current = t
        isHostRef.current = true
        setIsHost(true)
        const nextRoomCode = formatRoomCode(t.id)
        setRoomCode(nextRoomCode)
        resumeTokensRef.current = new Map([[t.id, getResumeToken(nextRoomCode)]])
        privateSeatsRef.current = []
        const initial = createLobbyState({
          selfId: t.id,
          hostId: t.id,
          maxPlayers,
          setup: setup ?? DEFAULT_SETUP,
          peers: [{ id: t.id, name, role: 'host', ready: true, where: 'lobby' }],
        })
        commit(initial)
        // What a reload has to find its way back with. `gameId: null` because
        // the room exists before any match in it does.
        writeSession({
          roomCode: nextRoomCode,
          name,
          role: 'host',
          gameId: null,
          joinedAt: Date.now(),
        })
        setStatus('in-lobby')
        // The room code is the host peer id — known synchronously, so callers can
        // navigate straight to /lobby/:code without awaiting a roster round-trip.
        return nextRoomCode
      } catch (err) {
        if (cancelled()) {
          if (err instanceof Error && err.message === 'create cancelled') throw err
          throw new Error('create cancelled')
        }
        // createTransport rejects on a setup failure (taken peer id, signaling
        // server unreachable) WITHOUT going through onError, so surface it here —
        // otherwise status would stay 'connecting' forever. Re-throw so the
        // caller skips the post-await navigate.
        surfaceSetupError(err)
        throw err
      }
    },
    [onMessage, onError, onDisconnect, commit, surfaceSetupError, teardownSession],
  )

  const joinRoom = useCallback(
    async (
      code: string,
      name: string,
      // Reports this specific dial's connection outcome — never read from a
      // ref, called directly from the per-call closures below the moment
      // the outcome is known. Only the guest reconnect loop passes one (its
      // own `settleAttempt`, one fresh instance per attempt); an ordinary,
      // player-initiated join passes nothing, so every call below is a
      // plain no-op for it.
      onDialOutcome?: (outcome: DialOutcome) => void,
      preserveSession = false,
    ) => {
      if (preserveSession) {
        transportGenerationRef.current += 1
        resetRemoteLink()
        const previousTransport = transportRef.current
        transportRef.current = null
        previousTransport?.close()
      } else {
        teardownSession()
      }
      const generation = ++transportGenerationRef.current
      setStatus('connecting')
      setError(null)
      setErrorKind(null)
      hostConnectedRef.current = false
      const hostId = parseRoomCode(code)
      const nextRoomCode = formatRoomCode(hostId)
      // Snapshot the session generation so a Cancel/Home (leaveSession) during
      // the createTransport round-trip is detectable below.
      const epoch = sessionEpochRef.current
      try {
        let owner: Transport | null = null
        const ownsTransport = () =>
          transportGenerationRef.current === generation && transportRef.current === owner
        const t = await createTransport({
          onMessage: (msg) => {
            if (ownsTransport()) onMessage(msg)
          },
          onError: (err) => {
            if (!ownsTransport()) return
            // The general error surfacing (status/errorKind) always applies —
            // onDialOutcome is a separate, additional notification, not a
            // gate on this.
            onError(err)
            onDialOutcome?.({ ok: false, error: err })
          },
          onDisconnect: (peerId) => {
            if (!ownsTransport()) return
            onDisconnect(peerId)
            onDialOutcome?.({ ok: false, error: new Error('host disconnected') })
          },
          onConnection: (peerId) => {
            if (!ownsTransport()) return
            // Send JOIN_REQUEST exactly when the host DataChannel opens — a
            // setTimeout(0) is not sufficient over real WebRTC because the channel
            // may not be open after a single macrotask. Only now is the join
            // confirmed, so flip to 'in-lobby' here rather than optimistically:
            // a bad/expired code never opens and surfaces as a PeerJS error.
            if (peerId === hostId) {
              hostConnectedRef.current = true
              owner?.send(hostId, {
                type: 'JOIN_REQUEST',
                payload: { name, resumeToken: getResumeToken(nextRoomCode) },
              })
              setStatus('in-lobby')
              onDialOutcome?.({ ok: true })
            }
          },
        })
        owner = t
        // Torn down mid-await (Cancel/Home bumped the epoch and reset to idle):
        // discard the freshly-opened peer instead of committing it, or the
        // cancelled attempt resurrects — leaking a live peer and re-arming the
        // /start "continue game" button for a session the user just left.
        if (sessionEpochRef.current !== epoch || transportGenerationRef.current !== generation) {
          t.close()
          throw new Error('join cancelled')
        }
        transportRef.current = t
        isHostRef.current = false
        setIsHost(false)
        setRoomCode(nextRoomCode)
        commit(
          createLobbyState({
            selfId: t.id,
            hostId,
            maxPlayers: 6,
            setup: DEFAULT_SETUP,
            peers: [
              {
                id: t.id,
                name,
                role: 'guest',
                ready: false,
                where: 'lobby',
              },
            ],
          }),
        )
        // The room code, not this peer's own id: the code is what a reload has
        // to dial, and this peer's id dies with the tab.
        writeSession({
          roomCode: nextRoomCode,
          name,
          role: 'guest',
          gameId: preserveSession ? (gameIdRef.current ?? readSession()?.gameId ?? null) : null,
          joinedAt: Date.now(),
        })
        t.connectTo(hostId)
        // The code resolves to the host id synchronously (parseRoomCode), so the
        // caller can route to /lobby/:code immediately; a bad code surfaces later
        // as a connection error on that same route.
        return nextRoomCode
      } catch (err) {
        // A cancellation (epoch bumped) already reset the session to idle — don't
        // overwrite that with an error state; just propagate so the caller skips
        // the post-await navigate.
        if (sessionEpochRef.current !== epoch || transportGenerationRef.current !== generation)
          throw err
        // Peer setup failed before opening (bad code, signaling unreachable);
        // surface it instead of leaving the form stuck on 'connecting', and
        // re-throw so the caller skips the post-await navigate.
        surfaceSetupError(err)
        throw err
      }
    },
    [onMessage, onError, onDisconnect, commit, resetRemoteLink, surfaceSetupError, teardownSession],
  )

  // Runs once on mount, before anything else can create a transport. A stored
  // session whose role is 'host' and whose keeper snapshot matches its gameId
  // is a match this browser was keeping when the tab went away — everything
  // else (no record, a guest's record, a room with no match running, a
  // snapshot left over from a different match) is not this restore's problem
  // and is left for the caller (a guest's own reconnect belongs to a later
  // task).
  const restoreHost = useCallback(async (): Promise<boolean> => {
    const stored = readSession()
    const snapshot = readKeeper()
    if (stored?.role !== 'host') return false
    if (!stored.gameId) return false
    const rejectStoredMatch = () => {
      clearKeeper()
      clearSession()
      return false
    }
    if (!snapshot || !isNonEmptyString(stored.roomCode)) return rejectStoredMatch()
    const hostPeerId = parseRoomCode(stored.roomCode)
    const engine = createFakeEngine()
    const normalized = normalizeKeeperSnapshot(snapshot, stored.gameId, hostPeerId, engine)
    if (!normalized) return rejectStoredMatch()
    const generation = ++transportGenerationRef.current
    const epoch = sessionEpochRef.current
    let owner: Transport | null = null
    const ownsTransport = () =>
      transportGenerationRef.current === generation && transportRef.current === owner

    setStatus('connecting')
    setError(null)
    setErrorKind(null)
    // The host's half of the reconnect overlay: true for the whole span below,
    // cleared in the finally so every exit path — success, spent retries, a
    // teardown racing the retry loop — leaves it false rather than stuck true.
    setRestoring(true)
    try {
      // A fast reload can leave the signaling broker still holding the old
      // registration under this exact peer id, which PeerJS reports as
      // 'unavailable-id' — it frees itself moments later. Retried rather than
      // surfaced immediately: reclaiming this EXACT id is the whole point,
      // since the room code IS that id and a fresh one would strand every
      // peer still dialing the old one.
      let t: Transport | null = null
      let lastErr: unknown
      for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        try {
          t = await createTransport({
            peerId: hostPeerId,
            onMessage: (msg) => {
              if (ownsTransport()) onMessage(msg)
            },
            onError: (err) => {
              if (ownsTransport()) onError(err)
            },
            onDisconnect: (peerId) => {
              if (ownsTransport()) onDisconnect(peerId)
            },
          })
          owner = t
          break
        } catch (err) {
          lastErr = err
          if (attempt === MAX_RECONNECT_ATTEMPTS) break
          await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
        }
      }
      if (!t) {
        // Every attempt spent without going through onError (a rejected
        // createTransport bypasses it), so surface it here or 'connecting'
        // spins forever.
        if (sessionEpochRef.current === epoch && transportGenerationRef.current === generation) {
          surfaceSetupError(lastErr)
        }
        return false
      }
      if (sessionEpochRef.current !== epoch || transportGenerationRef.current !== generation) {
        // Torn down while this was retrying: discard the freshly-opened peer
        // instead of committing it, or the abandoned attempt resurrects.
        t.close()
        return false
      }

      transportRef.current = t
      isHostRef.current = true
      setIsHost(true)
      setRoomCode(stored.roomCode)
      privateSeatsRef.current = normalized.privateSeats
      applySeats(publicSeats(privateSeatsRef.current))
      resumeTokensRef.current = new Map(
        privateSeatsRef.current.flatMap(({ seat, resumeToken }) =>
          resumeToken === null ? [] : [[seat.peerId, resumeToken] as const],
        ),
      )

      // The absence-clock trap: a stored `absentSince` describes time that
      // passed while nothing was keeping the table. Restored as-is, the first
      // tick's `driveUnattended` would see every seat far past its 30s grace and
      // bot-play the whole match before a single player could re-dial — so
      // every seat but the host's own is restamped to now. The host's own
      // seat keeps its peer id: the room code IS that id and it was just
      // reclaimed unchanged, so the seat is still addressable through it.
      const restoredSeats = restoreSeats(normalized.seats, t.id, Date.now())
      const session = adoptSession({
        state: normalized.state,
        gameId: normalized.gameId,
        keeperId: normalized.keeperId,
        engine,
        seats: restoredSeats,
        log: normalized.log,
      })
      const ref: SessionRef = { current: session }
      sessionRef.current = ref

      // No gate: the start gate holds the table until every seat reports
      // INTRO_READY, and mid-match nobody ever will — passing one here would
      // deadlock every intent for the rest of the game. `persistKeeper` is the
      // same throttled write every other keeper in this hook already uses.
      const keeper = attachKeeper({
        ref,
        transport: t,
        now: () => Date.now(),
        onCommit: persistKeeper,
      })
      keeperRef.current = keeper
      keeper.link.subscribe(setGameSync)
      setGameLink(() => keeper.link)

      // Only the host is here; everyone else re-dials. Their JOIN_REQUEST
      // carries the resume token that puts them back in their seat.
      const lobbyConfig = normalized.lobbyConfig
      commit(
        createLobbyState({
          selfId: t.id,
          hostId: t.id,
          maxPlayers: lobbyConfig?.maxPlayers ?? 6,
          setup: (lobbyConfig?.setup as Setup | undefined) ?? normalized.state.setup,
          peers: [
            {
              id: t.id,
              name: stored.name,
              role: 'host',
              ready: true,
              where: 'game',
            },
          ],
        }),
      )
      // `resync()` with NO events, which is the whole distinction that matters
      // here. Attaching a keeper and subscribing to it delivers nothing on its
      // own — something has to ask for the current state — so without this the
      // restored host holds a live session it never receives a projection for,
      // `useGame` keeps a null view, and the board sits on EMPTY_TABLE until
      // the host happens to act. On a turn that is not theirs, it never can.
      //
      // Deliberately not `resync(engine.setupEvents(...))`: THAT replays the
      // opening deal, and this match was dealt long ago. Empty events are a
      // statement of where the game stands rather than an account of how it got
      // there, so the board's intro finds no deal and hands over at once.
      keeper.resync()
      gameIdRef.current = normalized.gameId
      setGameId(normalized.gameId)
      // Or the next startGame (a rematch, no reload in between) would mint
      // this exact id again — see matchSeqAfterRestore.
      matchSeqRef.current = matchSeqAfterRestore(normalized.gameId)
      setStatus('in-lobby')
      return true
    } finally {
      setRestoring(false)
    }
  }, [onMessage, onError, onDisconnect, commit, applySeats, persistKeeper, surfaceSetupError])

  const pushReconnectEvent = useCallback((kind: ReconnectEvent['kind'], attempt: number) => {
    setReconnectEvents((prev) => [...prev, { kind, attempt, at: Date.now() }])
  }, [])

  // A guest's half of the mount-time restore (restoreHost is the host's). Only
  // ever runs when restoreHost has already declined the session — the two are
  // exclusive, never both. Unlike restoreHost, there is nothing to adopt
  // locally: the host already owns this peer's seat, and re-dialling through
  // joinRoom (which sends JOIN_REQUEST with this browser's resume token) is what
  // gets it back — a lobby reload and a mid-match reload are the same re-dial,
  // since `stored.gameId` only decides where the host seats the returner, not
  // whether one happens.
  const runGuestReconnect = useCallback(async () => {
    const stored = reconnectSessionRef.current
    if (!stored) return
    // Bumped before anything awaits, so a retry() fired mid-run (mid-backoff,
    // typically) supersedes this run rather than racing it — every check below
    // reads it back after each await. `sessionEpoch` is the separate teardown
    // guard: leaveSession() must stop this loop the same way it stops
    // restoreHost's, even though nothing here mutates the ref directly.
    const runEpoch = ++reconnectEpochRef.current
    const sessionEpoch = sessionEpochRef.current
    setReconnectStatus('trying')
    setReconnectAttempt(0)
    setReconnectEvents([])

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (reconnectEpochRef.current !== runEpoch || sessionEpochRef.current !== sessionEpoch) return
      setReconnectAttempt(attempt)
      pushReconnectEvent('dialing', attempt)

      // A fresh token identifying THIS dial. Used only to key
      // reconnectPendingRef below (installed for leaveSession's benefit,
      // never read by joinRoom) — the settle handle itself is the plain
      // local closure right after it, reachable by nothing outside this one
      // iteration.
      const dialToken = ++reconnectDialRef.current

      // This attempt's own settle handle — local to this one iteration of
      // the loop, never written to any shared ref. `settleAttempt` is
      // handed straight to joinRoom as `onDialOutcome`, so its own
      // onConnection/onError/onDisconnect closures call it directly; no
      // other attempt, past or future, has any way to reach it. The
      // `alreadySettled` guard is what gives it Promise-like "first call
      // wins" semantics without actually needing a Promise for the plumbing.
      let alreadySettled = false
      let resolveAttempt: (() => void) | undefined
      let rejectAttempt: ((err: unknown) => void) | undefined
      const settled = new Promise<void>((resolve, reject) => {
        resolveAttempt = resolve
        rejectAttempt = reject
      })
      const settleAttempt = (outcome: DialOutcome) => {
        if (alreadySettled) return
        alreadySettled = true
        if (outcome.ok) resolveAttempt?.()
        else rejectAttempt?.(outcome.error)
      }
      // The one place this attempt's handle becomes reachable from outside
      // this closure — installed so leaveSession (a different function
      // entirely) can still unstick it if the player leaves while it's
      // genuinely in flight. Keyed by dialToken: leaveSession itself reads
      // whatever is current without a key of its own (see its own comment),
      // but every WRITE here — this install, and the self-keyed clear in
      // the finally below — only ever touches the entry it itself owns.
      reconnectPendingRef.current = { token: dialToken, settle: settleAttempt }

      let connected = false
      try {
        await joinRoom(stored.roomCode, stored.name, settleAttempt, true)
        if (reconnectEpochRef.current === runEpoch && sessionEpochRef.current === sessionEpoch) {
          await settled
          connected = true
        }
      } catch {
        // Handled below via `connected` staying false — a thrown setup
        // failure (joinRoom) and a rejected `settled` (a real connection
        // failure) are both just "this attempt didn't make it."
      } finally {
        // Self-keyed: only clear the entry if it is still the one THIS
        // attempt installed. A newer attempt (retry(), or the loop's own
        // next iteration) may already have installed its own by the time
        // this runs — e.g. when this attempt's epoch check above declined
        // to even await `settled` — and that entry must survive this
        // attempt's own cleanup untouched.
        if (reconnectPendingRef.current?.token === dialToken) {
          reconnectPendingRef.current = null
        }
      }

      if (reconnectEpochRef.current !== runEpoch || sessionEpochRef.current !== sessionEpoch) return

      if (connected) {
        pushReconnectEvent('channel-open', attempt)
        pushReconnectEvent('handshake', attempt)
        // Done: cleared back to idle so a working table never sits under a
        // reconnect overlay that thinks it is still trying. The stored
        // session is cleared too — a retry() fired after this point (a stray
        // double-invoke, or anything reaching this callback outside the
        // 'trying'/'failed' gate retryReconnect enforces below) must find
        // nothing to re-dial rather than tearing down a live, working
        // transport. Belt-and-braces alongside that gate, not a substitute
        // for it: this is what makes the gate's premise ("idle means nothing
        // to retry") actually true.
        reconnectSessionRef.current = null
        setReconnectStatus('idle')
        return
      }

      if (attempt === MAX_RECONNECT_ATTEMPTS) {
        pushReconnectEvent('failed', attempt)
        setReconnectStatus('failed')
        return
      }
      pushReconnectEvent('backoff', attempt)
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
    }
  }, [joinRoom, pushReconnectEvent])

  // Starts a fresh run from attempt 1. Guarded to only actually start one
  // while the previous run is 'trying' or 'failed' — the overlay's retry
  // button calls this directly, so a stray double-invoke (or any other path
  // reaching this outside those two states) must not re-enter the loop once
  // a run has already succeeded ('idle') or nothing was ever offered to
  // reconnect in the first place. A no-op silently, matching restoreHost/
  // joinRoom's own "nothing to do" silence rather than throwing.
  // Published for `onDisconnect` above, which cannot close over it directly.
  runGuestReconnectRef.current = runGuestReconnect

  const retryReconnect = useCallback(() => {
    if (reconnectStatus !== 'trying' && reconnectStatus !== 'failed') return
    void runGuestReconnect()
  }, [runGuestReconnect, reconnectStatus])

  // Once per mount, before any screen can act. A restore that finds nothing
  // stored is a no-op, so this is safe on a cold start. Guest reconnect only
  // runs once restoreHost has declined the session — the two are exclusive,
  // and a host session that DID restore has nothing left for a guest re-dial
  // to do.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void (async () => {
      const hostRestored = await restoreHost()
      if (hostRestored) return
      const stored = readSession()
      if (stored?.role !== 'guest') return
      reconnectSessionRef.current = stored
      await runGuestReconnect()
    })()
  }, [restoreHost, runGuestReconnect])

  const ready = useCallback(() => {
    const t = transportRef.current
    const current = stateRef.current
    if (!t || !current) return
    if (isHostRef.current) {
      const r = handleReady(current, current.selfId)
      commit(r.state)
      dispatch(r.outgoing)
    } else {
      t.send(current.hostId, { type: 'PLAYER_READY', payload: {} })
    }
  }, [commit, dispatch])

  // Where this peer now is. The host applies its own move locally; a guest sends
  // it and learns the result from the broadcast that comes back — the same split
  // `ready` makes, for the same reason: only the host's roster is authoritative.
  const setWhere = useCallback(
    (where: Where) => {
      const t = transportRef.current
      const current = stateRef.current
      if (!t || !current) return
      if (isHostRef.current) {
        const r = handleWhereabouts(current, current.selfId, where)
        commit(r.state)
        dispatch(r.outgoing)
      } else {
        t.send(current.hostId, { type: 'WHEREABOUTS', payload: { where } })
      }
    },
    [commit, dispatch],
  )

  const kick = useCallback(
    (peerId: string) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      resumeTokensRef.current.delete(peerId)
      const r = kickFn(current, peerId)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )

  const setMaxPlayers = useCallback(
    (n: number) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = setMaxPlayersFn(current, n)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )

  const setBots = useCallback(
    (n: number) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = setBotsFn(current, n)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )

  // NOTE: transferHost currently only broadcasts the intent (TRANSFER_HOST).
  // The actual host handoff — reconnecting peers to the new host and sending the
  // HOST_TRANSFERRED confirmation — is not implemented yet; it belongs to the
  // page wiring in #18. Moving the host is only moving the relay: the keeper
  // keeps playing and its state does not travel, so no game state is involved.
  const transferHost = useCallback(
    (id: string) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = transferHostFn(current, id)
      dispatch(r.outgoing)
    },
    [dispatch],
  )

  // Tear the session down: close the PeerJS transport and reset to idle. Without
  // this, navigating away leaves the connection open and the state alive, so the
  // user is bounced back into their old session. `flushMs` defers only the
  // transport close (state resets immediately) so a final broadcast can flush
  // over the DataChannels before peer.destroy() — see disband().
  const leaveSession = useCallback(
    (flushMs?: number) => {
      teardownSession(flushMs)
    },
    [teardownSession],
  )
  leaveSessionRef.current = leaveSession

  // Leaving the match without leaving the room. Only the local match id goes —
  // it is what useFollowGameStart watches, so a peer walking back to the lobby
  // with it still set would be sent straight to the board again.
  //
  // The frozen seating deliberately STAYS. Clearing it would make the results
  // screen fall back to seatsFor(live roster) for as long as it is still
  // mounted, which is the renumbering the frozen seating exists to end: one
  // player's counters standing under another player's name, and the departed
  // player's row gone. Nothing paints today because React batches this with the
  // navigation that follows it — but that makes the invariant rest on statement
  // order inside one handler rather than on the data, and an added await, a
  // split handler or a navigation moved into an effect would each be enough.
  // The rows come from the seating the match was dealt with, full stop.
  // Nothing reads it stale: GAME_STARTING overwrites it for the next match, and
  // leaveSession clears it when the room itself is left.
  //
  // The keeper, the link and the last sync stay for the same kind of reason.
  // link.close() is local-only (session/link.ts), but the match is already over
  // and another peer may still be reading its results — there is nothing here to
  // reclaim and a live results screen to break. A rematch tears the old keeper
  // and gate down inside startGame before building new ones.
  //
  // What is stored follows the same split, for the same reason: leaving the
  // match is not leaving the room. The keeper snapshot goes — it describes a
  // match this peer is done with, and a reload finding it would put them back
  // on a board they walked off — while the session record stays, minus its
  // gameId, so the room itself is still restorable. The pending write is
  // cancelled first: a snapshot still on its trailing edge would otherwise land
  // behind the clear and resurrect exactly what was deleted.
  //
  // Nothing rewrites it afterwards. The keeper deliberately stays alive here,
  // but the only caller is the results screen (pages/board/[gameId]/stats.tsx),
  // reached once the match is over — and `tick` and `driveUnattended` both no-op on
  // a finished game, so its commits are reference-identical and never queue a
  // write.
  const leaveGame = useCallback(() => {
    gameIdRef.current = null
    setGameId(null)
    cancelKeeperSave()
    clearKeeper()
    // A room outlives the match played in it, so walking the record back to
    // `gameId: null` keeps it restorable.
    rememberGame(null)
  }, [cancelKeeperSave, rememberGame])

  const setSetup = useCallback(
    (setup: Setup) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      commit(applyConfig(current, { setup }))
      dispatch([{ to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { setup } } }])
    },
    [commit, dispatch],
  )

  // What `startGame` needs to bring a match into being: mint a seed, create
  // the engine, seat the referee, gate the opening behind whichever seats
  // should hold up the table, and attach a keeper to whatever transport it
  // was handed. Pulled out of `startGame` so a future second caller of this
  // wiring shares it rather than copy-pasting it (and its `gateExpect`).
  const attachNewMatch = useCallback(
    (params: {
      gameId: string
      keeperId: PlayerId
      // Same shape `createSession` itself declares, not the referee's own
      // `Seat` (RefereeSeat): the lobby's roster passes bot entries with no
      // peerId, and this is the shape both a live seat and a bot's seat
      // structurally satisfy.
      players: { playerId: PlayerId; peerId: string | null; name: string; bot?: boolean }[]
      setup: Setup
      transport: Transport
      // Who the start gate waits for before the table may move. The match
      // waits on every human seat, spectators and bots excluded — a bot never
      // runs an opening and would hold the gate for the whole INTRO_CAP_MS if
      // it were named here.
      gateExpect: PlayerId[]
    }) => {
      // Renamed off `gameId` on the way out of `params`: the hook already has
      // a state variable of that name, and this one is a plain local, not it.
      const { gameId: matchId, keeperId, players, setup, transport, gateExpect } = params

      // The engine never sources randomness, so the seed is minted here and
      // the match is a pure function of it — determinism is what lets every
      // peer reach the same state.
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      // Held rather than inlined: the opening deal has to be asked of this
      // same engine again below, once the session exists.
      const engine = createFakeEngine()

      const { session } = createSession({
        gameId: matchId,
        keeperId,
        engine,
        seed,
        players,
        setup,
        deck: FAKE_DECK,
        events: FAKE_EVENTS,
      })
      const ref: SessionRef = { current: session }
      sessionRef.current = ref

      const gate = createStartGate({ expect: gateExpect })
      gateRef.current = gate

      const keeper = attachKeeper({
        ref,
        transport,
        now: () => Date.now(),
        gate,
        onCommit: persistKeeper,
      })
      keeperRef.current = keeper
      keeper.link.subscribe(setGameSync)
      setGameLink(() => keeper.link)

      return { engine, session, keeper }
    },
    [persistKeeper],
  )

  // Host-only: tell the table to follow, then move. The board route is keyed by
  // the MATCH id, minted here and carried in the payload, so every peer resolves
  // the same URL from the frame rather than deriving one — a rematch gets its own
  // id and nobody has to recompute it.
  // Broadcast first — setGameId navigates this peer away, and an unmounting
  // component must not be what the others are waiting on.
  const startGame = useCallback(
    (botNames: string[]) => {
      const current = stateRef.current
      const t = transportRef.current
      if (!current || !t || !isHostRef.current) return
      matchSeqRef.current += 1
      const id = `${current.hostId}-${matchSeqRef.current}`

      const humans = seatsFor(current.peers)
      const mine = seatOf(humans, current.selfId)
      if (!mine) return
      // The ceiling resolved once, here, at the only moment it matters: from
      // now on this seating is frozen and broadcast, and nobody derives it again.
      //
      // Clamped against `botNames.length` rather than trusting it to already
      // match: the caller (useStartGame) counts bots from React state, while
      // `effectiveBots(current)` here reads the ref — a peer joining or
      // leaving between that render and this click can make the two disagree.
      // Asking `botSeats` for more names than it was given is what produces a
      // nameless bot (`names[i] ?? ''`); asking for fewer than the ceiling
      // allows seats a bot short of what the table could otherwise fit, which
      // is the safe side of that same mismatch to fail on.
      const botCount = Math.min(effectiveBots(current), botNames.length)
      const dealt = [...humans, ...botSeats(botCount, humans.length, botNames)]
      // The referee's own idea of an empty seat is `peerId: null` — exactly
      // what `driveUnattended` (session/referee.ts) selects on to know a seat
      // plays itself. The wire seating above needs a real string there instead:
      // it is the roster row's key and the board's React key, and a bot still
      // needs one to be addressable at all (see botSeats's own comment). So the
      // two disagree on purpose — `dealt` keeps the synthetic `bot:N` address
      // for display and keying, while the referee is seated from a copy where
      // a bot's peerId is nulled back out, which is what gets it actually
      // driven from the first tick instead of waiting out a human's grace
      // period it was never subject to.
      const privateSeats = privateSeatsFor(dealt, resumeTokensRef.current)
      const refereeSeats = dealt.map((s) => (s.bot ? { ...s, peerId: null } : s))

      // A rematch reassigns all three refs `attachNewMatch` sets below.
      // Reassignment is not teardown: the previous keeper's 250ms ticker would go
      // on running for the life of the tab with setGameSync still in its listener
      // set, and the previous gate's pending cap would fire into a match that no
      // longer exists. Same order leaveSession uses — the gate first, because it
      // must never outlive its session.
      gateRef.current?.cancel()
      gateRef.current = null
      keeperRef.current?.close()
      keeperRef.current = null
      // The previous match's snapshot may still be waiting on its trailing edge.
      // Left queued it would be written under the new match's lobby seating, and
      // the new keeper's own first commit would then have to overwrite it.
      cancelKeeperSave()

      // Every seat, including the host's own: one rule for the table. Spectators
      // hold no seat and are never waited on — they have no projection to replay,
      // so they never run a deal and could never report done.
      const { engine, session, keeper } = attachNewMatch({
        gameId: id,
        keeperId: mine.playerId,
        players: refereeSeats,
        setup: current.setup,
        transport: t,
        // A bot runs no opening animation, so the gate waits only on the humans —
        // otherwise a match with bots seated would hold at the intro for the full
        // cap with nobody left to report done.
        gateExpect: humans.map((s) => s.playerId),
      })

      privateSeatsRef.current = privateSeats
      // Tell the table to follow before dealing, so a guest has built its remote
      // link by the time its projection arrives. DataChannels preserve order, so
      // GAME_STARTING is always ahead of the SYNC that follows it.
      dispatch([
        {
          to: 'broadcast',
          message: { type: 'GAME_STARTING', payload: { gameId: id, seats: dealt } },
        },
      ])
      gameIdRef.current = id
      setGameId(id)
      rememberGame(id)
      // The same array the engine was seated with, held rather than recomputed —
      // see the `seats` member above. Before `resync` below, because the snapshot
      // that commit produces stores this seating alongside the referee's.
      applySeats(dealt)
      // The deal travels with the first projection. `createSession` also returns it
      // as `outgoing`, but that array is unreachable from here — the keeper owns
      // delivery — so it is asked of the engine again and handed to the fan-out.
      // Without it every peer receives a hand with no account of where it came
      // from: the board's intro has no deal to replay and the move history opens
      // on a blank.
      keeper.resync(engine.setupEvents(session.state))
    },
    [dispatch, applySeats, cancelKeeperSave, rememberGame, attachNewMatch],
  )

  // The local seat has finished its opening. The host reports into its own
  // keeper; a guest sends the frame, and the host's keeper resolves the seat
  // from the connection it arrived on — the same path an intent takes, so a
  // peer cannot report for somebody else.
  const introReady = useCallback(() => {
    const id = gameIdRef.current
    const current = stateRef.current
    // No game means nothing to report into: send nothing, touch nothing.
    if (!id || !current) return
    if (isHostRef.current) {
      const t = transportRef.current
      if (t) keeperRef.current?.introReady(t.id)
      return
    }
    dispatch([{ to: current.hostId, message: { type: 'INTRO_READY', payload: { gameId: id } } }])
  }, [dispatch])

  const disband = useCallback(() => {
    const current = stateRef.current
    if (!current || !isHostRef.current) return
    const r = disbandLobbyFn(current)
    dispatch(r.outgoing)
    // Defer the transport teardown so the just-queued LOBBY_DISBANDED frame can
    // flush over the DataChannels before peer.destroy() closes them — otherwise
    // guests may never receive it and would only notice via the host-disconnect
    // path. Local state still resets immediately.
    leaveSession(DISBAND_FLUSH_MS)
  }, [dispatch, leaveSession])

  // Dismiss a sticky error (e.g. a failed join) without tearing down a live
  // session. Returns the status to idle only when it was 'error', so calling
  // this on mount can't kill an in-lobby session.
  const clearError = useCallback(() => {
    setError(null)
    setErrorKind(null)
    setStatus((s) => (s === 'error' ? 'idle' : s))
  }, [])

  // Memoized so the value handed to the root SessionContext keeps a stable
  // identity across renders — consumers only re-render when state actually
  // changes, not on every render of the always-mounted _app layout. The
  // callbacks are already stable (useCallback), so only the values vary.
  return useMemo<UseLobby>(
    () => ({
      state,
      status,
      restoring,
      reconnect: {
        attempt: reconnectAttempt,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        status: reconnectStatus,
        events: reconnectEvents,
        retry: retryReconnect,
      },
      roomCode,
      isHost,
      canStart: state ? canStartFn(state) : false,
      gameId,
      gameLink,
      gameSync,
      seats,
      error,
      errorKind,
      createRoom,
      joinRoom,
      ready,
      setWhere,
      kick,
      setMaxPlayers,
      setBots,
      transferHost,
      setSetup,
      startGame,
      introReady,
      disband,
      leaveSession,
      leaveGame,
      clearError,
    }),
    [
      state,
      status,
      restoring,
      reconnectAttempt,
      reconnectStatus,
      reconnectEvents,
      retryReconnect,
      roomCode,
      isHost,
      gameId,
      gameLink,
      gameSync,
      seats,
      error,
      errorKind,
      createRoom,
      joinRoom,
      ready,
      setWhere,
      kick,
      setMaxPlayers,
      setBots,
      transferHost,
      setSetup,
      startGame,
      introReady,
      disband,
      leaveSession,
      leaveGame,
      clearError,
    ],
  )
}
