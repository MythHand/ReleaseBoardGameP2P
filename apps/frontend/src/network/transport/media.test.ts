import type { Peer } from 'peerjs'
import { expect, it, vi } from 'vitest'
import { createMediaPort } from './media'

class Emitter {
  handlers = new Map<string, Set<(value: unknown) => void>>()
  on(name: string, callback: (value: unknown) => void) {
    const list = this.handlers.get(name) ?? new Set()
    list.add(callback)
    this.handlers.set(name, list)
  }
  off(name: string, callback: (value: unknown) => void) {
    this.handlers.get(name)?.delete(callback)
  }
  emit(name: string, value?: unknown) {
    for (const callback of this.handlers.get(name) ?? []) callback(value)
  }
}
class Call extends Emitter {
  peer = 'remote'
  connectionId = 'call-1'
  metadata = { version: 1, callerSessionId: 'a', calleeSessionId: 'b' }
  answer = vi.fn()
  close = vi.fn()
  sender = { track: { kind: 'audio' }, replaceTrack: vi.fn().mockResolvedValue(undefined) }
  peerConnection = Object.assign(new EventTarget(), {
    getSenders: () => [this.sender],
    iceConnectionState: 'connected',
  })
}
function setup() {
  const peer = new Emitter() as Emitter & {
    call: ReturnType<typeof vi.fn>
    destroyed: boolean
    disconnected: boolean
  }
  peer.destroyed = false
  peer.disconnected = false
  const raw = new Call()
  peer.call = vi.fn(() => raw)
  const port = createMediaPort(peer as unknown as Peer, new Set())
  return { peer, raw, port }
}
it('replaces the existing audio sender and detaches retired stream callbacks', async () => {
  const { port, raw } = setup()
  const stream = {} as MediaStream
  const call = port.call('remote', stream, raw.metadata as never)
  const listener = vi.fn()
  call.subscribe(listener)
  raw.emit('stream', stream)
  expect(listener).toHaveBeenCalledWith({ type: 'stream', stream })
  const track = { kind: 'audio' } as MediaStreamTrack
  await call.replaceTrack(track)
  expect(raw.sender.replaceTrack).toHaveBeenCalledWith(track)
  call.close()
  listener.mockClear()
  raw.emit('stream', stream)
  expect(listener).not.toHaveBeenCalled()
  expect(raw.close).toHaveBeenCalledOnce()
})
it('closes unclaimed incoming calls without answering or leaking listeners', () => {
  const { peer, raw, port } = setup()
  peer.emit('call', raw)
  expect(raw.close).toHaveBeenCalledOnce()
  expect(raw.answer).not.toHaveBeenCalled()
  port.close()
  port.close()
  expect(peer.handlers.get('call')?.size).toBe(0)
})
it('can accept an incoming call and relay its ICE state after answer', () => {
  const { peer, raw, port } = setup()
  const events = vi.fn()
  port.subscribeIncoming((call) => {
    call.subscribe(events)
    call.answer({} as MediaStream)
  })
  peer.emit('call', raw)
  raw.peerConnection.dispatchEvent(new Event('iceconnectionstatechange'))
  expect(events).toHaveBeenCalledWith({ type: 'ice', state: 'connected' })
  port.close()
  expect(raw.close).toHaveBeenCalledOnce()
})
it('does not invoke PeerJS while its peer is disconnected', () => {
  const { peer, port, raw } = setup()
  peer.disconnected = true
  expect(() => port.call('remote', {} as MediaStream, raw.metadata as never)).toThrow()
  expect(peer.call).not.toHaveBeenCalled()
})
