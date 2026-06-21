import type { WebSocket } from 'ws'

// Per-session set of connected sockets; relays signaling payloads peer-to-peer.
const rooms = new Map<string, Set<WebSocket>>()

export function joinRoom(sessionId: string, socket: WebSocket): void {
  let room = rooms.get(sessionId)
  if (!room) {
    room = new Set()
    rooms.set(sessionId, room)
  }
  room.add(socket)
}

export function leaveRoom(sessionId: string, socket: WebSocket): void {
  const room = rooms.get(sessionId)
  if (!room) return
  room.delete(socket)
  if (room.size === 0) rooms.delete(sessionId)
}

// Broadcast a raw signaling message to every OTHER peer in the room.
export function relay(sessionId: string, from: WebSocket, data: string): void {
  const room = rooms.get(sessionId)
  if (!room) return
  for (const peer of room) {
    if (peer !== from && peer.readyState === peer.OPEN) peer.send(data)
  }
}
