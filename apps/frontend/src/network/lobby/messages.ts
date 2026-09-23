import type { PlayerId } from '@release/engine'
import type { ChatEntry, MemberId } from '~/shared/chat/types'
import type { Transport } from '../transport/peer'
import type { Message, PeerInfo, Role, Seat, Setup, Where } from '../types'

export interface Outgoing {
  to: string | 'broadcast'
  message: Message
}

export function toPeer(to: string, message: Message): Outgoing {
  return { to, message }
}

export function toBroadcast(message: Message): Outgoing {
  return { to: 'broadcast', message }
}

export function playerKicked(peerId: string, reason?: string): Outgoing {
  return toBroadcast({ type: 'PLAYER_KICKED', payload: { peerId, reason } })
}

export function peerList(to: string, peers: PeerInfo[], yourRole: Role): Outgoing {
  return toPeer(to, { type: 'PEER_LIST', payload: { peers, yourRole } })
}

export function peerJoined(peer: PeerInfo): Outgoing {
  return toBroadcast({ type: 'PEER_JOINED', payload: peer })
}

export function lobbyConfigUpdated(
  to: string | 'broadcast',
  config: { maxPlayers?: number; setup?: Setup; bots?: number },
): Outgoing {
  const message: Message = { type: 'LOBBY_CONFIG_UPDATED', payload: config }
  if (to === 'broadcast') return toBroadcast(message)
  return toPeer(to, message)
}

export function seatRebound(playerId: PlayerId, peerId: string): Outgoing {
  return toBroadcast({ type: 'SEAT_REBOUND', payload: { playerId, peerId } })
}

export function chatHistory(to: string, entries: ChatEntry[], selfMemberId: MemberId): Outgoing {
  return toPeer(to, { type: 'CHAT_HISTORY', payload: { entries, selfMemberId } })
}

export function chatEntry(entry: ChatEntry): Outgoing {
  return toBroadcast({ type: 'CHAT_ENTRY', payload: { entry } })
}

export function gameStarting(to: string | 'broadcast', gameId: string, seats: Seat[]): Outgoing {
  const message: Message = { type: 'GAME_STARTING', payload: { gameId, seats } }
  if (to === 'broadcast') return toBroadcast(message)
  return toPeer(to, message)
}

export function playerReady(to: string): Outgoing {
  return toPeer(to, { type: 'PLAYER_READY', payload: {} })
}

export function whereabouts(to: string, where: Where): Outgoing {
  return toPeer(to, { type: 'WHEREABOUTS', payload: { where } })
}

export function chatSend(to: string, text: string): Outgoing {
  return toPeer(to, { type: 'CHAT_SEND', payload: { text } })
}

export function joinRequest(to: string, name: string, resumeToken: string): Outgoing {
  return toPeer(to, { type: 'JOIN_REQUEST', payload: { name, resumeToken } })
}

export function introReady(to: string, gameId: string): Outgoing {
  return toPeer(to, { type: 'INTRO_READY', payload: { gameId } })
}

export function pickPreview(
  to: string | 'broadcast',
  gameId: string,
  player: PlayerId,
  card: string | null,
): Outgoing {
  const message: Message = { type: 'PICK_PREVIEW', payload: { gameId, player, card } }
  if (to === 'broadcast') return toBroadcast(message)
  return toPeer(to, message)
}

export function dispatchOutgoing(transport: Transport | null, outgoing: Outgoing[]): void {
  if (!transport) return
  for (const item of outgoing) {
    if (item.to === 'broadcast') transport.broadcast(item.message)
    else transport.send(item.to, item.message)
  }
}
