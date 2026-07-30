import type { DeckEntry, Engine, Event, GameState, PlayerId, Setup } from '@release/engine'
import type { Message } from '../types'
import { forViewer } from './audience'

export interface Seat {
  playerId: PlayerId
  // null while the seat is disconnected. The seat itself survives, which is
  // why PlayerId is a persisted client id rather than a PeerJS peer id.
  peerId: string | null
  absentSince: number | null
}

export interface Session {
  gameId: string
  keeperId: PlayerId
  engine: Engine
  state: GameState
  seats: Seat[]
}

// The session is immutable and every entry point returns a new one, so the
// transport shells hold this cell rather than a Session directly.
export interface SessionRef {
  current: Session
}

// Same shape as lobby/host.ts's Outgoing: `to` is a peer id, or 'broadcast'.
export interface Outgoing {
  to: string | 'broadcast'
  message: Message
}

export interface SessionResult {
  session: Session
  outgoing: Outgoing[]
}

export function syncMessage(session: Session, playerId: PlayerId, events: Event[]): Message {
  return {
    type: 'SYNC',
    payload: {
      view: session.engine.project(session.state, playerId),
      events: forViewer(events, playerId),
    },
  }
}

// One private SYNC per connected seat. A disconnected seat is skipped rather
// than queued: its state is not a fold over deltas, so reconnecting only ever
// needs one fresh projection.
export function syncAll(session: Session, events: Event[]): Outgoing[] {
  return session.seats
    .filter((s): s is Seat & { peerId: string } => s.peerId !== null)
    .map((s) => ({ to: s.peerId, message: syncMessage(session, s.playerId, events) }))
}

export function createSession(args: {
  gameId: string
  keeperId: PlayerId
  engine: Engine
  seed: number
  players: { playerId: PlayerId; peerId: string | null; name: string }[]
  setup: Setup
  deck: DeckEntry[]
  events: DeckEntry[]
}): SessionResult {
  const state = args.engine.createGame({
    gameId: args.gameId,
    seed: args.seed,
    players: args.players.map((p) => ({ id: p.playerId, name: p.name })),
    setup: args.setup,
    deck: args.deck,
    events: args.events,
  })

  const session: Session = {
    gameId: args.gameId,
    keeperId: args.keeperId,
    engine: args.engine,
    state,
    seats: args.players.map((p) => ({
      playerId: p.playerId,
      peerId: p.peerId,
      absentSince: null,
    })),
  }

  return {
    session,
    outgoing: [
      {
        to: 'broadcast',
        message: {
          type: 'GAME_STARTED',
          payload: { gameId: args.gameId, keeperId: args.keeperId },
        },
      },
      ...syncAll(session, []),
    ],
  }
}

export function commit(
  ref: SessionRef,
  result: SessionResult,
  deliver: (outgoing: Outgoing) => void,
): void {
  ref.current = result.session
  for (const outgoing of result.outgoing) deliver(outgoing)
}
