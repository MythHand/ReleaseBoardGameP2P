import type { Engine, PlayerId } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { botSeats, privateSeatsFor, publicSeats, seatOf, seatsFor } from '~/entities/game/seats'
import { gameStarting, introReady, type Outgoing, pickPreview } from '../lobby/messages'
import type { RoomRuntime } from '../lobby/runtime'
import { effectiveBots } from '../lobby/state'
import type { Transport } from '../transport/peer'
import type { Seat, WireMessage } from '../types'
import type { GameLink } from './link'
import {
  type KeeperWriter,
  matchSeqAfterRestore,
  type NormalizedKeeperSnapshot,
} from './persistence'
import { adoptSession, createSession, type Session, type SessionRef } from './referee'
import { attachKeeper, createRemoteLink } from './remoteLink'
import { restoreSeats } from './restore'
import { createStartGate } from './startGate'

export interface MatchController {
  start(botNames: string[]): void
  followStart(gameId: string, seats: Seat[]): void
  reboundSeat(playerId: PlayerId, peerId: string): void
  receiveSync(message: Extract<WireMessage, { type: 'SYNC' | 'KEEPER_CHANGED' }>): void
  attachRestored(input: {
    snapshot: NormalizedKeeperSnapshot
    engine: Engine
    transport: Transport
  }): GameLink
  returnSeat(input: { seat: Seat; peerId: string; resumeToken: string }): void
  peerLeft(peerId: string): void
  introReady(): void
  previewPick(player: PlayerId, card: string | null): void
  leaveGame(): void
  teardownRoom(): void
}

interface MatchControllerDependencies {
  runtime: RoomRuntime
  keeperWriter: KeeperWriter
  dispatch(outgoing: Outgoing[]): void
  rememberGame(gameId: string | null): void
  clearKeeper(): void
}

export function createMatchController({
  runtime,
  keeperWriter,
  dispatch,
  rememberGame,
  clearKeeper,
}: MatchControllerDependencies): MatchController {
  let matchSequence = 0
  let matchHostId: string | null = null

  const persist = (session: Session) => {
    keeperWriter.queue(session, runtime.privateSeats, runtime.lobby)
  }

  const attachNewMatch = (input: {
    gameId: string
    keeperId: PlayerId
    players: { playerId: PlayerId; peerId: string | null; name: string; bot?: boolean }[]
    transport: Transport
    gateExpect: PlayerId[]
  }) => {
    const engine = createFakeEngine()
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const { session } = createSession({
      gameId: input.gameId,
      keeperId: input.keeperId,
      engine,
      seed,
      players: input.players,
      setup: runtime.lobby?.setup ?? {},
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    })
    const ref: SessionRef = { current: session }
    const gate = createStartGate({ expect: input.gateExpect })
    const keeper = attachKeeper({
      ref,
      transport: input.transport,
      now: Date.now,
      gate,
      onCommit: persist,
    })
    runtime.setMatchResources({ sessionRef: ref, keeper, remote: null, gate })
    keeper.link.subscribe(runtime.commitGameSync)
    runtime.commitGameLink(keeper.link)
    return { engine, keeper, session }
  }

  return {
    start(botNames) {
      const lobby = runtime.lobby
      const transport = runtime.transport
      if (!lobby || !transport || !runtime.isHost) return
      if (matchHostId !== lobby.hostId) {
        matchHostId = lobby.hostId
        matchSequence = 0
      }
      matchSequence += 1
      const gameId = `${lobby.hostId}-${matchSequence}`
      const humans = seatsFor(lobby.peers)
      const mine = seatOf(humans, lobby.selfId)
      if (!mine) return
      const botCount = Math.min(effectiveBots(lobby), botNames.length)
      const dealt = [...humans, ...botSeats(botCount, humans.length, botNames)]
      const privateSeats = privateSeatsFor(dealt, runtime.resumeTokens)
      const refereeSeats = dealt.map((seat) => (seat.bot ? { ...seat, peerId: null } : seat))

      runtime.closeMatchResources({ clearView: false })
      const { engine, keeper, session } = attachNewMatch({
        gameId,
        keeperId: mine.playerId,
        players: refereeSeats,
        transport,
        gateExpect: humans.map((seat) => seat.playerId),
      })

      dispatch([gameStarting('broadcast', gameId, dealt)])
      runtime.commitGameId(gameId)
      rememberGame(gameId)
      runtime.commitSeats(dealt, privateSeats)
      keeper.resync(engine.setupEvents(session.state))
    },

    followStart(gameId, seats) {
      const transport = runtime.transport
      const lobby = runtime.lobby
      if (!transport || !lobby) return
      if (!runtime.matchResources.remote) {
        const remote = createRemoteLink({ transport, keeperPeerId: lobby.hostId })
        runtime.setMatchResources({ ...runtime.matchResources, remote })
        remote.link.subscribe(runtime.commitGameSync)
        runtime.commitGameLink(remote.link)
      }
      if (gameId !== runtime.gameId) runtime.commitGameSync(null)
      runtime.commitSeats(seats)
      runtime.commitGameId(gameId)
      rememberGame(gameId)
    },

    reboundSeat(playerId, peerId) {
      runtime.commitSeats(
        runtime.seats.map((seat) => (seat.playerId === playerId ? { ...seat, peerId } : seat)),
      )
    },

    receiveSync(message) {
      runtime.matchResources.remote?.handleMessage(message)
    },

    attachRestored({ snapshot, engine, transport }) {
      runtime.commitSeats(publicSeats(snapshot.privateSeats), snapshot.privateSeats)
      const resumeTokens = new Map<string, string>()
      for (const { seat, resumeToken } of snapshot.privateSeats) {
        if (resumeToken !== null) resumeTokens.set(seat.peerId, resumeToken)
      }
      runtime.replaceResumeTokens(resumeTokens)
      const session = adoptSession({
        state: snapshot.state,
        gameId: snapshot.gameId,
        keeperId: snapshot.keeperId,
        engine,
        seats: restoreSeats(snapshot.seats, transport.id, Date.now()),
        log: snapshot.log,
      })
      const ref: SessionRef = { current: session }
      const keeper = attachKeeper({
        ref,
        transport,
        now: Date.now,
        onCommit: persist,
      })
      runtime.setMatchResources({ sessionRef: ref, keeper, remote: null, gate: null })
      keeper.link.subscribe(runtime.commitGameSync)
      runtime.commitGameLink(keeper.link)
      keeper.resync()
      runtime.commitGameId(snapshot.gameId)
      matchHostId = transport.id
      matchSequence = matchSeqAfterRestore(snapshot.gameId)
      return keeper.link
    },

    returnSeat({ seat, peerId, resumeToken }) {
      const gameId = runtime.gameId
      if (!gameId) return
      const stalePeerId = seat.peerId
      const reboundSeats = runtime.seats.map((candidate) =>
        candidate.playerId === seat.playerId ? { ...candidate, peerId } : candidate,
      )
      const privateSeats = runtime.privateSeats.map((candidate) =>
        candidate.seat.playerId === seat.playerId
          ? { ...candidate, seat: { ...candidate.seat, peerId } }
          : candidate,
      )
      const resumeTokens = new Map(runtime.resumeTokens)
      resumeTokens.delete(stalePeerId)
      resumeTokens.set(peerId, resumeToken)
      runtime.replaceResumeTokens(resumeTokens)
      runtime.commitSeats(reboundSeats, privateSeats)
      dispatch([gameStarting(peerId, gameId, reboundSeats)])
      if (stalePeerId !== peerId) runtime.matchResources.keeper?.peerLeft(stalePeerId)
      runtime.matchResources.keeper?.peerReturned(seat.playerId, peerId)
    },

    peerLeft(peerId) {
      runtime.matchResources.keeper?.peerLeft(peerId)
    },

    introReady() {
      const gameId = runtime.gameId
      const lobby = runtime.lobby
      if (!gameId || !lobby) return
      if (runtime.isHost) {
        const transport = runtime.transport
        if (transport) runtime.matchResources.keeper?.introReady(transport.id)
        return
      }
      dispatch([introReady(lobby.hostId, gameId)])
    },

    previewPick(player, card) {
      const gameId = runtime.gameId
      const lobby = runtime.lobby
      if (!gameId || !lobby) return
      const target = runtime.isHost ? 'broadcast' : lobby.hostId
      dispatch([pickPreview(target, gameId, player, card)])
    },

    leaveGame() {
      runtime.commitGameId(null)
      keeperWriter.cancel()
      clearKeeper()
      rememberGame(null)
    },

    teardownRoom() {
      runtime.closeMatchResources({ clearView: true })
      runtime.commitSeats([], [])
    },
  }
}
