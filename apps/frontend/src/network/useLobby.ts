import { useCallback, useRef, useState } from 'react'
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
import { createTransport, type Transport } from './transport/peer'
import type { PeerInfo, WireMessage } from './types'

export function formatRoomCode(peerId: string): string {
  const head = peerId.slice(0, 6).toUpperCase()
  return head.length > 3 ? `${head.slice(0, 3)}-${head.slice(3)}` : head
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
  joinRoom(hostId: string, name: string): Promise<void>
  ready(): void
  kick(peerId: string): void
  setMaxPlayers(n: number): void
  transferHost(id: string): void
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
        }
        return
      }
      // Guest-side application of host broadcasts.
      switch (msg.type) {
        case 'PEER_LIST':
          commit(applyPeerList(current, msg.payload.peers))
          break
        case 'PEER_JOINED': {
          const peer: PeerInfo = { ...msg.payload }
          commit(applyPeerJoined(current, peer))
          break
        }
        case 'LOBBY_CONFIG_UPDATED':
          commit(applyConfig(current, msg.payload.maxPlayers))
          break
        case 'PLAYER_KICKED':
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
      const t = await createTransport({ onMessage, onError })
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
    [onMessage, onError, commit],
  )

  const joinRoom = useCallback(
    async (hostId: string, name: string) => {
      setStatus('connecting')
      setError(null)
      const t = await createTransport({
        onMessage,
        onError,
        onConnection: (peerId) => {
          // Send JOIN_REQUEST exactly when the host DataChannel opens — a
          // setTimeout(0) is not sufficient over real WebRTC because the channel
          // may not be open after a single macrotask.
          if (peerId === hostId)
            transportRef.current?.send(hostId, { type: 'JOIN_REQUEST', payload: { name } })
        },
      })
      transportRef.current = t
      isHostRef.current = false
      setIsHost(false)
      setRoomCode(null)
      commit(
        createLobbyState({
          selfId: t.id,
          hostId,
          maxPlayers: 6,
          peers: [{ id: t.id, name, role: 'guest', ready: false }],
        }),
      )
      t.connectTo(hostId)
      setStatus('in-lobby')
    },
    [onMessage, onError, commit],
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

  return {
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
  }
}
