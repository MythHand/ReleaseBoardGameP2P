import type { PlayerId } from '@release/engine'
import { createFakeEngine } from '@release/engine/fake'
import { DEFAULT_SETUP } from '@release/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PrivateSeat } from '~/entities/game/seats'
import type { ChatEntry } from '~/shared/chat/types'
import {
  clearKeeper,
  clearLog,
  clearSession,
  getResumeToken,
  readKeeper,
  readSession,
  type StoredLobbyConfig,
  type StoredSession,
  writeSession,
} from '~/shared/lib/persistence'
import { createChatController, toChatRole } from './chat/controller'
import { type RoomChatState, useChatSession } from './chat/useChatSession'
import { createLobbyActionsController } from './lobby/actionsController'
import {
  canStart as canStartFn,
  handleJoinRequest,
  handleReady,
  handleWhereabouts,
} from './lobby/host'
import { dispatchOutgoing, joinRequest, type Outgoing, playerKicked } from './lobby/messages'
import { formatRoomCode, makeRoomCode, parseRoomCode } from './lobby/roomCode'
import { createRoomRuntime, type PickPreview } from './lobby/runtime'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  applyPeerList,
  createLobbyState,
  type LobbyState,
} from './lobby/state'
import type { GameLink, Sync } from './session/link'
import { createMatchController } from './session/matchController'
import {
  createKeeperWriter,
  normalizeKeeperSnapshot,
  normalizeLobbyConfig,
} from './session/persistence'
import { backoffMs, MAX_RECONNECT_ATTEMPTS, type ReconnectEvent } from './session/reconnect'
import { isRelayable, relayTargets } from './session/relay'
import { createTransport, type Transport } from './transport/peer'
import type { PeerInfo, Seat, Setup, Where, WireMessage } from './types'

export { formatRoomCode, makeRoomCode, parseRoomCode } from './lobby/roomCode'
export { KEEPER_SAVE_MS, matchSeqAfterRestore } from './session/persistence'

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'disbanded' | 'error'

// Semantic classification of a session failure, so the UI can show localized
// copy instead of the raw English PeerJS string. 'not-found' is specifically
// "no host answers to this code" (PeerJS `peer-unavailable`); everything else
// is a connection problem.
export type ErrorKind = 'not-found' | 'connection' | null

function classify(type?: string): Exclude<ErrorKind, null> {
  return type === 'peer-unavailable' ? 'not-found' : 'connection'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseJoinRequestPayload(value: unknown): { name: string; resumeToken: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const { name, resumeToken } = value as { name?: unknown; resumeToken?: unknown }
  if (!isNonEmptyString(name) || !isNonEmptyString(resumeToken)) return null
  return { name, resumeToken }
}

// The outcome of one dial's connection to the HOST — not this browser's own
// peer registering with the signaling server (joinRoom's own returned promise
// already reports that), but whether the DataChannel to the host itself
// opened, errored, or was told to close. Reported through a callback the
// caller supplies, never through a ref: see joinRoom's `onDialOutcome`
// parameter and runGuestReconnect's own `settleAttempt` for why.
type DialOutcome = { ok: true } | { ok: false; error: unknown }

// A guest's half of the reconnect overlay (restoring is the host's). Unlike
// restoring's single boolean, a guest reload re-dials through the ordinary
// joinRoom path — the same one a fresh join uses — so there is no separate
// wire protocol to narrate, only this hook's own view of the attempt: which
// number it's on, and the events the overlay renders as terminal lines.
export interface ReconnectState {
  attempt: number
  maxAttempts: number
  status: 'idle' | 'trying' | 'failed'
  events: ReconnectEvent[]
  // Starts a fresh run from attempt 1, superseding any run still in flight
  // (mid-backoff or otherwise) — the same epoch-guard pattern restoreHost and
  // joinRoom already use to let a newer attempt win over a stale one.
  retry(): void
}

export interface UseLobby {
  state: LobbyState | null
  status: LobbyStatus
  // True for the duration of a host's mount-time restore (createTransport
  // through adopting the keeper snapshot), false otherwise — including once it
  // settles into 'in-lobby' or 'error'. This is the host's half of the
  // reconnect overlay: a board rendered while this is true has a session that
  // exists but is not yet receiving anything, and without a distinct signal
  // for that a restoring host sits in front of a blank table with nothing on
  // screen explaining why. The guest's half is `reconnect` (a later task).
  restoring: boolean
  // The guest's half of the reconnect overlay — see ReconnectState. Idle
  // whenever there is nothing to reconnect: no stored guest session, a host
  // restore that already succeeded, or a run that finished either way.
  reconnect: ReconnectState
  roomCode: string | null
  isHost: boolean
  canStart: boolean
  // Set once the game has begun — on the host when it starts one, on a guest
  // when the host's GAME_STARTING arrives. Both roles navigate off this single
  // signal, so nobody is left behind in the lobby.
  gameId: string | null
  // The seam the page holds, and nothing else — it cannot tell a bot-driven
  // seat from a remote one, which is what keeps bot play and networked play on
  // the same code path. Null until a game starts, and for a spectator, who has
  // no seat to submit from.
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
  chat: RoomChatState
  createRoom(name: string, maxPlayers: number, setup?: Setup): Promise<string>
  joinRoom(code: string, name: string): Promise<string>
  ready(): void
  // Where this peer now is. The host applies its own move locally; a guest sends
  // it and learns the result from the broadcast that comes back — the same split
  // `ready` makes, for the same reason: only the host's roster is authoritative.
  setWhere(where: Where): void
  kick(peerId: string): void
  setMaxPlayers(n: number): void
  // How many of the free seats should be bots. A ceiling the table honours as
  // far as it fits — see `effectiveBots`.
  setBots(n: number): void
  transferHost(id: string): void
  setSetup(setup: Setup): void
  // `botNames` is display copy, so it arrives from the features layer rather
  // than being built here: `network/` may not import i18next.
  startGame(botNames: string[]): void
  // The local seat has finished its opening deal. A no-op outside a game, and
  // for a spectator, whose report the host's gate is not waiting on.
  introReady(): void
  /** the card the local Cherry-pick surface is offering, or null — broadcast */
  previewPick(player: PlayerId, card: string | null): void
  /** the pick another seat's surface is offering right now, if any */
  pickPreview: { gameId: string; player: PlayerId; card: string | null } | null
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
  const chatSession = useChatSession()
  const clearChatRoom = chatSession.clearRoom
  const [state, setState] = useState<LobbyState | null>(null)
  const [status, setStatus] = useState<LobbyStatus>('idle')
  // The host's half of the reconnect overlay (see the interface doc). Set for
  // the whole span of restoreHost, success or failure alike, in a finally —
  // every early return inside it must still clear this, or a restore that
  // bails out (no stored session, spent retries) would leave the board
  // believing a reconnect is still in flight forever.
  const [restoring, setRestoring] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  // The pick somebody's surface is currently offering to confirm — see
  // PICK_PREVIEW. Held beside the game and never inside it: nothing here is
  // engine state, and a stale one costs a highlight on a surface that is gone.
  const [pickPreview, setPickPreview] = useState<PickPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorKind, setErrorKind] = useState<ErrorKind>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameLink, setGameLink] = useState<GameLink | null>(null)
  const [gameSync, setGameSync] = useState<Sync | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const keeperWriter = useMemo(() => createKeeperWriter(), [])
  const runtime = useMemo(
    () =>
      createRoomRuntime(
        {
          lobby: setState,
          host: setIsHost,
          roomCode: setRoomCode,
          gameId: setGameId,
          seats: setSeats,
          gameLink: setGameLink,
          gameSync: setGameSync,
          pickPreview: setPickPreview,
        },
        keeperWriter,
      ),
    [keeperWriter],
  )
  // Whether the guest's DataChannel to the host ever opened. Distinguishes a
  // host that genuinely left (channel was up, then dropped) from a connection
  // that never established (ICE/negotiation failure) — so the two report
  // different, accurate errors.
  const hostConnectedRef = useRef(false)
  const leaveSessionRef = useRef<() => void>(() => {})

  // The guest's half of the reconnect overlay (see ReconnectState).
  const [reconnectStatus, setReconnectStatus] = useState<'idle' | 'trying' | 'failed'>('idle')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [reconnectEvents, setReconnectEvents] = useState<ReconnectEvent[]>([])
  // The stored session a guest reconnect run is re-dialing. Set once, by
  // whichever of the mount effect or retry() starts the run, and read by the
  // loop itself rather than threaded through as a parameter — retry() has no
  // fresher one to offer.
  const reconnectSessionRef = useRef<StoredSession | null>(null)
  // Round 1 (retry() mid-dial) and round 2 (an earlier attempt's belated
  // event landing during the next one, same run) were both caused by the
  // same shape: a per-attempt outcome living in one shared, hook-level ref,
  // reachable by every dial this loop ever opens. Round 3 found the third
  // symptom of that same shape — an unconditional clear in the per-attempt
  // `finally` could null out a *different*, newer attempt's entry. Rather
  // than add a fourth guard, the outcome is no longer kept in a shared ref
  // at all: each attempt in runGuestReconnect's loop below owns a plain
  // local `settleAttempt` closure, and hands it directly to joinRoom's
  // `onDialOutcome` parameter — see joinRoom for how its
  // onConnection/onError/onDisconnect call it straight from a per-call
  // closure, never through a ref. No attempt can reach, settle, or clear
  // another attempt's handle, because there is no cell left for two
  // attempts to both reach into.
  //
  // reconnectDialRef and reconnectPendingRef below are what remains: a
  // separate, narrower need, unrelated to joinRoom's own callbacks.
  // leaveSession runs in a different closure entirely, with nothing to
  // close over an in-flight attempt's local `settleAttempt` — it needs some
  // cross-closure way to unstick whichever attempt is currently awaiting a
  // real connection result, or a teardown mid-dial would leave that
  // attempt's `await settled` hanging forever with no epoch check able to
  // catch it (the epoch is only re-checked once `settled` itself resolves).
  // Bumped once per dial, purely to key reconnectPendingRef below — no
  // longer read by joinRoom's callbacks at all.
  const reconnectDialRef = useRef(0)
  // The one attempt (if any) currently awaiting a real connection result,
  // keyed by the reconnectDialRef token that installed it. Read and written
  // ONLY by runGuestReconnect's own install/clear (both self-keyed: a clear
  // only clears the entry it itself installed) and by leaveSession (the one
  // caller allowed to act on "whichever attempt is current" without a key
  // of its own, since it represents the player leaving outright rather than
  // a dial's own outcome). joinRoom's onConnection/onError/onDisconnect
  // never read this — they call the closure they were handed directly.
  const reconnectPendingRef = useRef<{
    token: number
    settle: (outcome: DialOutcome) => void
  } | null>(null)

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

  const commit = useCallback(
    (next: LobbyState) => {
      runtime.commitLobby(next)
    },
    [runtime],
  )

  // The only way the seating is ever written. The page reads the state and the
  // message handler reads the ref, so setting one without the other is a bug
  // that only shows up under real timing — a returning player measured against
  // a seating one frame out of date.
  const applySeats = useCallback(
    (next: Seat[], privateSeats?: PrivateSeat[]) => {
      runtime.commitSeats(next, privateSeats)
    },
    [runtime],
  )

  // Drop a snapshot that has not been serialized yet, and forget what was last
  // queued. Called from every teardown: the stored record is cleared there, and
  // a trailing write landing afterwards would put the abandoned match straight
  // back.
  const cancelKeeperSave = useCallback(() => {
    keeperWriter.cancel()
  }, [keeperWriter])

  // The room is stored the moment it is entered; the match id lands on top of
  // that record when one starts. Without it a restore knows the room but not
  // that a match is running, and would put this peer back in a lobby the table
  // has already left. A missing record means the session was never stored (or
  // has expired), and inventing one here would store a room with no `name` and
  // no `joinedAt` behind it.
  // `null` walks it back: the room stays stored, the match on it does not.
  const rememberGame = useCallback((id: string | null) => {
    const stored = readSession()
    if (stored) writeSession({ ...stored, gameId: id })
  }, [])

  const rememberLobbyConfig = useCallback(
    (lobby: Pick<LobbyState, 'maxPlayers' | 'setup' | 'bots'>) => {
      const stored = readSession()
      if (stored?.role !== 'host') return
      const lobbyConfig: StoredLobbyConfig = {
        maxPlayers: lobby.maxPlayers,
        setup: lobby.setup,
        bots: lobby.bots,
      }
      writeSession({ ...stored, lobbyConfig })
    },
    [],
  )

  // Everything this browser stored about a session it is leaving. The pending
  // snapshot goes first, or clearing the record and then letting the trailing
  // write land would restore exactly what was just discarded.
  const forgetStored = useCallback(() => {
    cancelKeeperSave()
    clearSession()
    clearKeeper()
  }, [cancelKeeperSave])

  const teardownSession = useCallback(
    (flushMs?: number) => {
      const transport = runtime.invalidateSession()
      reconnectSessionRef.current = null
      reconnectPendingRef.current?.settle({ ok: false, error: new Error('session left') })
      reconnectPendingRef.current = null
      setReconnectStatus('idle')
      setReconnectAttempt(0)
      setReconnectEvents([])
      hostConnectedRef.current = false
      runtime.commitLobby(null)
      setStatus('idle')
      setRestoring(false)
      runtime.commitRoomCode(null)
      setError(null)
      setErrorKind(null)
      runtime.commitGameId(null)
      runtime.closeMatchResources({ clearView: true })
      runtime.replaceResumeTokens(new Map())
      runtime.commitSeats([], [])
      forgetStored()
      clearChatRoom()
      clearLog()
      if (!transport) return
      if (flushMs) setTimeout(() => transport.close(), flushMs)
      else transport.close()
    },
    [clearChatRoom, forgetStored, runtime],
  )

  const dispatch = useCallback(
    (outgoing: Outgoing[]) => {
      dispatchOutgoing(runtime.transport, outgoing)
    },
    [runtime],
  )

  const canSendAsGuest = useCallback(() => hostConnectedRef.current, [])
  const chatController = useMemo(
    () =>
      createChatController({
        runtime,
        session: {
          admit: chatSession.admit,
          appendSystem: chatSession.appendSystem,
          appendUser: chatSession.appendUser,
          clearRoom: chatSession.clearRoom,
          history: chatSession.history,
          receiveEntry: chatSession.receiveEntry,
          receiveHistory: chatSession.receiveHistory,
        },
        dispatch,
        canSendAsGuest,
      }),
    [
      canSendAsGuest,
      chatSession.admit,
      chatSession.appendSystem,
      chatSession.appendUser,
      chatSession.clearRoom,
      chatSession.history,
      chatSession.receiveEntry,
      chatSession.receiveHistory,
      dispatch,
      runtime,
    ],
  )
  const matchController = useMemo(
    () =>
      createMatchController({
        runtime,
        keeperWriter,
        dispatch,
        rememberGame,
        clearKeeper,
      }),
    [dispatch, keeperWriter, rememberGame, runtime],
  )

  // A peer (or the host) dropping its DataChannel must update the roster, or the
  // lobby keeps counting a ghost player toward canStart()/turn rotation.
  // `onDisconnect` is defined above `runGuestReconnect` and has to reach it, so
  // the runner is held here and assigned once it exists. A ref rather than a
  // dependency: onDisconnect is handed to the transport at creation time and
  // must not be rebuilt every time the runner's identity changes.
  const runGuestReconnectRef = useRef<(() => Promise<void>) | null>(null)

  const onDisconnect = useCallback(
    (peerId: string) => {
      const current = runtime.lobby
      if (!current) return
      if (runtime.isHost) {
        // Host owns the roster: prune the peer and tell everyone else.
        const leaving = current.peers[peerId]
        if (!leaving) return
        const resumeTokens = new Map(runtime.resumeTokens)
        resumeTokens.delete(peerId)
        runtime.replaceResumeTokens(resumeTokens)
        // The roster and the keeper are separate books and both have to be
        // told. Without this the seat stays bound to a dead peer id: its SYNCs
        // are addressed into the void, `driveUnattended` never starts its grace
        // period, and a returning player finds their own seat occupied —
        // `rebind` refuses a seat whose peerId is not null.
        matchController.peerLeft(peerId)
        const next = applyPeerLeft(current, peerId)
        const stillConnected = Object.values(next.peers).some(
          (peer) => peer.memberId === leaving.memberId,
        )
        const entry = stillConnected ? null : chatController.appendLeft(leaving)
        commit(next)
        dispatch([playerKicked(peerId)])
        if (entry) chatController.broadcast([entry])
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
        // In an active room, a lost host is not the end of the session — it is
        // what every guest observes while the host reloads, in the lobby as
        // well as during a match. Left as an error, the guest has no dial
        // running and recovers only if the player happens to reload too.
        //
        // Only once the channel had actually opened: a channel that never
        // opened is a failed join, not a lost session, and keeps its more
        // specific error below.
        const stored = readSession()
        if (hostConnectedRef.current && stored?.role === 'guest') {
          reconnectSessionRef.current = stored
          void runGuestReconnectRef.current?.()
          return
        }
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
    [chatController, commit, dispatch, matchController, runtime],
  )

  const onMessage = useCallback(
    (msg: WireMessage) => {
      const current = runtime.lobby
      if (!current) return
      if (runtime.isHost) {
        if (msg.type === 'JOIN_REQUEST') {
          const liveGameId = runtime.gameId
          const payload = parseJoinRequestPayload((msg as { payload?: unknown }).payload)
          if (!payload) {
            if (liveGameId) matchController.peerLeft(msg.from)
            return
          }
          // The frozen seating is what tells a return from a first join, so it
          // has to be the live one — the ref, never a closed-over copy.
          //
          // And only while a match is actually running. The seating deliberately
          // outlives `leaveGame` (a results screen still mounted reads it), so
          // the match id is what says whether there is anything to come back to:
          // without this gate a player who left the match and rejoined the room
          // would be recognised as a returner and seated back into a match they
          // walked out of — arriving in the lobby already `ready`, in `game`.
          const privateSeat = liveGameId
            ? runtime.privateSeats.find(({ resumeToken }) => resumeToken === payload.resumeToken)
            : undefined
          if (liveGameId && !privateSeat) matchController.peerLeft(msg.from)
          let joinState = current
          let replacedLobbyPeer: PeerInfo | undefined
          if (!liveGameId) {
            const liveCredentialPeer = [...runtime.resumeTokens].find(
              ([peerId, resumeToken]) => peerId !== msg.from && resumeToken === payload.resumeToken,
            )
            if (liveCredentialPeer) {
              const existing = current.peers[liveCredentialPeer[0]]
              if (!existing || existing.name !== payload.name) return
              replacedLobbyPeer = existing
              joinState = applyPeerLeft(current, existing.id)
              const resumeTokens = new Map(runtime.resumeTokens)
              resumeTokens.delete(existing.id)
              runtime.replaceResumeTokens(resumeTokens)
            }
            const resumeTokens = new Map(runtime.resumeTokens)
            resumeTokens.set(msg.from, payload.resumeToken)
            runtime.replaceResumeTokens(resumeTokens)
          }
          const admission = chatController.admit(payload.resumeToken)
          const previousRole = replacedLobbyPeer
            ? toChatRole(replacedLobbyPeer.role)
            : privateSeat
              ? 'player'
              : chatController.lastKnownRole(admission.memberId)
          const r = handleJoinRequest(joinState, msg.from, admission.memberId, payload.name, {
            matchRunning: Boolean(liveGameId),
            returningSeat: privateSeat?.seat,
            returningLobbyPeer: replacedLobbyPeer,
          })
          const admittedPeer = r.state.peers[msg.from]
          const nextRole = toChatRole(admittedPeer.role)
          const chatEntries: ChatEntry[] = [
            chatController.appendJoin(admittedPeer, admission.isNew),
          ]
          if (!admission.isNew && previousRole !== nextRole) {
            chatEntries.push(chatController.appendRoleChange(admittedPeer))
          }
          commit(r.state)
          const outgoing: Outgoing[] = []
          if (replacedLobbyPeer) {
            outgoing.push(playerKicked(replacedLobbyPeer.id))
          }
          for (const frame of r.outgoing) {
            outgoing.push(frame)
          }
          outgoing.push(chatController.history(msg.from, admission.memberId))
          dispatch(outgoing)
          chatController.broadcast(chatEntries)

          const seat = privateSeat?.seat
          if (seat && liveGameId) {
            matchController.returnSeat({
              seat,
              peerId: msg.from,
              resumeToken: payload.resumeToken,
            })
          }
          if (!liveGameId || seat) runtime.transport?.authenticate(msg.from)
        } else if (msg.type === 'PLAYER_READY') {
          const r = handleReady(current, msg.from)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'WHEREABOUTS') {
          const r = handleWhereabouts(current, msg.from, msg.payload.where)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'CHAT_SEND') {
          const peer = current.peers[msg.from]
          if (!peer) return
          const entry = chatController.appendUser(peer, msg.payload.text)
          if (entry) chatController.broadcast([entry])
        } else if (msg.type === 'INTENT' || msg.type === 'INTRO_READY') {
          // The only party that calls into the engine. `applyIntent` resolves the
          // seat from the sender's peer id and stamps the player itself, so a
          // peer cannot act for anyone but itself however it labels the frame.
          // A seat's INTRO_READY is resolved the same way, off the connection —
          // and like an intent it is addressed to the keeper, never relayed.
          runtime.matchResources.keeper?.handleMessage(msg)
        } else {
          // The host is a SEAT as well as the relay: a frame everybody watches
          // has to reach its own board too, and it still goes on to the others
          // below rather than stopping here.
          if (msg.type === 'PICK_PREVIEW') runtime.commitPickPreview(msg.payload)
          // Star topology: the host forwards any other peer-originated message
          // to every other connected peer (never back to the sender or itself),
          // preserving the original sender via relay() rather than re-stamping.
          const t = runtime.transport
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
        // Whoever it came from: a preview names its own player, and the host
        // relays it with the original sender intact. Nothing about the table
        // moves on it — it only says which card somebody's surface is offering.
        case 'PICK_PREVIEW':
          runtime.commitPickPreview(msg.payload)
          break
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
        case 'CHAT_HISTORY':
          if (fromHost) {
            chatController.receiveHistory(msg.payload.entries, msg.payload.selfMemberId)
          }
          break
        case 'CHAT_ENTRY':
          if (fromHost) chatController.receiveEntry(msg.payload.entry)
          break
        case 'PLAYER_KICKED':
          if (!fromHost) break
          if (msg.payload.peerId === current.selfId) {
            setStatus('kicked')
            // A stored record here would offer to walk the kicked player
            // straight back into the room that just removed them.
            forgetStored()
            clearChatRoom()
          } else commit(applyPeerLeft(current, msg.payload.peerId))
          break
        case 'GAME_STARTING': {
          // The host has left for the board; follow it. The id is carried rather
          // than derived so a future host handover can rename the room without
          // every guest recomputing it.
          if (!fromHost) break
          matchController.followStart(msg.payload.gameId, msg.payload.seats ?? [])
          break
        }
        case 'SEAT_REBOUND': {
          // The host's word, exactly like every roster patch above. A forged
          // one would repoint a seat at a peer id of the forger's choosing, and
          // that seat's private fan-out follows the peer id.
          if (!fromHost) break
          matchController.reboundSeat(msg.payload.playerId, msg.payload.peerId)
          break
        }
        case 'SYNC':
        case 'KEEPER_CHANGED':
          // The remote link re-checks the sender against the keeper it knows, so
          // this is a route rather than a trust decision.
          matchController.receiveSync(msg)
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
    [chatController, clearChatRoom, commit, dispatch, forgetStored, matchController, runtime],
  )

  const createRoom = useCallback(
    async (name: string, maxPlayers: number, setup?: Setup) => {
      teardownSession()
      const attempt = runtime.beginTransportAttempt()
      let owner: Transport | null = null
      const ownsTransport = () => runtime.ownsTransport(attempt, owner)
      setStatus('connecting')
      setError(null)
      setErrorKind(null)
      try {
        // The host's peer id IS the room code, so the displayed code is exactly
        // what a joiner connects to — formatRoomCode/parseRoomCode round-trip it.
        const t = await createTransport({
          peerId: makeRoomCode(),
          onMessage: (msg) => {
            if (ownsTransport()) onMessage(msg)
          },
          onError: (err) => {
            if (ownsTransport()) onError(err)
          },
          onDisconnect: (peerId) => {
            if (ownsTransport()) onDisconnect(peerId)
          },
        })
        owner = t
        if (!runtime.attachTransport(attempt, t, true)) {
          t.close()
          throw new Error('create cancelled')
        }
        const nextRoomCode = formatRoomCode(t.id)
        runtime.commitRoomCode(nextRoomCode)
        const hostResumeToken = getResumeToken(nextRoomCode)
        const hostMemberId = chatSession.startHost(nextRoomCode, hostResumeToken)
        runtime.replaceResumeTokens(new Map([[t.id, hostResumeToken]]))
        runtime.commitSeats([], [])
        const initial = createLobbyState({
          selfId: t.id,
          hostId: t.id,
          maxPlayers,
          setup: setup ?? DEFAULT_SETUP,
          peers: [
            {
              id: t.id,
              memberId: hostMemberId,
              name,
              role: 'host',
              ready: true,
              where: 'lobby',
            },
          ],
        })
        commit(initial)
        // What a reload has to find its way back with. `gameId: null` because
        // the room exists before any match in it does.
        writeSession({
          roomCode: nextRoomCode,
          name,
          role: 'host',
          gameId: null,
          joinedAt: Date.now(),
          lobbyConfig: {
            maxPlayers: initial.maxPlayers,
            setup: initial.setup,
            bots: initial.bots,
          },
        })
        setStatus('in-lobby')
        // The room code is the host peer id — known synchronously, so callers can
        // navigate straight to /lobby/:code without awaiting a roster round-trip.
        return nextRoomCode
      } catch (err) {
        if (!runtime.ownsTransport(attempt, owner)) {
          if (err instanceof Error && err.message === 'create cancelled') throw err
          throw new Error('create cancelled')
        }
        // createTransport rejects on a setup failure (taken peer id, signaling
        // server unreachable) WITHOUT going through onError, so surface it here —
        // otherwise status would stay 'connecting' forever. Re-throw so the
        // caller skips the post-await navigate.
        surfaceSetupError(err)
        throw err
      }
    },
    [
      chatSession,
      onMessage,
      onError,
      onDisconnect,
      commit,
      surfaceSetupError,
      teardownSession,
      runtime,
    ],
  )

  const joinRoom = useCallback(
    async (
      code: string,
      name: string,
      // Reports this specific dial's connection outcome — never read from a
      // ref, called directly from the per-call closures below the moment
      // the outcome is known. Only the guest reconnect loop passes one (its
      // own `settleAttempt`, one fresh instance per attempt); an ordinary,
      // player-initiated join passes nothing, so every call below is a
      // plain no-op for it.
      onDialOutcome?: (outcome: DialOutcome) => void,
      preserveSession = false,
    ) => {
      if (preserveSession) {
        const resources = runtime.matchResources
        resources.remote?.link.close()
        runtime.setMatchResources({ ...resources, remote: null })
        runtime.commitGameLink(null)
        const previousTransport = runtime.detachTransport()
        previousTransport?.close()
      } else {
        teardownSession()
      }
      const attempt = runtime.beginTransportAttempt()
      setStatus('connecting')
      setError(null)
      setErrorKind(null)
      hostConnectedRef.current = false
      const hostId = parseRoomCode(code)
      const nextRoomCode = formatRoomCode(hostId)
      // Snapshot the session generation so a Cancel/Home (leaveSession) during
      // the createTransport round-trip is detectable below.
      let owner: Transport | null = null
      try {
        const ownsTransport = () => runtime.ownsTransport(attempt, owner)
        const t = await createTransport({
          onMessage: (msg) => {
            if (ownsTransport()) onMessage(msg)
          },
          onError: (err) => {
            if (!ownsTransport()) return
            // The general error surfacing (status/errorKind) always applies —
            // onDialOutcome is a separate, additional notification, not a
            // gate on this.
            onError(err)
            onDialOutcome?.({ ok: false, error: err })
          },
          onDisconnect: (peerId) => {
            if (!ownsTransport()) return
            onDisconnect(peerId)
            onDialOutcome?.({ ok: false, error: new Error('host disconnected') })
          },
          onConnection: (peerId) => {
            if (!ownsTransport()) return
            // Send JOIN_REQUEST exactly when the host DataChannel opens — a
            // setTimeout(0) is not sufficient over real WebRTC because the channel
            // may not be open after a single macrotask. Only now is the join
            // confirmed, so flip to 'in-lobby' here rather than optimistically:
            // a bad/expired code never opens and surfaces as a PeerJS error.
            if (peerId === hostId) {
              hostConnectedRef.current = true
              dispatchOutgoing(owner, [joinRequest(hostId, name, getResumeToken(nextRoomCode))])
              setStatus('in-lobby')
              onDialOutcome?.({ ok: true })
            }
          },
        })
        owner = t
        // Torn down mid-await (Cancel/Home bumped the epoch and reset to idle):
        // discard the freshly-opened peer instead of committing it, or the
        // cancelled attempt resurrects — leaking a live peer and re-arming the
        // /start "continue game" button for a session the user just left.
        if (!runtime.attachTransport(attempt, t, false)) {
          t.close()
          throw new Error('join cancelled')
        }
        runtime.commitRoomCode(nextRoomCode)
        commit(
          createLobbyState({
            selfId: t.id,
            hostId,
            maxPlayers: 6,
            setup: DEFAULT_SETUP,
            peers: [
              {
                id: t.id,
                memberId: t.id,
                name,
                role: 'guest',
                ready: false,
                where: 'lobby',
              },
            ],
          }),
        )
        // The room code, not this peer's own id: the code is what a reload has
        // to dial, and this peer's id dies with the tab.
        writeSession({
          roomCode: nextRoomCode,
          name,
          role: 'guest',
          gameId: preserveSession ? (runtime.gameId ?? readSession()?.gameId ?? null) : null,
          joinedAt: Date.now(),
        })
        t.connectTo(hostId)
        // The code resolves to the host id synchronously (parseRoomCode), so the
        // caller can route to /lobby/:code immediately; a bad code surfaces later
        // as a connection error on that same route.
        return nextRoomCode
      } catch (err) {
        // A cancellation (epoch bumped) already reset the session to idle — don't
        // overwrite that with an error state; just propagate so the caller skips
        // the post-await navigate.
        if (!runtime.ownsTransport(attempt, owner)) throw err
        // Peer setup failed before opening (bad code, signaling unreachable);
        // surface it instead of leaving the form stuck on 'connecting', and
        // re-throw so the caller skips the post-await navigate.
        surfaceSetupError(err)
        throw err
      }
    },
    [onMessage, onError, onDisconnect, commit, surfaceSetupError, teardownSession, runtime],
  )

  // Runs once on mount, before anything else can create a transport. A stored
  // session whose role is 'host' and whose keeper snapshot matches its gameId
  // is a match this browser was keeping when the tab went away — everything
  // else (no record, a guest's record, a room with no match running, a
  // snapshot left over from a different match) is not this restore's problem
  // and is left for the caller (a guest's own reconnect belongs to a later
  // task).
  const restoreHost = useCallback(async (): Promise<boolean> => {
    const stored = readSession()
    const snapshot = readKeeper()
    if (stored?.role !== 'host') return false
    const rejectStoredMatch = () => {
      clearKeeper()
      clearSession()
      return false
    }
    if (!isNonEmptyString(stored.roomCode)) return rejectStoredMatch()
    const hostPeerId = parseRoomCode(stored.roomCode)
    if (!hostPeerId) return rejectStoredMatch()
    const engine = stored.gameId ? createFakeEngine() : null
    const normalized =
      stored.gameId && snapshot && engine
        ? normalizeKeeperSnapshot(snapshot, stored.gameId, hostPeerId, engine)
        : null
    if (stored.gameId && !normalized) return rejectStoredMatch()
    if (!stored.gameId) clearKeeper()
    const transportAttempt = runtime.beginTransportAttempt()
    let owner: Transport | null = null
    const ownsTransport = () => runtime.ownsTransport(transportAttempt, owner)

    setStatus('connecting')
    setError(null)
    setErrorKind(null)
    // The host's half of the reconnect overlay: true for the whole span below,
    // cleared in the finally so every exit path — success, spent retries, a
    // teardown racing the retry loop — leaves it false rather than stuck true.
    setRestoring(true)
    try {
      // A fast reload can leave the signaling broker still holding the old
      // registration under this exact peer id, which PeerJS reports as
      // 'unavailable-id' — it frees itself moments later. Retried rather than
      // surfaced immediately: reclaiming this EXACT id is the whole point,
      // since the room code IS that id and a fresh one would strand every
      // peer still dialing the old one.
      let t: Transport | null = null
      let lastErr: unknown
      for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        try {
          t = await createTransport({
            peerId: hostPeerId,
            onMessage: (msg) => {
              if (ownsTransport()) onMessage(msg)
            },
            onError: (err) => {
              if (ownsTransport()) onError(err)
            },
            onDisconnect: (peerId) => {
              if (ownsTransport()) onDisconnect(peerId)
            },
          })
          owner = t
          break
        } catch (err) {
          lastErr = err
          if (attempt === MAX_RECONNECT_ATTEMPTS) break
          await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
        }
      }
      if (!t) {
        // Every attempt spent without going through onError (a rejected
        // createTransport bypasses it), so surface it here or 'connecting'
        // spins forever.
        if (runtime.ownsTransport(transportAttempt, owner)) surfaceSetupError(lastErr)
        return false
      }
      if (!runtime.attachTransport(transportAttempt, t, true)) {
        // Torn down while this was retrying: discard the freshly-opened peer
        // instead of committing it, or the abandoned attempt resurrects.
        t.close()
        return false
      }

      runtime.commitRoomCode(stored.roomCode)
      const hostResumeToken = getResumeToken(stored.roomCode)
      const hostMemberId = chatSession.restoreHost(stored.roomCode, hostResumeToken)

      if (!stored.gameId) {
        const lobbyConfig = normalizeLobbyConfig(stored.lobbyConfig)
        applySeats([], [])
        runtime.replaceResumeTokens(new Map([[t.id, hostResumeToken]]))
        const restoredLobby = createLobbyState({
          selfId: t.id,
          hostId: t.id,
          maxPlayers: lobbyConfig?.maxPlayers ?? 6,
          bots: lobbyConfig?.bots ?? 0,
          setup: lobbyConfig?.setup ?? DEFAULT_SETUP,
          peers: [
            {
              id: t.id,
              memberId: hostMemberId,
              name: stored.name,
              role: 'host',
              ready: true,
              where: 'lobby',
            },
          ],
        })
        commit(restoredLobby)
        rememberLobbyConfig(restoredLobby)
        runtime.commitGameId(null)
        setStatus('in-lobby')
        return true
      }

      if (!normalized || !engine) {
        t.close()
        return rejectStoredMatch()
      }
      // Only the host is here; everyone else re-dials. Their JOIN_REQUEST
      // carries the resume token that puts them back in their seat.
      const lobbyConfig = normalized.lobbyConfig
      commit(
        createLobbyState({
          selfId: t.id,
          hostId: t.id,
          maxPlayers: lobbyConfig?.maxPlayers ?? 6,
          bots: lobbyConfig?.bots ?? 0,
          setup: (lobbyConfig?.setup as Setup | undefined) ?? normalized.state.setup,
          peers: [
            {
              id: t.id,
              memberId: hostMemberId,
              name: stored.name,
              role: 'host',
              ready: true,
              where: 'game',
            },
          ],
        }),
      )
      matchController.attachRestored({ snapshot: normalized, engine, transport: t })
      setStatus('in-lobby')
      return true
    } finally {
      setRestoring(false)
    }
  }, [
    chatSession,
    onMessage,
    onError,
    onDisconnect,
    commit,
    applySeats,
    matchController,
    rememberLobbyConfig,
    surfaceSetupError,
    runtime,
  ])

  const pushReconnectEvent = useCallback((kind: ReconnectEvent['kind'], attempt: number) => {
    setReconnectEvents((prev) => [...prev, { kind, attempt, at: Date.now() }])
  }, [])

  // A guest's half of the mount-time restore (restoreHost is the host's). Only
  // ever runs when restoreHost has already declined the session — the two are
  // exclusive, never both. Unlike restoreHost, there is nothing to adopt
  // locally: the host already owns this peer's seat, and re-dialling through
  // joinRoom (which sends JOIN_REQUEST with this browser's resume token) is what
  // gets it back — a lobby reload and a mid-match reload are the same re-dial,
  // since `stored.gameId` only decides where the host seats the returner, not
  // whether one happens.
  const runGuestReconnect = useCallback(async () => {
    const stored = reconnectSessionRef.current
    if (!stored) return
    // Bumped before anything awaits, so a retry() fired mid-run (mid-backoff,
    // typically) supersedes this run rather than racing it — every check below
    // reads it back after each await. `sessionEpoch` is the separate teardown
    // guard: leaveSession() must stop this loop the same way it stops
    // restoreHost's, even though nothing here mutates the ref directly.
    const reconnect = runtime.beginReconnectAttempt()
    setReconnectStatus('trying')
    setReconnectAttempt(0)
    setReconnectEvents([])

    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (!runtime.ownsReconnect(reconnect)) return
      setReconnectAttempt(attempt)
      pushReconnectEvent('dialing', attempt)

      // A fresh token identifying THIS dial. Used only to key
      // reconnectPendingRef below (installed for leaveSession's benefit,
      // never read by joinRoom) — the settle handle itself is the plain
      // local closure right after it, reachable by nothing outside this one
      // iteration.
      const dialToken = ++reconnectDialRef.current

      // This attempt's own settle handle — local to this one iteration of
      // the loop, never written to any shared ref. `settleAttempt` is
      // handed straight to joinRoom as `onDialOutcome`, so its own
      // onConnection/onError/onDisconnect closures call it directly; no
      // other attempt, past or future, has any way to reach it. The
      // `alreadySettled` guard is what gives it Promise-like "first call
      // wins" semantics without actually needing a Promise for the plumbing.
      let alreadySettled = false
      let resolveAttempt: (() => void) | undefined
      let rejectAttempt: ((err: unknown) => void) | undefined
      const settled = new Promise<void>((resolve, reject) => {
        resolveAttempt = resolve
        rejectAttempt = reject
      })
      const settleAttempt = (outcome: DialOutcome) => {
        if (alreadySettled) return
        alreadySettled = true
        if (outcome.ok) resolveAttempt?.()
        else rejectAttempt?.(outcome.error)
      }
      // The one place this attempt's handle becomes reachable from outside
      // this closure — installed so leaveSession (a different function
      // entirely) can still unstick it if the player leaves while it's
      // genuinely in flight. Keyed by dialToken: leaveSession itself reads
      // whatever is current without a key of its own (see its own comment),
      // but every WRITE here — this install, and the self-keyed clear in
      // the finally below — only ever touches the entry it itself owns.
      reconnectPendingRef.current = { token: dialToken, settle: settleAttempt }

      let connected = false
      try {
        await joinRoom(stored.roomCode, stored.name, settleAttempt, true)
        if (runtime.ownsReconnect(reconnect)) {
          await settled
          connected = true
        }
      } catch {
        // Handled below via `connected` staying false — a thrown setup
        // failure (joinRoom) and a rejected `settled` (a real connection
        // failure) are both just "this attempt didn't make it."
      } finally {
        // Self-keyed: only clear the entry if it is still the one THIS
        // attempt installed. A newer attempt (retry(), or the loop's own
        // next iteration) may already have installed its own by the time
        // this runs — e.g. when this attempt's epoch check above declined
        // to even await `settled` — and that entry must survive this
        // attempt's own cleanup untouched.
        if (reconnectPendingRef.current?.token === dialToken) {
          reconnectPendingRef.current = null
        }
      }

      if (!runtime.ownsReconnect(reconnect)) return

      if (connected) {
        pushReconnectEvent('channel-open', attempt)
        pushReconnectEvent('handshake', attempt)
        // Done: cleared back to idle so a working table never sits under a
        // reconnect overlay that thinks it is still trying. The stored
        // session is cleared too — a retry() fired after this point (a stray
        // double-invoke, or anything reaching this callback outside the
        // 'trying'/'failed' gate retryReconnect enforces below) must find
        // nothing to re-dial rather than tearing down a live, working
        // transport. Belt-and-braces alongside that gate, not a substitute
        // for it: this is what makes the gate's premise ("idle means nothing
        // to retry") actually true.
        reconnectSessionRef.current = null
        setReconnectStatus('idle')
        return
      }

      if (attempt === MAX_RECONNECT_ATTEMPTS) {
        pushReconnectEvent('failed', attempt)
        setReconnectStatus('failed')
        return
      }
      pushReconnectEvent('backoff', attempt)
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)))
    }
  }, [joinRoom, pushReconnectEvent, runtime])

  // Starts a fresh run from attempt 1. Guarded to only actually start one
  // while the previous run is 'trying' or 'failed' — the overlay's retry
  // button calls this directly, so a stray double-invoke (or any other path
  // reaching this outside those two states) must not re-enter the loop once
  // a run has already succeeded ('idle') or nothing was ever offered to
  // reconnect in the first place. A no-op silently, matching restoreHost/
  // joinRoom's own "nothing to do" silence rather than throwing.
  // Published for `onDisconnect` above, which cannot close over it directly.
  runGuestReconnectRef.current = runGuestReconnect

  const retryReconnect = useCallback(() => {
    if (reconnectStatus !== 'trying' && reconnectStatus !== 'failed') return
    void runGuestReconnect()
  }, [runGuestReconnect, reconnectStatus])

  // Once per mount, before any screen can act. A restore that finds nothing
  // stored is a no-op, so this is safe on a cold start. Guest reconnect only
  // runs once restoreHost has declined the session — the two are exclusive,
  // and a host session that DID restore has nothing left for a guest re-dial
  // to do.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void (async () => {
      const hostRestored = await restoreHost()
      if (hostRestored) return
      const stored = readSession()
      if (stored?.role !== 'guest') return
      reconnectSessionRef.current = stored
      await runGuestReconnect()
    })()
  }, [restoreHost, runGuestReconnect])

  // Tear the session down: close the PeerJS transport and reset to idle. Without
  // this, navigating away leaves the connection open and the state alive, so the
  // user is bounced back into their old session. `flushMs` defers only the
  // transport close (state resets immediately) so a final broadcast can flush
  // over the DataChannels before peer.destroy() — see disband().
  const leaveSession = useCallback(
    (flushMs?: number) => {
      teardownSession(flushMs)
    },
    [teardownSession],
  )
  leaveSessionRef.current = leaveSession

  const actionsController = useMemo(
    () =>
      createLobbyActionsController({
        runtime,
        chat: chatController,
        dispatch,
        rememberLobbyConfig,
        leaveSession,
      }),
    [chatController, dispatch, leaveSession, rememberLobbyConfig, runtime],
  )
  const sendChat = chatController.send
  const { ready, setWhere, kick, setMaxPlayers, setBots, transferHost, setSetup, disband } =
    actionsController

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
  //
  // What is stored follows the same split, for the same reason: leaving the
  // match is not leaving the room. The keeper snapshot goes — it describes a
  // match this peer is done with, and a reload finding it would put them back
  // on a board they walked off — while the session record stays, minus its
  // gameId, so the room itself is still restorable. The pending write is
  // cancelled first: a snapshot still on its trailing edge would otherwise land
  // behind the clear and resurrect exactly what was deleted.
  //
  // Nothing rewrites it afterwards. The keeper deliberately stays alive here,
  // but the only caller is the results screen (pages/board/[gameId]/stats.tsx),
  // reached once the match is over — and `tick` and `driveUnattended` both no-op on
  // a finished game, so its commits are reference-identical and never queue a
  // write.
  const leaveGame = matchController.leaveGame

  const startGame = matchController.start
  const introReady = matchController.introReady
  const previewPick = matchController.previewPick

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
      restoring,
      reconnect: {
        attempt: reconnectAttempt,
        maxAttempts: MAX_RECONNECT_ATTEMPTS,
        status: reconnectStatus,
        events: reconnectEvents,
        retry: retryReconnect,
      },
      roomCode,
      isHost,
      canStart: state ? canStartFn(state) : false,
      gameId,
      gameLink,
      gameSync,
      seats,
      error,
      errorKind,
      chat: {
        entries: chatSession.entries,
        notificationEntryIds: chatSession.notificationEntryIds,
        selfMemberId: chatSession.selfMemberId,
        send: sendChat,
      },
      createRoom,
      joinRoom,
      ready,
      setWhere,
      kick,
      setMaxPlayers,
      setBots,
      transferHost,
      setSetup,
      startGame,
      introReady,
      previewPick,
      pickPreview,
      disband,
      leaveSession,
      leaveGame,
      clearError,
    }),
    [
      state,
      status,
      restoring,
      reconnectAttempt,
      reconnectStatus,
      reconnectEvents,
      retryReconnect,
      roomCode,
      isHost,
      gameId,
      gameLink,
      gameSync,
      seats,
      error,
      errorKind,
      chatSession.entries,
      chatSession.notificationEntryIds,
      chatSession.selfMemberId,
      sendChat,
      createRoom,
      joinRoom,
      ready,
      setWhere,
      kick,
      setMaxPlayers,
      setBots,
      transferHost,
      setSetup,
      startGame,
      introReady,
      previewPick,
      pickPreview,
      disband,
      leaveSession,
      leaveGame,
      clearError,
    ],
  )
}
