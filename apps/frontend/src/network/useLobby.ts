import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { DEFAULT_SETUP } from '@release/ui'
import { useCallback, useMemo, useRef, useState } from 'react'
import { seatOf, seatsFor } from '~/entities/game/seats'
import { getClientId } from '~/shared/lib/persistence'
import {
  canStart as canStartFn,
  disbandLobby as disbandLobbyFn,
  handleJoinRequest,
  handleReady,
  handleWhereabouts,
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
import type { GameLink, Sync } from './session/link'
import { createSession, type SessionRef } from './session/referee'
import { isRelayable, relayTargets } from './session/relay'
import { attachKeeper, createRemoteLink } from './session/remoteLink'
import { createStartGate, type StartGate } from './session/startGate'
import { createTransport, type Transport } from './transport/peer'
import type { PeerInfo, Seat, Setup, Where, WireMessage } from './types'

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

// How long to keep the transport alive after broadcasting LOBBY_DISBANDED, so
// the buffered frame can flush over the DataChannels before peer.destroy().
const DISBAND_FLUSH_MS = 200

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'disbanded' | 'error'

// Semantic classification of a session failure, so the UI can show localized
// copy instead of the raw English PeerJS string. 'not-found' is specifically
// "no host answers to this code" (PeerJS `peer-unavailable`); everything else
// is a connection problem.
export type ErrorKind = 'not-found' | 'connection' | null

function classify(type?: string): Exclude<ErrorKind, null> {
  return type === 'peer-unavailable' ? 'not-found' : 'connection'
}

export interface UseLobby {
  state: LobbyState | null
  status: LobbyStatus
  roomCode: string | null
  isHost: boolean
  canStart: boolean
  // Set once the game has begun — on the host when it starts one, on a guest
  // when the host's GAME_STARTING arrives. Both roles navigate off this single
  // signal, so nobody is left behind in the lobby.
  gameId: string | null
  // The seam the page holds, and nothing else — it cannot tell a local keeper
  // from a remote one, which is what keeps solo play and networked play on the
  // same code path. Null until a game starts, and for a spectator, who has no
  // seat to submit from.
  gameLink: GameLink | null
  // The most recent projection this peer received. Held here rather than
  // subscribed to by the page, because the link is born inside the message
  // handler and the page only mounts after navigating — a SYNC arriving in that
  // gap would reach an empty listener set and be lost, leaving the player
  // staring at an empty table until someone else moved.
  gameSync: Sync | null
  // The seating this match was dealt with, frozen at the deal and held until the
  // match is left. It is NOT derived from `state.peers`: the roster is live and
  // `applyPeerLeft` prunes a peer the instant its channel drops, so seats
  // recomputed at read time renumber whoever is left and hand one player
  // another's seat — and the results screen would then print another player's
  // counters under their name. Empty outside a match.
  seats: Seat[]
  error: string | null
  errorKind: ErrorKind
  createRoom(name: string, maxPlayers: number, setup?: Setup): Promise<string>
  joinRoom(code: string, name: string): Promise<string>
  ready(): void
  // Where this peer now is. The host applies its own move locally; a guest sends
  // it and learns the result from the broadcast that comes back — the same split
  // `ready` makes, for the same reason: only the host's roster is authoritative.
  setWhere(where: Where): void
  kick(peerId: string): void
  setMaxPlayers(n: number): void
  transferHost(id: string): void
  setSetup(setup: Setup): void
  startGame(): void
  // The local seat has finished its opening deal. A no-op outside a game, and
  // for a spectator, whose report the host's gate is not waiting on.
  introReady(): void
  disband(): void
  leaveSession(): void
  // Leaving the match without leaving the room. The local match id goes — it is
  // what useFollowGameStart watches, so a peer walking back to the lobby with it
  // still set would be sent straight to the board again — and the frozen seating
  // with it, since it describes a match this peer has now left.
  //
  // The keeper, the link and the last sync stay. link.close() is local-only
  // (session/link.ts), but the match is already over and another peer may still
  // be reading its results — there is nothing here to reclaim and a live
  // results screen to break. A rematch tears the old keeper and gate down inside
  // startGame before building new ones, and leaveSession tears everything down
  // when the room itself is left.
  leaveGame(): void
  clearError(): void
}

export function useLobby(): UseLobby {
  const [state, setState] = useState<LobbyState | null>(null)
  const [status, setStatus] = useState<LobbyStatus>('idle')
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<ErrorKind>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameLink, setGameLink] = useState<GameLink | null>(null)
  const [gameSync, setGameSync] = useState<Sync | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const transportRef = useRef<Transport | null>(null)
  // The keeper's session, held only by the host. `sessionRef` is the state the
  // referee reduces; `keeperRef` and `remoteRef` are the two mutually exclusive
  // ends of the wire — a peer is one or the other, never both.
  const sessionRef = useRef<SessionRef | null>(null)
  const keeperRef = useRef<ReturnType<typeof attachKeeper> | null>(null)
  const remoteRef = useRef<ReturnType<typeof createRemoteLink> | null>(null)
  // The host's start gate, born with the keeper and dying with it: it holds a
  // pending cap timer, so it must never outlive the session it gates.
  const gateRef = useRef<StartGate | null>(null)
  // `gameId` as a ref, so reporting readiness reads the live value instead of
  // whichever render closed over it.
  const gameIdRef = useRef<string | null>(null)
  // Counts matches within one session. The room's identity is the host's peer
  // id and never changes, but a match's must: every reset downstream keys on
  // gameId — the follower's navigation, useGame's event feed, the deal intro —
  // and a rematch that reused the id would silently be taken for the same game.
  const matchSeqRef = useRef(0)
  const stateRef = useRef<LobbyState | null>(null)
  const isHostRef = useRef(false)
  // Whether the guest's DataChannel to the host ever opened. Distinguishes a
  // host that genuinely left (channel was up, then dropped) from a connection
  // that never established (ICE/negotiation failure) — so the two report
  // different, accurate errors.
  const hostConnectedRef = useRef(false)
  const leaveSessionRef = useRef<() => void>(() => {})
  // Bumped on every teardown (leaveSession). joinRoom captures it before its
  // createTransport await so a teardown that lands mid-await (e.g. Cancel / Home
  // on the invite screen, whose leaveSession runs while transportRef is still
  // null) is detected below — otherwise the resolved transport would be assigned
  // over the ref and resurrect the very session the user just cancelled.
  const sessionEpochRef = useRef(0)

  const onError = useCallback((err: { type?: string; message: string }) => {
    // Signaling/peer errors (peer-unavailable, network, disconnected) always
    // mean the session can't proceed — surface them. A per-connection error is
    // softer: once a lobby is live it shouldn't tear the whole session down, but
    // during a join (status still 'connecting') it IS the join failing, so
    // surface it too — otherwise the invite screen spins on 'connecting' forever
    // with no error shown and no recovery.
    setError(err.type ? `${err.type}: ${err.message}` : err.message)
    setErrorKind(classify(err.type))
    setStatus((s) => (err.type !== 'connection' || s === 'connecting' ? 'error' : s))
  }, [])

  // A rejected createTransport (setup failed before the peer opened) bypasses
  // onError, so route it through the same error/status machinery to avoid a
  // stuck 'connecting' spinner.
  const surfaceSetupError = useCallback((err: unknown) => {
    const e = err as { type?: string; message?: string }
    const message = e?.message ?? String(err)
    setError(e?.type ? `${e.type}: ${message}` : message)
    setErrorKind(classify(e?.type))
    setStatus('error')
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
        // The guest can't proceed without the host. Only call it "host left" if
        // we were actually connected; a channel that never opened means the
        // connection failed (ICE/negotiation) — keep that more specific error.
        // errorKind must stay in lockstep with error: a genuine post-connect
        // host departure is a fresh, definite connection failure (both
        // overwrite unconditionally), but a channel that never opened may
        // already carry a more specific kind from onError (e.g. 'not-found'
        // from peer-unavailable) — preserve it the same way the message is
        // preserved, or the two would disagree and 'not-found' would become
        // unreachable.
        if (hostConnectedRef.current) {
          setError('disconnected: host left the lobby')
          setErrorKind('connection')
        } else {
          setError((prev) => prev ?? 'could not connect to the lobby')
          setErrorKind((prev) => prev ?? 'connection')
        }
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
          const r = handleJoinRequest(current, msg.from, msg.payload.name, msg.payload.clientId)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'PLAYER_READY') {
          const r = handleReady(current, msg.from)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'WHEREABOUTS') {
          const r = handleWhereabouts(current, msg.from, msg.payload.where)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'INTENT' || msg.type === 'INTRO_READY') {
          // The only party that calls into the engine. `applyIntent` resolves the
          // seat from the sender's peer id and stamps the player itself, so a
          // peer cannot act for anyone but itself however it labels the frame.
          // A seat's INTRO_READY is resolved the same way, off the connection —
          // and like an intent it is addressed to the keeper, never relayed.
          keeperRef.current?.handleMessage(msg)
        } else {
          // Star topology: the host forwards any other peer-originated message
          // to every other connected peer (never back to the sender or itself),
          // preserving the original sender via relay() rather than re-stamping.
          const t = transportRef.current
          if (!t || !isRelayable(msg.type)) return
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
          if (fromHost) commit(applyConfig(current, msg.payload))
          break
        case 'PLAYER_KICKED':
          if (!fromHost) break
          if (msg.payload.peerId === current.selfId) setStatus('kicked')
          else commit(applyPeerLeft(current, msg.payload.peerId))
          break
        case 'GAME_STARTING': {
          // The host has left for the board; follow it. The id is carried rather
          // than derived so a future host handover can rename the room without
          // every guest recomputing it.
          if (!fromHost) break
          const t = transportRef.current
          if (t && !remoteRef.current) {
            // The keeper is the host today. `keeperPeerId` is a peer id, never a
            // PlayerId — the two spaces are both `string`, so the distinction has
            // to be kept by hand (session/remoteLink.ts:34).
            const remote = createRemoteLink({ transport: t, keeperPeerId: current.hostId })
            remoteRef.current = remote
            remote.link.subscribe(setGameSync)
            setGameLink(() => remote.link)
          }
          // A rematch arrives as two separate DataChannel events — this frame,
          // then the new match's first SYNC — and React commits the navigation
          // between them. Left in place, the previous match's projection is what
          // the board mounts on: the deal intro arms on the new gameId, finds no
          // opening in the old view, reports itself done, and the rematch's deal
          // is never played (the old game-over overlay paints for that commit
          // too). The host has no such window because `startGame` batches its
          // state into one update.
          if (msg.payload.gameId !== gameIdRef.current) setGameSync(null)
          // The seating is the host's, taken as given: recomputing it locally is
          // the defect this payload exists to close. `?? []` only covers a peer
          // running an older build — the page then falls back to seatsFor.
          setSeats(msg.payload.seats ?? [])
          gameIdRef.current = msg.payload.gameId
          setGameId(msg.payload.gameId)
          break
        }
        case 'SYNC':
        case 'KEEPER_CHANGED':
          // The remote link re-checks the sender against the keeper it knows, so
          // this is a route rather than a trust decision.
          remoteRef.current?.handleMessage(msg)
          break
        case 'LOBBY_DISBANDED':
          if (fromHost) {
            leaveSessionRef.current()
            // leaveSession sets status to 'idle'; this override is batched in the
            // same React update, so 'disbanded' wins in the final render.
            setStatus('disbanded')
          }
          break
        default:
          break
      }
    },
    [commit, dispatch],
  )

  const createRoom = useCallback(
    async (name: string, maxPlayers: number, setup?: Setup) => {
      // Mirror joinRoom: a stale transport (e.g. returning to /start from a live
      // guest session, which never calls leaveSession) is assigned over the ref
      // below, so close it first or the previous peer leaks.
      transportRef.current?.close()
      transportRef.current = null
      setStatus('connecting')
      setError(null)
      setErrorKind(null)
      try {
        // The host's peer id IS the room code, so the displayed code is exactly
        // what a joiner connects to — formatRoomCode/parseRoomCode round-trip it.
        const t = await createTransport({
          peerId: makeRoomCode(),
          onMessage,
          onError,
          onDisconnect,
        })
        transportRef.current = t
        isHostRef.current = true
        setIsHost(true)
        setRoomCode(formatRoomCode(t.id))
        const initial = createLobbyState({
          selfId: t.id,
          hostId: t.id,
          maxPlayers,
          setup: setup ?? DEFAULT_SETUP,
          peers: [
            { id: t.id, clientId: getClientId(), name, role: 'host', ready: true, where: 'lobby' },
          ],
        })
        commit(initial)
        setStatus('in-lobby')
        // The room code is the host peer id — known synchronously, so callers can
        // navigate straight to /lobby/:code without awaiting a roster round-trip.
        return formatRoomCode(t.id)
      } catch (err) {
        // createTransport rejects on a setup failure (taken peer id, signaling
        // server unreachable) WITHOUT going through onError, so surface it here —
        // otherwise status would stay 'connecting' forever. Re-throw so the
        // caller skips the post-await navigate.
        surfaceSetupError(err)
        throw err
      }
    },
    [onMessage, onError, onDisconnect, commit, surfaceSetupError],
  )

  const joinRoom = useCallback(
    async (code: string, name: string) => {
      // A retry (the invite screen reuses the same submit path) would otherwise
      // leave the previous peer open — createTransport is assigned over the ref
      // below, so nothing else would ever close it.
      transportRef.current?.close()
      transportRef.current = null
      setStatus('connecting')
      setError(null)
      setErrorKind(null)
      hostConnectedRef.current = false
      const hostId = parseRoomCode(code)
      // Snapshot the session generation so a Cancel/Home (leaveSession) during
      // the createTransport round-trip is detectable below.
      const epoch = sessionEpochRef.current
      try {
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
              hostConnectedRef.current = true
              transportRef.current?.send(hostId, {
                type: 'JOIN_REQUEST',
                payload: { name, clientId: getClientId() },
              })
              setStatus('in-lobby')
            }
          },
        })
        // Torn down mid-await (Cancel/Home bumped the epoch and reset to idle):
        // discard the freshly-opened peer instead of committing it, or the
        // cancelled attempt resurrects — leaking a live peer and re-arming the
        // /start "continue game" button for a session the user just left.
        if (sessionEpochRef.current !== epoch) {
          t.close()
          throw new Error('join cancelled')
        }
        transportRef.current = t
        isHostRef.current = false
        setIsHost(false)
        setRoomCode(formatRoomCode(hostId))
        commit(
          createLobbyState({
            selfId: t.id,
            hostId,
            maxPlayers: 6,
            setup: DEFAULT_SETUP,
            peers: [
              {
                id: t.id,
                clientId: getClientId(),
                name,
                role: 'guest',
                ready: false,
                where: 'lobby',
              },
            ],
          }),
        )
        t.connectTo(hostId)
        // The code resolves to the host id synchronously (parseRoomCode), so the
        // caller can route to /lobby/:code immediately; a bad code surfaces later
        // as a connection error on that same route.
        return formatRoomCode(hostId)
      } catch (err) {
        // A cancellation (epoch bumped) already reset the session to idle — don't
        // overwrite that with an error state; just propagate so the caller skips
        // the post-await navigate.
        if (sessionEpochRef.current !== epoch) throw err
        // Peer setup failed before opening (bad code, signaling unreachable);
        // surface it instead of leaving the form stuck on 'connecting', and
        // re-throw so the caller skips the post-await navigate.
        surfaceSetupError(err)
        throw err
      }
    },
    [onMessage, onError, onDisconnect, commit, surfaceSetupError],
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

  // Where this peer now is. The host applies its own move locally; a guest sends
  // it and learns the result from the broadcast that comes back — the same split
  // `ready` makes, for the same reason: only the host's roster is authoritative.
  const setWhere = useCallback(
    (where: Where) => {
      const t = transportRef.current
      const current = stateRef.current
      if (!t || !current) return
      if (isHostRef.current) {
        const r = handleWhereabouts(current, current.selfId, where)
        commit(r.state)
        dispatch(r.outgoing)
      } else {
        t.send(current.hostId, { type: 'WHEREABOUTS', payload: { where } })
      }
    },
    [commit, dispatch],
  )

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
  // The actual host handoff — reconnecting peers to the new host and sending the
  // HOST_TRANSFERRED confirmation — is not implemented yet; it belongs to the
  // page wiring in #18. Moving the host is only moving the relay: the keeper
  // keeps playing and its state does not travel, so no game state is involved.
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
  // user is bounced back into their old session. `flushMs` defers only the
  // transport close (state resets immediately) so a final broadcast can flush
  // over the DataChannels before peer.destroy() — see disband().
  const leaveSession = useCallback((flushMs?: number) => {
    const t = transportRef.current
    // Invalidate any join awaiting createTransport: if this teardown lands
    // mid-await, joinRoom sees the bumped epoch and discards the peer it opens
    // instead of resurrecting the torn-down session.
    sessionEpochRef.current += 1
    transportRef.current = null
    stateRef.current = null
    isHostRef.current = false
    hostConnectedRef.current = false
    setState(null)
    setStatus('idle')
    setRoomCode(null)
    setError(null)
    setErrorKind(null)
    setIsHost(false)
    // Or returning to /start would immediately bounce back to the board.
    gameIdRef.current = null
    setGameId(null)
    // Before the keeper goes: a gate left running would fire its 12s cap into a
    // session that no longer exists.
    gateRef.current?.cancel()
    gateRef.current = null
    keeperRef.current?.close()
    remoteRef.current?.link.close()
    keeperRef.current = null
    remoteRef.current = null
    sessionRef.current = null
    setGameLink(null)
    setGameSync(null)
    setSeats([])
    if (!t) return
    if (flushMs) setTimeout(() => t.close(), flushMs)
    else t.close()
  }, [])
  leaveSessionRef.current = leaveSession

  // Leaving the match without leaving the room. Only the local match id goes —
  // it is what useFollowGameStart watches, so a peer walking back to the lobby
  // with it still set would be sent straight to the board again.
  //
  // The frozen seating deliberately STAYS. Clearing it would make the results
  // screen fall back to seatsFor(live roster) for as long as it is still
  // mounted, which is the renumbering the frozen seating exists to end: one
  // player's counters standing under another player's name, and the departed
  // player's row gone. Nothing paints today because React batches this with the
  // navigation that follows it — but that makes the invariant rest on statement
  // order inside one handler rather than on the data, and an added await, a
  // split handler or a navigation moved into an effect would each be enough.
  // The rows come from the seating the match was dealt with, full stop.
  // Nothing reads it stale: GAME_STARTING overwrites it for the next match, and
  // leaveSession clears it when the room itself is left.
  //
  // The keeper, the link and the last sync stay for the same kind of reason.
  // link.close() is local-only (session/link.ts), but the match is already over
  // and another peer may still be reading its results — there is nothing here to
  // reclaim and a live results screen to break. A rematch tears the old keeper
  // and gate down inside startGame before building new ones.
  const leaveGame = useCallback(() => {
    gameIdRef.current = null
    setGameId(null)
  }, [])

  const setSetup = useCallback(
    (setup: Setup) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      commit(applyConfig(current, { setup }))
      dispatch([{ to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { setup } } }])
    },
    [commit, dispatch],
  )

  // Host-only: tell the table to follow, then move. The board route is keyed by
  // the MATCH id, minted here and carried in the payload, so every peer resolves
  // the same URL from the frame rather than deriving one — a rematch gets its own
  // id and nobody has to recompute it.
  // Broadcast first — setGameId navigates this peer away, and an unmounting
  // component must not be what the others are waiting on.
  const startGame = useCallback(() => {
    const current = stateRef.current
    const t = transportRef.current
    if (!current || !t || !isHostRef.current) return
    matchSeqRef.current += 1
    const id = `${current.hostId}-${matchSeqRef.current}`

    const dealt = seatsFor(current.peers)
    const mine = seatOf(dealt, current.selfId)
    if (!mine) return

    // A rematch reassigns all three refs below. Reassignment is not teardown:
    // the previous keeper's 250ms ticker would go on running for the life of the
    // tab with setGameSync still in its listener set, and the previous gate's
    // pending cap would fire into a match that no longer exists. Same order
    // leaveSession uses — the gate first, because it must never outlive its
    // session.
    gateRef.current?.cancel()
    gateRef.current = null
    keeperRef.current?.close()
    keeperRef.current = null

    // The engine never sources randomness, so the seed is the host's and travels
    // with the deal. Determinism is what lets every peer replay identically.
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]

    // Held rather than inlined: the opening deal has to be asked of this same
    // engine below, once the session exists.
    const engine = createFakeEngine()

    const { session } = createSession({
      gameId: id,
      keeperId: mine.playerId,
      engine,
      seed,
      players: dealt,
      setup: current.setup,
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    })
    const ref: SessionRef = { current: session }
    sessionRef.current = ref
    // Every seat, including the host's own: one rule for the table. Spectators
    // hold no seat and are never waited on — they have no projection to replay,
    // so they never run a deal and could never report done.
    const gate = createStartGate({ expect: dealt.map((s) => s.playerId) })
    gateRef.current = gate
    const keeper = attachKeeper({ ref, transport: t, now: () => Date.now(), gate })
    keeperRef.current = keeper
    keeper.link.subscribe(setGameSync)
    setGameLink(() => keeper.link)

    // Tell the table to follow before dealing, so a guest has built its remote
    // link by the time its projection arrives. DataChannels preserve order, so
    // GAME_STARTING is always ahead of the SYNC that follows it.
    dispatch([
      {
        to: 'broadcast',
        message: { type: 'GAME_STARTING', payload: { gameId: id, seats: dealt } },
      },
    ])
    gameIdRef.current = id
    setGameId(id)
    // The same array the engine was seated with, held rather than recomputed —
    // see the `seats` member above.
    setSeats(dealt)
    // The deal travels with the first projection. `createSession` also returns it
    // as `outgoing`, but that array is unreachable from here — the keeper owns
    // delivery — so it is asked of the engine again and handed to the fan-out.
    // Without it every peer receives a hand with no account of where it came
    // from: the board's intro has no deal to replay and the move history opens
    // on a blank.
    keeper.resync(engine.setupEvents(session.state))
  }, [dispatch])

  // The local seat has finished its opening. The host reports into its own
  // keeper; a guest sends the frame, and the host's keeper resolves the seat
  // from the connection it arrived on — the same path an intent takes, so a
  // peer cannot report for somebody else.
  const introReady = useCallback(() => {
    const id = gameIdRef.current
    const current = stateRef.current
    // No game means nothing to report into: send nothing, touch nothing.
    if (!id || !current) return
    if (isHostRef.current) {
      const t = transportRef.current
      if (t) keeperRef.current?.introReady(t.id)
      return
    }
    dispatch([{ to: current.hostId, message: { type: 'INTRO_READY', payload: { gameId: id } } }])
  }, [dispatch])

  const disband = useCallback(() => {
    const current = stateRef.current
    if (!current || !isHostRef.current) return
    const r = disbandLobbyFn(current)
    dispatch(r.outgoing)
    // Defer the transport teardown so the just-queued LOBBY_DISBANDED frame can
    // flush over the DataChannels before peer.destroy() closes them — otherwise
    // guests may never receive it and would only notice via the host-disconnect
    // path. Local state still resets immediately.
    leaveSession(DISBAND_FLUSH_MS)
  }, [dispatch, leaveSession])

  // Dismiss a sticky error (e.g. a failed join) without tearing down a live
  // session. Returns the status to idle only when it was 'error', so calling
  // this on mount can't kill an in-lobby session.
  const clearError = useCallback(() => {
    setError(null)
    setErrorKind(null)
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
      gameId,
      gameLink,
      gameSync,
      seats,
      error,
      errorKind,
      createRoom,
      joinRoom,
      ready,
      setWhere,
      kick,
      setMaxPlayers,
      transferHost,
      setSetup,
      startGame,
      introReady,
      disband,
      leaveSession,
      leaveGame,
      clearError,
    }),
    [
      state,
      status,
      roomCode,
      isHost,
      gameId,
      gameLink,
      gameSync,
      seats,
      error,
      errorKind,
      createRoom,
      joinRoom,
      ready,
      setWhere,
      kick,
      setMaxPlayers,
      transferHost,
      setSetup,
      startGame,
      introReady,
      disband,
      leaveSession,
      leaveGame,
      clearError,
    ],
  )
}
