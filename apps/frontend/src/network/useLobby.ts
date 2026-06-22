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

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked'

export interface UseLobby {
  state: LobbyState | null
  status: LobbyStatus
  roomCode: string | null
  isHost: boolean
  canStart: boolean
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
  const transportRef = useRef<Transport | null>(null)
  const stateRef = useRef<LobbyState | null>(null)
  const isHostRef = useRef(false)

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
          const peer: PeerInfo = { ...msg.payload, ready: false }
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
      const t = await createTransport({ onMessage })
      transportRef.current = t
      isHostRef.current = true
      const initial = createLobbyState({
        selfId: t.id,
        hostId: t.id,
        maxPlayers,
        peers: [{ id: t.id, name, role: 'host', ready: true }],
      })
      commit(initial)
      setStatus('in-lobby')
    },
    [onMessage, commit],
  )

  const joinRoom = useCallback(
    async (hostId: string, name: string) => {
      setStatus('connecting')
      const t = await createTransport({ onMessage })
      transportRef.current = t
      isHostRef.current = false
      commit(
        createLobbyState({
          selfId: t.id,
          hostId,
          maxPlayers: 6,
          peers: [{ id: t.id, name, role: 'guest', ready: false }],
        }),
      )
      t.connectTo(hostId)
      // Give the channel a tick to open before the JOIN_REQUEST.
      setTimeout(() => t.send(hostId, { type: 'JOIN_REQUEST', payload: { name } }), 0)
      setStatus('in-lobby')
    },
    [onMessage, commit],
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
    roomCode:
      transportRef.current && isHostRef.current ? formatRoomCode(transportRef.current.id) : null,
    isHost: isHostRef.current,
    canStart: state ? canStartFn(state) : false,
    createRoom,
    joinRoom,
    ready,
    kick,
    setMaxPlayers,
    transferHost,
  }
}
