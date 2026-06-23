import { useCallback, useMemo, useRef, useState } from 'react'
import {
  canStart as canStartFn,
  handleJoinRequest,
  handleReady,
  kick as kickFn,
  type Outgoing,
  setMaxPlayers as setMaxPlayersFn,
  transferHost as transferHostFn,
} from './lobby/host'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  applyPeerList,
  createLobbyState,
  type LobbyState,
} from './lobby/state'
import { relayTargets } from './session/relay'
import { createTransport, type Transport } from './transport/peer'
import type { PeerInfo, WireMessage } from './types'

// Room codes double as the host's PeerJS id, so the displayed code is exactly
// what a joiner connects to — formatRoomCode/parseRoomCode are inverses.
// Ambiguous characters (0/o/1/l/i) are omitted from the alphabet.
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function makeRoomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('')
}

export function formatRoomCode(peerId: string): string {
  const head = peerId.slice(0, 6).toUpperCase()
  return head.length > 3 ? `${head.slice(0, 3)}-${head.slice(3)}` : head
}

// Inverse of formatRoomCode: strip the separator/whitespace and lowercase back
// to the host peer id a joiner can connect to.
export function parseRoomCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'error'

export interface UseLobby {
  state: LobbyState | null
  status: LobbyStatus
  roomCode: string | null
  isHost: boolean
  canStart: boolean
  error: string | null
  createRoom(name: string, maxPlayers: number): Promise<void>
  joinRoom(code: string, name: string): Promise<void>
  ready(): void
  kick(peerId: string): void
  setMaxPlayers(n: number): void
  transferHost(id: string): void
  leaveSession(): void
  clearError(): void
}

export function useLobby(): UseLobby {
  const [state, setState] = useState<LobbyState | null>(null)
  const [status, setStatus] = useState<LobbyStatus>('idle')
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const transportRef = useRef<Transport | null>(null)
  const stateRef = useRef<LobbyState | null>(null)
  const isHostRef = useRef(false)

  const onError = useCallback((err: { type?: string; message: string }) => {
    // A connection-level error after the lobby is up shouldn't tear down the
    // whole session, but signaling/peer errors (peer-unavailable, network,
    // disconnected) mean the session can't proceed — surface them.
    setError(err.type ? `${err.type}: ${err.message}` : err.message)
    if (err.type !== 'connection') setStatus('error')
  }, [])

  const commit = useCallback((next: LobbyState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const dispatch = useCallback((outgoing: Outgoing[]) => {
    const t = transportRef.current
    if (!t) return
    for (const o of outgoing) {
      if (o.to === 'broadcast') t.broadcast(o.message)
      else t.send(o.to, o.message)
    }
  }, [])

  // A peer (or the host) dropping its DataChannel must update the roster, or the
  // lobby keeps counting a ghost player toward canStart()/turn rotation.
  const onDisconnect = useCallback(
    (peerId: string) => {
      const current = stateRef.current
      if (!current) return
      if (isHostRef.current) {
        // Host owns the roster: prune the peer and tell everyone else.
        if (!current.peers[peerId]) return
        commit(applyPeerLeft(current, peerId))
        dispatch([{ to: 'broadcast', message: { type: 'PLAYER_KICKED', payload: { peerId } } }])
      } else if (peerId === current.hostId) {
        // The host vanished — the guest can't proceed without it.
        setError('disconnected: host left the lobby')
        setStatus('error')
      } else {
        commit(applyPeerLeft(current, peerId))
      }
    },
    [commit, dispatch],
  )

  const onMessage = useCallback(
    (msg: WireMessage) => {
      const current = stateRef.current
      if (!current) return
      if (isHostRef.current) {
        if (msg.type === 'JOIN_REQUEST') {
          const r = handleJoinRequest(current, msg.from, msg.payload.name)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'PLAYER_READY') {
          const r = handleReady(current, msg.from)
          commit(r.state)
          dispatch(r.outgoing)
        } else {
          // Star topology: the host forwards any other peer-originated message
          // to every other connected peer (never back to the sender or itself),
          // preserving the original sender via relay() rather than re-stamping.
          const t = transportRef.current
          if (!t) return
          const targets = relayTargets({
            connectedPeerIds: t.connectedIds(),
            hostId: current.hostId,
            from: msg.from,
          })
          t.relay(targets, msg)
        }
        return
      }
      // Guest-side application of host broadcasts. Only the host is authoritative
      // for the roster, so ignore PEER_LIST/PEER_JOINED that don't come from it.
      const fromHost = msg.from === current.hostId
      switch (msg.type) {
        case 'PEER_LIST':
          if (fromHost) commit(applyPeerList(current, msg.payload.peers))
          break
        case 'PEER_JOINED': {
          if (!fromHost) break
          const peer: PeerInfo = { ...msg.payload }
          commit(applyPeerJoined(current, peer))
          break
        }
        case 'LOBBY_CONFIG_UPDATED':
          if (fromHost) commit(applyConfig(current, msg.payload.maxPlayers))
          break
        case 'PLAYER_KICKED':
          if (!fromHost) break
          if (msg.payload.peerId === current.selfId) setStatus('kicked')
          else commit(applyPeerLeft(current, msg.payload.peerId))
          break
        default:
          break
      }
    },
    [commit, dispatch],
  )

  const createRoom = useCallback(
    async (name: string, maxPlayers: number) => {
      setStatus('connecting')
      setError(null)
      // The host's peer id IS the room code, so the displayed code is exactly
      // what a joiner connects to — formatRoomCode/parseRoomCode round-trip it.
      const t = await createTransport({ peerId: makeRoomCode(), onMessage, onError, onDisconnect })
      transportRef.current = t
      isHostRef.current = true
      setIsHost(true)
      setRoomCode(formatRoomCode(t.id))
      const initial = createLobbyState({
        selfId: t.id,
        hostId: t.id,
        maxPlayers,
        peers: [{ id: t.id, name, role: 'host', ready: true }],
      })
      commit(initial)
      setStatus('in-lobby')
    },
    [onMessage, onError, onDisconnect, commit],
  )

  const joinRoom = useCallback(
    async (code: string, name: string) => {
      setStatus('connecting')
      setError(null)
      const hostId = parseRoomCode(code)
      const t = await createTransport({
        onMessage,
        onError,
        onDisconnect,
        onConnection: (peerId) => {
          // Send JOIN_REQUEST exactly when the host DataChannel opens — a
          // setTimeout(0) is not sufficient over real WebRTC because the channel
          // may not be open after a single macrotask. Only now is the join
          // confirmed, so flip to 'in-lobby' here rather than optimistically:
          // a bad/expired code never opens and surfaces as a PeerJS error.
          if (peerId === hostId) {
            transportRef.current?.send(hostId, { type: 'JOIN_REQUEST', payload: { name } })
            setStatus('in-lobby')
          }
        },
      })
      transportRef.current = t
      isHostRef.current = false
      setIsHost(false)
      setRoomCode(formatRoomCode(hostId))
      commit(
        createLobbyState({
          selfId: t.id,
          hostId,
          maxPlayers: 6,
          peers: [{ id: t.id, name, role: 'guest', ready: false }],
        }),
      )
      t.connectTo(hostId)
    },
    [onMessage, onError, onDisconnect, commit],
  )

  const ready = useCallback(() => {
    const t = transportRef.current
    const current = stateRef.current
    if (!t || !current) return
    if (isHostRef.current) {
      const r = handleReady(current, current.selfId)
      commit(r.state)
      dispatch(r.outgoing)
    } else {
      t.send(current.hostId, { type: 'PLAYER_READY', payload: {} })
    }
  }, [commit, dispatch])

  const kick = useCallback(
    (peerId: string) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = kickFn(current, peerId)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )

  const setMaxPlayers = useCallback(
    (n: number) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = setMaxPlayersFn(current, n)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )

  // NOTE: transferHost currently only broadcasts the intent (TRANSFER_HOST).
  // The actual host handoff — reconnecting peers to the new host, re-broadcasting
  // the last TURN_RESOLVED state, and sending HOST_TRANSFERRED confirmation — is
  // intentionally not implemented yet. It depends on the game-engine spec and the
  // open deck-keeper decision, both deferred to a later milestone.
  const transferHost = useCallback(
    (id: string) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = transferHostFn(current, id)
      dispatch(r.outgoing)
    },
    [dispatch],
  )

  // Tear the session down: close the PeerJS transport and reset to idle. Without
  // this, navigating away leaves the connection open and the state alive, so the
  // user is bounced back into their old session.
  const leaveSession = useCallback(() => {
    transportRef.current?.close()
    transportRef.current = null
    stateRef.current = null
    isHostRef.current = false
    setState(null)
    setStatus('idle')
    setRoomCode(null)
    setError(null)
    setIsHost(false)
  }, [])

  // Dismiss a sticky error (e.g. a failed join) without tearing down a live
  // session. Returns the status to idle only when it was 'error', so calling
  // this on mount can't kill an in-lobby session.
  const clearError = useCallback(() => {
    setError(null)
    setStatus((s) => (s === 'error' ? 'idle' : s))
  }, [])

  // Memoized so the value handed to the root SessionContext keeps a stable
  // identity across renders — consumers only re-render when state actually
  // changes, not on every render of the always-mounted _app layout. The
  // callbacks are already stable (useCallback), so only the values vary.
  return useMemo<UseLobby>(
    () => ({
      state,
      status,
      roomCode,
      isHost,
      canStart: state ? canStartFn(state) : false,
      error,
      createRoom,
      joinRoom,
      ready,
      kick,
      setMaxPlayers,
      transferHost,
      leaveSession,
      clearError,
    }),
    [
      state,
      status,
      roomCode,
      isHost,
      error,
      createRoom,
      joinRoom,
      ready,
      kick,
      setMaxPlayers,
      transferHost,
      leaveSession,
      clearError,
    ],
  )
}
