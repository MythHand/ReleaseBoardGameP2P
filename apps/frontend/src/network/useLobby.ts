import type { PlayerId } from '@release/engine'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearKeeper,
  clearSession,
  readSession,
  type StoredLobbyConfig,
  writeSession,
} from '~/shared/lib/persistence'
import { createChatController } from './chat/controller'
import { type RoomChatState, useChatSession } from './chat/useChatSession'
import { createLobbyActionsController } from './lobby/actionsController'
import {
  createConnectionController,
  type ErrorKind,
  type LobbyStatus,
} from './lobby/connectionController'
import { canStart as canStartFn } from './lobby/host'
import { createMessageController } from './lobby/messageController'
import { dispatchOutgoing, type Outgoing } from './lobby/messages'
import { createRoomRuntime, type PickPreview } from './lobby/runtime'
import type { LobbyState } from './lobby/state'
import type { GameLink, Sync } from './session/link'
import { createMatchController } from './session/matchController'
import { createKeeperWriter } from './session/persistence'
import { MAX_RECONNECT_ATTEMPTS, type ReconnectEvent } from './session/reconnect'
import type { Seat, Setup, Where } from './types'

export type { ErrorKind, LobbyStatus } from './lobby/connectionController'
export { formatRoomCode, makeRoomCode, parseRoomCode } from './lobby/roomCode'
export { KEEPER_SAVE_MS, matchSeqAfterRestore } from './session/persistence'

// Semantic classification of a session failure, so the UI can show localized
// copy instead of the raw English PeerJS string. 'not-found' is specifically
// "no host answers to this code" (PeerJS `peer-unavailable`); everything else
// is a connection problem.

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
  const hostConnectedRef = useRef(false)
  const leaveSessionRef = useRef<() => void>(() => {})

  const [reconnectStatus, setReconnectStatus] = useState<'idle' | 'trying' | 'failed'>('idle')
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [reconnectEvents, setReconnectEvents] = useState<ReconnectEvent[]>([])

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
    keeperWriter.cancel()
    clearSession()
    clearKeeper()
  }, [keeperWriter])

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
  const messageController = useMemo(
    () =>
      createMessageController({
        runtime,
        chat: chatController,
        match: matchController,
        dispatch,
        forgetStored,
        setStatus,
        leaveSession: () => leaveSessionRef.current(),
      }),
    [chatController, dispatch, forgetStored, matchController, runtime],
  )

  const connectionController = useMemo(
    () =>
      createConnectionController({
        runtime,
        message: messageController,
        match: matchController,
        chat: chatController,
        chatSession: {
          startHost: chatSession.startHost,
          restoreHost: chatSession.restoreHost,
        },
        keeperWriter,
        view: {
          status: setStatus,
          restoring: setRestoring,
          error: (message, kind) => {
            setError(message)
            setErrorKind(kind)
          },
          hostConnected: (connected) => {
            hostConnectedRef.current = connected
          },
          reconnect: (next) => {
            setReconnectStatus(next.status)
            setReconnectAttempt(next.attempt)
            setReconnectEvents(next.events)
          },
        },
      }),
    [
      chatController,
      chatSession.restoreHost,
      chatSession.startHost,
      keeperWriter,
      matchController,
      messageController,
      runtime,
    ],
  )
  const createRoom = connectionController.createRoom
  const joinRoom = connectionController.joinRoom
  const retryReconnect = connectionController.retryReconnect
  const leaveSession = connectionController.leaveSession
  const clearError = connectionController.clearError
  leaveSessionRef.current = leaveSession

  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void connectionController.restoreOnMount()
  }, [connectionController])

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
