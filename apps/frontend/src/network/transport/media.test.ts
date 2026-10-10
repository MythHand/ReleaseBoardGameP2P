import type { Peer } from 'peerjs'
import { afterEach, expect, it, vi } from 'vitest'
import { createVoiceCalls } from '../voice/calls'
import { a, b, fakeAudio, fakeStream } from '../voice/testing/fakes'
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
    connectionState: 'connected',
  })
}
afterEach(() => vi.useRealTimers())
it('recovers a ready outgoing call after DTLS failure while ICE remains connected', async () => {
  vi.useFakeTimers()
  const { peer, raw, port } = setup()
  const replacement = new Call()
  peer.call.mockReturnValueOnce(raw).mockReturnValueOnce(replacement)
  const { audio, releases } = fakeAudio()
  const state = vi.fn()
  const manager = createVoiceCalls({ port, audio, self: a, onState: state })
  manager.reconcile([a, b])
  raw.emit('stream', fakeStream())
  raw.peerConnection.dispatchEvent(new Event('iceconnectionstatechange'))
  expect(state).toHaveBeenLastCalledWith({ readyMemberIds: ['b'], failedMemberIds: [] })
  const detach = vi.spyOn(raw.peerConnection, 'removeEventListener')
  raw.peerConnection.connectionState = 'failed'
  raw.peerConnection.dispatchEvent(new Event('connectionstatechange'))
  expect(raw.peerConnection.iceConnectionState).toBe('connected')
  expect(state).toHaveBeenLastCalledWith({ readyMemberIds: [], failedMemberIds: ['b'] })
  expect(raw.close).toHaveBeenCalledOnce()
  expect(releases[0]).toHaveBeenCalledOnce()
  expect(detach).toHaveBeenCalledWith('connectionstatechange', expect.any(Function))
  await vi.advanceTimersByTimeAsync(3000)
  expect(peer.call).toHaveBeenCalledTimes(2)
  replacement.emit('stream', fakeStream())
  replacement.peerConnection.dispatchEvent(new Event('iceconnectionstatechange'))
  expect(state).toHaveBeenLastCalledWith({ readyMemberIds: ['b'], failedMemberIds: [] })
  raw.peerConnection.dispatchEvent(new Event('connectionstatechange'))
  expect(state).toHaveBeenLastCalledWith({ readyMemberIds: ['b'], failedMemberIds: [] })
  manager.dispose()
  port.close()
  expect(vi.getTimerCount()).toBe(0)
})
it.each([
  'failed',
  'closed',
])('accepts the caller retry after the receiving connection is %s without an ICE change', (terminalState) => {
  const { peer, raw, port } = setup()
  raw.peer = a.peerId
  raw.metadata = {
    version: 1,
    callerSessionId: a.voiceSessionId,
    calleeSessionId: b.voiceSessionId,
  }
  const state = vi.fn()
  const manager = createVoiceCalls({ port, audio: fakeAudio().audio, self: b, onState: state })
  manager.reconcile([a, b])
  peer.emit('call', raw)
  raw.emit('stream', fakeStream())
  raw.peerConnection.dispatchEvent(new Event('iceconnectionstatechange'))
  expect(state).toHaveBeenLastCalledWith({ readyMemberIds: ['a'], failedMemberIds: [] })
  raw.peerConnection.connectionState = terminalState
  raw.peerConnection.dispatchEvent(new Event('connectionstatechange'))
  expect(state).toHaveBeenLastCalledWith({ readyMemberIds: [], failedMemberIds: ['a'] })
  const replacement = new Call()
  replacement.peer = raw.peer
  replacement.metadata = raw.metadata
  peer.emit('call', replacement)
  expect(replacement.answer).toHaveBeenCalledOnce()
  expect(replacement.close).not.toHaveBeenCalled()
  replacement.emit('stream', fakeStream())
  replacement.peerConnection.dispatchEvent(new Event('iceconnectionstatechange'))
  expect(state).toHaveBeenLastCalledWith({ readyMemberIds: ['a'], failedMemberIds: [] })
  expect(peer.call).not.toHaveBeenCalled()
  manager.dispose()
  port.close()
})
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
