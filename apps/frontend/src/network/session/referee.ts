import type { Action, DeckEntry, Engine, Event, GameState, PlayerId, Setup } from '@release/engine'
import type { Intent, Message } from '../types'
import { forViewer, rejectionsIn } from './audience'

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

export function seatOfPeer(session: Session, peerId: string): Seat | undefined {
  return session.seats.find((s) => s.peerId === peerId)
}

// The keeper's answer to one peer's intent.
//
// Identity and time are both overwritten rather than validated: `player` comes
// from the connection the frame arrived on, so a peer cannot act as another
// seat, and `at` comes from the keeper's own clock, so a peer cannot claim a
// deadline has passed. There is consequently no clock synchronisation between
// peers to get wrong.
export function applyIntent(
  session: Session,
  fromPeerId: string,
  intent: Intent,
  now: number,
): SessionResult {
  const seat = seatOfPeer(session, fromPeerId)
  if (!seat) return { session, outgoing: [] }

  const action = { ...intent, player: seat.playerId, at: now } as Action
  const { state, events } = session.engine.reduce(session.state, action)

  // Referential, not structural: `reduce` hands back the identical object when
  // it refuses an action, which is exactly what "nothing happened" means here.
  // The event ids of consecutive rejections repeat, so they cannot be compared.
  if (state === session.state) {
    const message: Message = {
      type: 'SYNC',
      payload: {
        view: session.engine.project(session.state, seat.playerId),
        events: rejectionsIn(events),
      },
    }
    return { session, outgoing: [{ to: fromPeerId, message }] }
  }

  const next: Session = { ...session, state }
  return { session: next, outgoing: syncAll(next, events) }
}
