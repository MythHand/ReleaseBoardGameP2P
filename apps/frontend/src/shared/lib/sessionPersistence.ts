import { readJson, remove, write } from './storage'

const RESUME_CREDENTIAL_KEY = 'release:resumeCredential'
const LEGACY_RESUME_TOKEN_KEY = 'release:resumeToken'
const SESSION_KEY = 'release:session'
export const RESTORE_TTL_MS = 12 * 60 * 60 * 1000

interface StoredResumeCredential {
  roomCode: string
  token: string
}

export function getResumeToken(roomCode: string): string {
  const existing = readJson<StoredResumeCredential>(RESUME_CREDENTIAL_KEY)
  if (existing?.roomCode === roomCode && existing.token) return existing.token
  const minted = crypto.randomUUID()
  write(RESUME_CREDENTIAL_KEY, JSON.stringify({ roomCode, token: minted }))
  remove(LEGACY_RESUME_TOKEN_KEY)
  return minted
}

function clearResumeCredential(): void {
  remove(RESUME_CREDENTIAL_KEY)
  remove(LEGACY_RESUME_TOKEN_KEY)
}

export interface StoredSession {
  roomCode: string
  name: string
  role: 'host' | 'guest'
  participantRole?: 'player' | 'spectator'
  where?: 'lobby' | 'game' | 'stats'
  gameId: string | null
  // Retained when returning to the lobby so a reload cannot reuse a match id.
  lastGameId?: string
  joinedAt: number
  lobbyConfig?: StoredLobbyConfig
}

export function readSession(now: number = Date.now()): StoredSession | null {
  const stored = readJson<StoredSession>(SESSION_KEY)
  if (!stored) {
    clearResumeCredential()
    return null
  }
  if (now - stored.joinedAt > RESTORE_TTL_MS) {
    clearSession()
    return null
  }
  return stored
}

export function writeSession(s: StoredSession): void {
  write(SESSION_KEY, JSON.stringify(s))
}

export function clearSession(): void {
  remove(SESSION_KEY)
  clearResumeCredential()
}

export interface StoredLobbyConfig {
  maxSpectators?: number
  maxPlayers: number
  setup: unknown
  bots?: number
}
