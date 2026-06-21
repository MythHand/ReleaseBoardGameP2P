import { randomBytes, randomUUID } from 'node:crypto'

export interface Session {
  id: string
  code: string
  createdAt: number
  peers: string[]
}

const sessions = new Map<string, Session>()
const byCode = new Map<string, string>()

const makeCode = (): string => randomBytes(4).toString('hex').toUpperCase().slice(0, 8)

export function createSession(): Session {
  const session: Session = { id: randomUUID(), code: makeCode(), createdAt: Date.now(), peers: [] }
  sessions.set(session.id, session)
  byCode.set(session.code, session.id)
  return session
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id)
}

export function joinSession(code: string): { session: Session; peerId: string } | null {
  const id = byCode.get(code)
  if (!id) return null
  const session = sessions.get(id)
  if (!session) return null
  const peerId = randomUUID()
  session.peers.push(peerId)
  return { session, peerId }
}
