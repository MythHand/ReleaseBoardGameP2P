import type { ChatEntry } from '~/shared/chat/types'
import type { Transport } from '../transport/peer'
import type { PeerInfo, Seat } from '../types'
import {
  chatEntry,
  chatHistory,
  chatSend,
  dispatchOutgoing,
  gameStarting,
  introReady,
  joinRequest,
  lobbyConfigUpdated,
  peerJoined,
  peerList,
  pickPreview,
  playerKicked,
  playerReady,
  seatRebound,
  toBroadcast,
  toPeer,
  whereabouts,
} from './messages'

const peer: PeerInfo = {
  id: 'peer-b',
  memberId: 'member-b',
  name: 'Bo',
  role: 'player',
  ready: true,
  where: 'lobby',
}

const seat: Seat = { playerId: 'p2', peerId: 'peer-b', name: 'Bo' }

const entry: ChatEntry = {
  id: 'chat-1',
  sequence: 1,
  kind: 'message',
  createdAt: 1_000,
  author: { memberId: 'member-b', name: 'Bo', role: 'player' },
  text: 'hello',
}

it('wraps direct and broadcast messages without changing their payload', () => {
  const message = { type: 'PLAYER_READY' as const, payload: {} }

  expect(toPeer('host', message)).toEqual({ to: 'host', message })
  expect(toBroadcast(message)).toEqual({ to: 'broadcast', message })
})

it('builds lobby protocol frames with their intended targets', () => {
  expect(playerKicked('peer-b', 'removed')).toEqual({
    to: 'broadcast',
    message: { type: 'PLAYER_KICKED', payload: { peerId: 'peer-b', reason: 'removed' } },
  })
  expect(peerList('peer-b', [peer], 'player')).toEqual({
    to: 'peer-b',
    message: { type: 'PEER_LIST', payload: { peers: [peer], yourRole: 'player' } },
  })
  expect(peerJoined(peer)).toEqual({
    to: 'broadcast',
    message: { type: 'PEER_JOINED', payload: peer },
  })
  expect(lobbyConfigUpdated('peer-b', { maxPlayers: 4, bots: 1 })).toEqual({
    to: 'peer-b',
    message: {
      type: 'LOBBY_CONFIG_UPDATED',
      payload: { maxPlayers: 4, bots: 1 },
    },
  })
  expect(seatRebound('p2', 'peer-b')).toEqual({
    to: 'broadcast',
    message: { type: 'SEAT_REBOUND', payload: { playerId: 'p2', peerId: 'peer-b' } },
  })
  expect(playerReady('host')).toEqual({
    to: 'host',
    message: { type: 'PLAYER_READY', payload: {} },
  })
  expect(whereabouts('host', 'stats')).toEqual({
    to: 'host',
    message: { type: 'WHEREABOUTS', payload: { where: 'stats' } },
  })
})

it('builds chat protocol frames with canonical payloads', () => {
  expect(chatHistory('peer-b', [entry], 'member-b')).toEqual({
    to: 'peer-b',
    message: {
      type: 'CHAT_HISTORY',
      payload: { entries: [entry], selfMemberId: 'member-b' },
    },
  })
  expect(chatEntry(entry)).toEqual({
    to: 'broadcast',
    message: { type: 'CHAT_ENTRY', payload: { entry } },
  })
  expect(chatSend('host', 'hello')).toEqual({
    to: 'host',
    message: { type: 'CHAT_SEND', payload: { text: 'hello' } },
  })
  expect(joinRequest('host', 'Bo', 'resume-b')).toEqual({
    to: 'host',
    message: {
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: 'resume-b' },
    },
  })
})

it('builds match protocol frames with their intended targets', () => {
  expect(gameStarting('broadcast', 'game-1', [seat])).toEqual({
    to: 'broadcast',
    message: { type: 'GAME_STARTING', payload: { gameId: 'game-1', seats: [seat] } },
  })
  expect(introReady('host', 'game-1')).toEqual({
    to: 'host',
    message: { type: 'INTRO_READY', payload: { gameId: 'game-1' } },
  })
  expect(pickPreview('host', 'game-1', 'p2', 'card-1')).toEqual({
    to: 'host',
    message: {
      type: 'PICK_PREVIEW',
      payload: { gameId: 'game-1', player: 'p2', card: 'card-1' },
    },
  })
})

it('dispatches direct and broadcast frames in list order', () => {
  const send = vi.fn()
  const broadcast = vi.fn()
  const transport = { send, broadcast } as unknown as Transport

  dispatchOutgoing(transport, [playerReady('host'), playerKicked('peer-b')])

  expect(send).toHaveBeenCalledWith('host', { type: 'PLAYER_READY', payload: {} })
  expect(broadcast).toHaveBeenCalledWith({
    type: 'PLAYER_KICKED',
    payload: { peerId: 'peer-b', reason: undefined },
  })
  expect(send.mock.invocationCallOrder[0]).toBeLessThan(broadcast.mock.invocationCallOrder[0])
})

it('does nothing when no transport owns the outgoing frames', () => {
  expect(() => dispatchOutgoing(null, [playerReady('host')])).not.toThrow()
})
