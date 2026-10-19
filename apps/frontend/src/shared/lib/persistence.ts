import { type Event, parseEventLog } from '@release/engine'

// What survives a reload. Five records, all under a `release:` prefix.
//
// Plain functions rather than a store: the keeper snapshot is written from
// `referee.ts`, which is a pure module with no React in it — and keeping it
// that way is what lets the playground and every headless test exercise the
// same code the network does (network/session/link.ts).

import { read, readJson, remove, write } from './storage'
import { RESTORE_TTL_MS } from './sessionPersistence'
export { clearSession, getResumeToken, readSession, RESTORE_TTL_MS, writeSession } from './sessionPersistence'
export type { StoredSession, StoredLobbyConfig } from './sessionPersistence'

const KEEPER_KEY = 'release:keeper'
const LOG_KEY = 'release:log'
const CHAT_KEY = 'release:chat'

// The chat journal remains untrusted here. Storage owns only room scoping and
// expiry; the chat boundary validates entries, sequences, and member mappings.
export interface StoredChat {
  roomCode: string
  entries: unknown[]
  nextSequence: number
  members: Array<{ clientId: string; memberId: string }>
  savedAt: number
}

export function readChat(roomCode: string, now: number = Date.now()): StoredChat | null {
  const stored = readJson<StoredChat>(CHAT_KEY)
  if (!stored) return null
  if (
    typeof stored.savedAt !== 'number' ||
    !Number.isFinite(stored.savedAt) ||
    stored.roomCode !== roomCode ||
    now - stored.savedAt > RESTORE_TTL_MS
  ) {
    remove(CHAT_KEY)
    return null
  }
  return stored
}

export function writeChat(chat: StoredChat): void {
  write(CHAT_KEY, JSON.stringify(chat))
}

export function clearChat(): void {
  remove(CHAT_KEY)
}

// `state` and `seats` are held as `unknown` on purpose: importing GameState
// here would tie a storage module to the engine's shape, and the only caller
// that reads them (the host restore) casts once, where the engine types are
// already in scope.


export interface StoredKeeper {
  presentation?: unknown
  gameId: string
  keeperId: string
  state: unknown
  seats: unknown
  privateSeats: unknown
  log: unknown[]
  savedAt: number
  lobbyConfig?: StoredLobbyConfig
}

export function readKeeper(now: number = Date.now()): StoredKeeper | null {
  const stored = readJson<StoredKeeper>(KEEPER_KEY)
  if (!stored) return null
  if (now - stored.savedAt > RESTORE_TTL_MS) {
    remove(KEEPER_KEY)
    return null
  }
  return stored
}

export function writeKeeper(k: StoredKeeper): void {
  write(KEEPER_KEY, JSON.stringify(k))
}

export function clearKeeper(): void {
  remove(KEEPER_KEY)
}

// The fourth record: this peer's own move feed. Held as `unknown[]` for the
// same reason `StoredKeeper.state` is held as `unknown` — storage does not
// import engine types, and the single caller casts where they are in scope.
//
// It carries its own `gameId` because a feed outliving its match is worse than
// no feed: seat ids repeat between games, so a stale `dealt` would be taken for
// this game's deal.
export interface StoredLog {
  gameId: string
  events: unknown[]
  savedAt: number
}

export function readLog(gameId: string, now: number = Date.now()): Event[] | null {
  const stored = readJson<StoredLog>(LOG_KEY)
  if (!stored) return null
  if (stored.gameId !== gameId) return null
  if (now - stored.savedAt > RESTORE_TTL_MS) {
    remove(LOG_KEY)
    return null
  }
  const events = parseEventLog(stored.events)
  if (!events) {
    remove(LOG_KEY)
    return null
  }
  return events
}

export function writeLog(l: StoredLog): void {
  write(LOG_KEY, JSON.stringify(l))
}

export function clearLog(): void {
  remove(LOG_KEY)
}
