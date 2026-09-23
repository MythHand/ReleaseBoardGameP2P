// Room codes double as the host's PeerJS id, so the displayed code is exactly
// what a joiner connects to. Ambiguous characters are omitted.
const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function makeRoomCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('')
}

export function formatRoomCode(peerId: string): string {
  const head = peerId.slice(0, 6).toUpperCase()
  return head.length > 3 ? `${head.slice(0, 3)}-${head.slice(3)}` : head
}

export function parseRoomCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, '').toLowerCase()
}
