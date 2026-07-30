import type { Action, DeckEntry, Engine, Event, GameState, PlayerId, Setup } from '@release/engine'
import { botAction } from '@release/engine/fake'
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

// How long a seat may stay silent before the keeper starts playing it. Matches
// the attack-window timeout the 2026-06-22 networking spec already chose.
export const ABSENT_GRACE_MS = 30_000

export function disconnect(session: Session, peerId: string, now: number): SessionResult {
  const seat = seatOfPeer(session, peerId)
  if (!seat) return { session, outgoing: [] }

  // The seat survives its connection: hand, pending and turn all live in
  // GameState, which never left the keeper.
  const seats = session.seats.map((s) =>
    s.peerId === peerId ? { ...s, peerId: null, absentSince: now } : s,
  )
  return { session: { ...session, seats }, outgoing: [] }
}

export function rebind(session: Session, playerId: PlayerId, peerId: string): SessionResult {
  if (!session.seats.some((s) => s.playerId === playerId)) return { session, outgoing: [] }

  const seats = session.seats.map((s) =>
    s.playerId === playerId ? { ...s, peerId, absentSince: null } : s,
  )
  const next: Session = { ...session, seats }
  // Catch-up is one projection, not a replay: a peer's state was never a fold
  // over deltas it might have missed.
  return { session: next, outgoing: [{ to: peerId, message: syncMessage(next, playerId, []) }] }
}

// The engine has no concept of a player who left, so a pending owed by one
// would stall the game permanently. Past the grace period the keeper plays that
// seat with the engine's own opponent policy.
//
// This is deliberately not `runUntilIdle`: that helper auto-resolves pendings
// owed by the *human* and must never front a live UI, because it would silently
// answer the reaction window for someone sitting right there. Here the seat is
// empty, so there is no decision to take away.
export function driveAbsent(session: Session, now: number): SessionResult {
  const expired = session.seats.filter(
    (s) => s.peerId === null && s.absentSince !== null && now - s.absentSince >= ABSENT_GRACE_MS,
  )

  // Scan every expired-absent seat rather than picking the first: an absent
  // seat that currently owes nothing (not its turn, nothing pending on it)
  // must not shadow a later seat that does — with two or more seats gone,
  // the one the game is actually waiting on need not be seated first.
  for (const seat of expired) {
    const action = botAction(session.engine, session.state, seat.playerId, now)
    if (!action) continue

    const { state, events } = session.engine.reduce(session.state, action)
    if (state !== session.state) {
      const next: Session = { ...session, state }
      return { session: next, outgoing: syncAll(next, events) }
    }

    // botAction's suggestion was rejected outright — `project`'s `playable`
    // can list a card the seat cannot actually afford (e.g. a release with
    // no spare card to pay its cost), and the bot policy never looks past
    // its first choice. An absent seat still owes the table forward
    // progress, so on its own uninterrupted turn fall back to the same
    // escape hatch a human out of moves would take: draw if it hasn't, or
    // end the turn if it has. Anything still rejected means there is truly
    // nothing to do, and the next expired seat gets a turn instead.
    const { turn, pending, window, over } = session.state
    if (turn.player === seat.playerId && !pending && !window && !over) {
      const fallback: Action = turn.hasDrawn
        ? { type: 'PUSH', player: seat.playerId, at: now }
        : { type: 'DRAW', player: seat.playerId, at: now }
      const retried = session.engine.reduce(session.state, fallback)
      if (retried.state !== session.state) {
        const next: Session = { ...session, state: retried.state }
        return { session: next, outgoing: syncAll(next, retried.events) }
      }
    }
  }

  return { session, outgoing: [] }
}

// The action types a peer is allowed to ask for. `Intent` already excludes
// WINDOW_EXPIRED, but only in TypeScript: what arrives here is parsed JSON from
// a connection, and `parseEnvelope` validates the envelope, never the payload.
// Without this check a peer could fire the keeper's own deadline action early
// and close a reaction window out from under a pending defence, which
// `onDefend` (packages/engine/src/fake/attacks.ts) then rejects forever.
const PEER_INTENT_TYPES: ReadonlySet<string> = new Set<Action['type']>([
  'DRAW',
  'PLAY',
  'PUSH',
  'ATTACK',
  'PASS',
  'UNPASS',
  'RESOLVE',
])

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

  // Dropped in silence rather than answered with a rejection: a well-behaved
  // peer cannot produce this, so there is no UI to inform.
  if (!PEER_INTENT_TYPES.has((intent as { type?: unknown }).type as string)) {
    return { session, outgoing: [] }
  }

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

// Voluntary only. A keeper that crashes takes GameState and the seed with it,
// and the game ends — peers cannot reconstruct it, because reconstructing it
// means holding the seed, which is the deck order.
export function handover(session: Session, toPlayerId: PlayerId): SessionResult {
  const successor = session.seats.find((s) => s.playerId === toPlayerId)
  if (!successor?.peerId) return { session, outgoing: [] }

  const next: Session = { ...session, keeperId: toPlayerId }
  return {
    session: next,
    outgoing: [
      {
        to: successor.peerId,
        message: { type: 'KEEPER_STATE', payload: { state: session.state } },
      },
      { to: 'broadcast', message: { type: 'KEEPER_CHANGED', payload: { keeperId: toPlayerId } } },
    ],
  }
}

// The successor's side of a handover: it now holds the state it was given.
export function adoptSession(args: {
  state: GameState
  gameId: string
  keeperId: PlayerId
  engine: Engine
  seats: Seat[]
}): Session {
  return {
    gameId: args.gameId,
    keeperId: args.keeperId,
    engine: args.engine,
    state: args.state,
    seats: args.seats,
  }
}

// The keeper owns every clock in the session. `WINDOW_EXPIRED` carries no player
// identity and the engine rejects it before the deadline regardless of sender,
// so there is no owner rule to encode — the keeper simply fires it, and peers
// never send it at all (Intent excludes it).
export function tick(session: Session, now: number): SessionResult {
  const window = session.state.window
  const pending = session.state.pending
  // An attack thrown into an open window sets a `defend` pending but leaves
  // `state.window` untouched (onAttack, packages/engine/src/fake/attacks.ts),
  // so the two can coexist with the defend deadline at or after the window's.
  // Every other window action already rejects while a decision is pending, so
  // the keeper's own timeout must defer the same way: expiring the window out
  // from under a pending defend would null `state.window`, and the
  // release-scope defend resolution (onDefend, attacks.ts) requires a window
  // to still exist — permanently stalling that pending. Resolving the pending
  // first (below) closes the window itself where that is the correct outcome.
  if (window && !pending && now >= window.deadline) {
    const { state, events } = session.engine.reduce(session.state, {
      type: 'WINDOW_EXPIRED',
      at: now,
    })
    if (state === session.state) return { session, outgoing: [] }
    const next: Session = { ...session, state }
    return { session: next, outgoing: syncAll(next, events) }
  }

  // A stalled defence blocks every other player, which is why the engine gives
  // it a deadline — but it gives no expiry action, so the keeper answers with
  // the passive default on the owing player's behalf.
  if (pending?.kind === 'defend' && now >= pending.deadline) {
    const seat = session.seats.find((s) => s.playerId === pending.player)
    // A disconnected owing seat has nobody to resolve on: the stalled defence
    // simply waits for that seat to reconnect rather than being force-resolved.
    if (!seat?.peerId) return { session, outgoing: [] }
    return applyIntent(
      session,
      seat.peerId,
      { type: 'RESOLVE', choice: { kind: 'defend', card: null } },
      now,
    )
  }

  return { session, outgoing: [] }
}
