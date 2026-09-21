import {
  type Engine,
  type Event,
  type GameState,
  type PlayerId,
  parseEventLog,
} from '@release/engine'
import type { PrivateSeat } from '~/entities/game/seats'
import { type StoredKeeper, type StoredLobbyConfig, writeKeeper } from '~/shared/lib/persistence'
import { MAX_BOTS } from '../lobby/host'
import type { LobbyState } from '../lobby/state'
import type { Seat, Setup } from '../types'
import type { Seat as RefereeSeat, Session } from './referee'

export const KEEPER_SAVE_MS = 250

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
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
    if (!isNonEmptyString(playerId) || !isNonEmptyString(peerId) || !isNonEmptyString(name)) {
      return null
    }
    if (playerIds.has(playerId) || peerIds.has(peerId)) return null
    if (typeof resumeToken === 'string' && resumeTokens.has(resumeToken)) return null
    playerIds.add(playerId)
    peerIds.add(peerId)
    if (typeof resumeToken === 'string') resumeTokens.add(resumeToken)
    const normalizedSeat: Seat = { playerId, peerId, name }
    if (bot) normalizedSeat.bot = true
    privateSeats.push({
      seat: normalizedSeat,
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
    if (
      absentSince !== null &&
      (typeof absentSince !== 'number' || !Number.isFinite(absentSince))
    ) {
      return null
    }
    if (bot) {
      if (peerId !== null || absentSince !== null) return null
    } else if ((peerId === null) !== (typeof absentSince === 'number')) {
      return null
    }
    if (playerIds.has(playerId) || (typeof peerId === 'string' && peerIds.has(peerId))) return null
    playerIds.add(playerId)
    if (typeof peerId === 'string') peerIds.add(peerId)
    const normalizedSeat: RefereeSeat = { playerId, peerId, absentSince }
    if (bot) normalizedSeat.bot = true
    seats.push(normalizedSeat)
  }
  return seats
}

export interface NormalizedLobbyConfig {
  maxPlayers: number
  setup: Setup
  bots: number
}

export function normalizeLobbyConfig(value: unknown): NormalizedLobbyConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const { maxPlayers, setup, bots } = value as {
    maxPlayers?: unknown
    setup?: unknown
    bots?: unknown
  }
  if (
    typeof maxPlayers !== 'number' ||
    !Number.isInteger(maxPlayers) ||
    maxPlayers < 2 ||
    maxPlayers > 6
  ) {
    return null
  }
  if (
    bots !== undefined &&
    (typeof bots !== 'number' || !Number.isInteger(bots) || bots < 0 || bots > MAX_BOTS)
  ) {
    return null
  }
  if (typeof setup !== 'object' || setup === null || Array.isArray(setup)) return null
  const entries = Object.entries(setup)
  if (!entries.every(([, option]) => typeof option === 'string')) return null
  return { maxPlayers, setup: Object.fromEntries(entries), bots: bots ?? 0 }
}

export interface NormalizedKeeperSnapshot {
  gameId: string
  keeperId: PlayerId
  state: GameState
  seats: RefereeSeat[]
  privateSeats: PrivateSeat[]
  log: Event[]
  lobbyConfig?: NormalizedLobbyConfig
}

export function normalizeKeeperSnapshot(
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

  const normalized: NormalizedKeeperSnapshot = {
    gameId: snapshot.gameId,
    keeperId: snapshot.keeperId,
    state: snapshot.state as GameState,
    seats,
    privateSeats,
    log,
  }
  if (lobbyConfig) normalized.lobbyConfig = lobbyConfig
  return normalized
}

export function matchSeqAfterRestore(gameId: string, fallback: number = Date.now()): number {
  const suffix = gameId.slice(gameId.lastIndexOf('-') + 1)
  const parsed = Number(suffix)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback
}

export interface KeeperWriter {
  queue(session: Session, privateSeats: PrivateSeat[], lobby: LobbyState | null): void
  cancel(): void
}

interface KeeperWriterOptions {
  delayMs?: number
  now?: () => number
  write?: (snapshot: StoredKeeper) => void
}

export function createKeeperWriter(options: KeeperWriterOptions = {}): KeeperWriter {
  const delayMs = options.delayMs ?? KEEPER_SAVE_MS
  const now = options.now ?? Date.now
  const write = options.write ?? writeKeeper
  let lastQueued: Session | null = null
  let pending: StoredKeeper | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    queue(session, privateSeats, lobby) {
      if (session === lastQueued) return
      lastQueued = session
      pending = {
        gameId: session.gameId,
        keeperId: session.keeperId,
        state: session.state,
        seats: session.seats,
        privateSeats,
        log: session.log,
        savedAt: now(),
      }
      if (lobby) {
        const lobbyConfig: StoredLobbyConfig = {
          maxPlayers: lobby.maxPlayers,
          setup: lobby.setup,
          bots: lobby.bots,
        }
        pending.lobbyConfig = lobbyConfig
      }
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        const snapshot = pending
        pending = null
        if (snapshot) write(snapshot)
      }, delayMs)
    },

    cancel() {
      if (timer !== null) clearTimeout(timer)
      timer = null
      pending = null
      lastQueued = null
    },
  }
}
