// What survives a reload. Three records, all under a `release:` prefix.
//
// Plain functions rather than a store: the keeper snapshot is written from
// `referee.ts`, which is a pure module with no React in it — and keeping it
// that way is what lets solo play, the playground and every headless test
// exercise the same code the network does (network/session/link.ts).

const CLIENT_KEY = 'release:clientId'
const SESSION_KEY = 'release:session'
const KEEPER_KEY = 'release:keeper'

// How long a stored record stays restorable. Long enough to cover a reload, a
// crash, a closed lid and picking a game back up the same evening; short
// enough that a match everyone else abandoned is not offered as resumable.
export const RESTORE_TTL_MS = 12 * 60 * 60 * 1000

// Safari private mode and some embedded webviews throw on both getItem and
// setItem. A browser without storage then behaves exactly as the app did
// before any of this existed — it simply cannot restore — rather than
// crashing on mount.
const memory = new Map<string, string>()

function read(key: string): string | null {
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) return stored
  } catch {
    // fall through to memory
  }
  return memory.get(key) ?? null
}

function write(key: string, value: string): void {
  memory.set(key, value)
  try {
    localStorage.setItem(key, value)
  } catch {
    // memory already holds it
  }
}

function remove(key: string): void {
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    // memory is already clear
  }
}

function readJson<T>(key: string): T | null {
  const raw = read(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    // A record we cannot parse is a record we cannot trust. Drop it rather
    // than leave it to fail the same way on every future load.
    remove(key)
    return null
  }
}

// Deliberately NOT cleared by leaving a room: this is the thing that outlives
// the tab, and a player returning to the same room should be recognised.
export function getClientId(): string {
  const existing = read(CLIENT_KEY)
  if (existing) return existing
  const minted = crypto.randomUUID()
  write(CLIENT_KEY, minted)
  return minted
}

export interface StoredSession {
  roomCode: string
  name: string
  role: 'host' | 'guest'
  gameId: string | null
  joinedAt: number
}

export function readSession(now: number = Date.now()): StoredSession | null {
  const stored = readJson<StoredSession>(SESSION_KEY)
  if (!stored) return null
  if (now - stored.joinedAt > RESTORE_TTL_MS) {
    remove(SESSION_KEY)
    return null
  }
  return stored
}

export function writeSession(s: StoredSession): void {
  write(SESSION_KEY, JSON.stringify(s))
}

export function clearSession(): void {
  remove(SESSION_KEY)
}

// `state` and `seats` are held as `unknown` on purpose: importing GameState
// here would tie a storage module to the engine's shape, and the only caller
// that reads them (the host restore) casts once, where the engine types are
// already in scope.
export interface StoredKeeper {
  gameId: string
  keeperId: string
  state: unknown
  // The referee's own seats: `{ playerId, peerId, absentSince }`.
  seats: unknown
  // The lobby's seating: `{ playerId, peerId, clientId, name }`. Held
  // separately because the referee never carries `clientId` or `name`, and a
  // restore needs both — one to recognise a returning player, one to label a
  // seat whose peer is gone. Reconstructing them from the referee's seats is
  // not possible; they were never there.
  lobbySeats: unknown
  savedAt: number
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
