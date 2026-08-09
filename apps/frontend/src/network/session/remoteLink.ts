import type { PlayerId } from '@release/engine'
import type { Transport } from '../transport/peer'
import type { Intent, WireMessage } from '../types'
import { type GameLink, intervalTicker, type Sync, type Ticker } from './link'
import {
  applyIntent,
  commit,
  disconnect,
  driveAbsent,
  handover,
  type Outgoing,
  rebind,
  type SessionRef,
  tick,
} from './referee'

// The peer side of the link, plus the two seams a lobby-level caller drives:
// frames arriving off the transport, and the keeper this link talks to.
export interface RemoteHandle {
  link: GameLink
  handleMessage(frame: WireMessage): void
  // Re-point the link at a new keeper after a handover. Separate from
  // `onKeeperChanged` because the announcement names a `PlayerId` and `submit`
  // addresses a peer id: only the caller holds the roster that maps one to the
  // other, so only the caller can complete the move.
  setKeeper(peerId: string): void
}

// The peer side. It holds no GameState and cannot run `reduce`, so there is no
// optimistic local application: every intent round-trips to the keeper, and the
// view that comes back is the whole truth this peer is entitled to.
export function createRemoteLink(args: {
  transport: Transport
  // A PeerJS peer id, not a PlayerId. The two identity spaces are distinct and
  // both are `string`, which is exactly what would hide a mix-up: every
  // "keeperId" on the wire (GAME_STARTED, KEEPER_CHANGED) is a PlayerId, and
  // none of them can be passed here without being resolved through the roster.
  keeperPeerId: string
  // `null` means the keeper is gone and the game cannot continue: the peer
  // should surface @release/ui's Reconnect screen and return to the lobby.
  onKeeperChanged?: (keeperId: PlayerId | null) => void
}): RemoteHandle {
  const listeners = new Set<(sync: Sync) => void>()
  let keeperPeerId = args.keeperPeerId

  return {
    link: {
      submit(intent: Intent) {
        args.transport.send(keeperPeerId, { type: 'INTENT', payload: { intent } })
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      close() {
        listeners.clear()
      },
    },
    setKeeper(peerId) {
      keeperPeerId = peerId
    },
    handleMessage(frame) {
      // Only the keeper speaks for the session, so a frame from anyone else is
      // not one of these messages however it is labelled. Without this any
      // player could forge a KEEPER_CHANGED carrying `null` — the death notice
      // — and end the game for the whole table, or forge a SYNC and replace a
      // victim's entire view with cards of the attacker's choosing. The guest
      // lobby path gates on `fromHost` for exactly this reason (useLobby.ts).
      if (frame.from !== keeperPeerId) return

      if (frame.type === 'KEEPER_CHANGED') {
        // `parseEnvelope` validates the envelope, never the payload
        // (envelope.ts), and here the missing-payload default would be the
        // most destructive reading available: `keeperId: null` ends the game.
        if (!frame.payload || !('keeperId' in frame.payload)) return
        args.onKeeperChanged?.(frame.payload.keeperId)
        return
      }
      if (frame.type !== 'SYNC') return
      // Same reason: a frame that merely claims to be a SYNC must not reach a
      // subscriber as `undefined` and take the UI down with it.
      if (!frame.payload?.view) return
      for (const listener of listeners) listener(frame.payload)
    },
  }
}

// The result of attaching a keeper to a session: message handling plus the
// membership hooks a lobby-level caller drives on connect/disconnect.
export interface KeeperHandle {
  // The keeper is a player too, and this is its seat's side of the same
  // `GameLink` seam every other seat holds. Its intents never touch the
  // transport: there is no connection to itself (PeerJS `connections.get(self)`
  // is always undefined, so a self-addressed send is silently dropped), so they
  // go straight into the referee and its own SYNCs come back the same way.
  link: GameLink
  handleMessage(frame: WireMessage): void
  peerLeft(peerId: string): void
  peerReturned(playerId: PlayerId, peerId: string): void
  // Voluntary keeper handover: hand GameState to the successor privately and
  // announce the change. The successor's side of it — adopting that state and
  // attaching its own keeper — belongs to the page/lobby wiring in #18, so
  // nothing calls this yet from production code.
  handover(toPlayerId: PlayerId): void
  close(): void
}

// The keeper side: the only party that calls into the engine.
export function attachKeeper(args: {
  ref: SessionRef
  transport: Transport
  now: () => number
  ticker?: Ticker
}): KeeperHandle {
  const ticker = args.ticker ?? intervalTicker()
  const listeners = new Set<(sync: Sync) => void>()
  // False once this handle has handed the session away or been closed. Every
  // entry point checks it: a deposed keeper that kept reducing would be a
  // second authority answering the same table — peers whose links have not been
  // re-pointed yet would have their intents applied to a state the successor
  // never sees, and the two SYNC streams would contradict each other.
  let keeping = true

  const deliver = (outgoing: Outgoing) => {
    if (outgoing.to === 'broadcast') {
      args.transport.broadcast(outgoing.message)
      return
    }
    // The keeper's own seat: its SYNC goes to its local link rather than out
    // over a connection to itself, which does not exist.
    if (outgoing.to === args.transport.id) {
      if (outgoing.message.type === 'SYNC') {
        for (const listener of listeners) listener(outgoing.message.payload)
      }
      return
    }
    args.transport.send(outgoing.to, outgoing.message)
  }

  ticker.start(() => {
    const now = args.now()
    commit(args.ref, tick(args.ref.current, now), deliver)
    commit(args.ref, driveAbsent(args.ref.current, now), deliver)
  })

  return {
    link: {
      submit(intent) {
        if (!keeping) return
        // Addressed by the keeper's own peer id, exactly as a remote seat's
        // intent is: `applyIntent` resolves the seat from it and stamps the
        // player, so the keeper gets no privilege from being the keeper.
        commit(
          args.ref,
          applyIntent(args.ref.current, args.transport.id, intent, args.now()),
          deliver,
        )
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      close() {
        listeners.clear()
      },
    },
    handleMessage(frame) {
      if (!keeping) return
      if (frame.type !== 'INTENT') return
      // The payload is unvalidated JSON (`parseEnvelope` checks type/from/seq
      // and nothing else), so `payload` itself may be missing; `applyIntent`
      // takes it from here as `unknown` and checks the rest.
      commit(
        args.ref,
        applyIntent(args.ref.current, frame.from, frame.payload?.intent, args.now()),
        deliver,
      )
    },
    peerLeft(peerId) {
      if (!keeping) return
      commit(args.ref, disconnect(args.ref.current, peerId, args.now()), deliver)
    },
    peerReturned(playerId, peerId) {
      if (!keeping) return
      commit(args.ref, rebind(args.ref.current, playerId, peerId), deliver)
    },
    handover(toPlayerId) {
      if (!keeping) return
      const result = handover(args.ref.current, toPlayerId)
      if (result.session === args.ref.current) return
      commit(args.ref, result, deliver)
      // The session it holds is no longer the one being played: from here the
      // successor reduces, so this keeper stops stamping clocks onto a state
      // nobody will receive and stops answering the intents still in flight
      // towards it.
      keeping = false
      ticker.stop()
    },
    close() {
      keeping = false
      ticker.stop()
      listeners.clear()
    },
  }
}
