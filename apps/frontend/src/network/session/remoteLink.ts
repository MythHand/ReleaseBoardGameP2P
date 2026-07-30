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

// The peer side. It holds no GameState and cannot run `reduce`, so there is no
// optimistic local application: every intent round-trips to the keeper, and the
// view that comes back is the whole truth this peer is entitled to.
export function createRemoteLink(args: {
  transport: Transport
  keeperId: string
  // `null` means the keeper is gone and the game cannot continue: the peer
  // should surface @release/ui's Reconnect screen and return to the lobby.
  onKeeperChanged?: (keeperId: PlayerId | null) => void
}): {
  link: GameLink
  handleMessage(frame: WireMessage): void
} {
  const listeners = new Set<(sync: Sync) => void>()

  return {
    link: {
      submit(intent: Intent) {
        args.transport.send(args.keeperId, { type: 'INTENT', payload: { intent } })
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
      if (frame.type === 'KEEPER_CHANGED') {
        args.onKeeperChanged?.(frame.payload.keeperId)
        return
      }
      if (frame.type !== 'SYNC') return
      for (const listener of listeners) listener(frame.payload)
    },
  }
}

// The result of attaching a keeper to a session: message handling plus the
// membership hooks a lobby-level caller drives on connect/disconnect.
export interface KeeperHandle {
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
  onLocalSync?: (sync: Sync) => void
}): KeeperHandle {
  const ticker = args.ticker ?? intervalTicker()
  const deliver = (outgoing: Outgoing) => {
    if (outgoing.to === 'broadcast') {
      args.transport.broadcast(outgoing.message)
      return
    }
    // The keeper is a player too: its own SYNC goes to its local link rather
    // than out over a connection to itself.
    if (outgoing.to === args.transport.id) {
      if (outgoing.message.type === 'SYNC') args.onLocalSync?.(outgoing.message.payload)
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
    handleMessage(frame) {
      if (frame.type !== 'INTENT') return
      commit(
        args.ref,
        applyIntent(args.ref.current, frame.from, frame.payload.intent, args.now()),
        deliver,
      )
    },
    peerLeft(peerId) {
      commit(args.ref, disconnect(args.ref.current, peerId, args.now()), deliver)
    },
    peerReturned(playerId, peerId) {
      commit(args.ref, rebind(args.ref.current, playerId, peerId), deliver)
    },
    handover(toPlayerId) {
      const result = handover(args.ref.current, toPlayerId)
      if (result.session === args.ref.current) return
      commit(args.ref, result, deliver)
      // The session it holds is no longer the one being played: from here the
      // successor reduces, so this keeper's ticker must stop stamping clocks
      // onto a state nobody will receive.
      ticker.stop()
    },
    close() {
      ticker.stop()
    },
  }
}
