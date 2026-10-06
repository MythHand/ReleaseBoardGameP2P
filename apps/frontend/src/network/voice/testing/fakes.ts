import { vi } from 'vitest'
import type {
  VoiceCallMetadata,
  VoiceMediaCall,
  VoiceMediaEvent,
  VoiceMediaPort,
} from '../../transport/mediaTypes'
import type { Transport } from '../../transport/peer'
import type { VoiceAudio } from '../audio'
import type { VoicePresence } from '../types'

export class FakeTrack extends EventTarget {
  kind = 'audio'
  enabled = true
  readyState = 'live'
  stop = vi.fn(() => {
    this.readyState = 'ended'
    this.dispatchEvent(new Event('ended'))
  })
}
export function fakeStream(track = new FakeTrack()): MediaStream {
  return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
}
export class FakeCall implements VoiceMediaCall {
  static nextId = 0
  id = `call-${++FakeCall.nextId}`
  listeners = new Set<(event: VoiceMediaEvent) => void>()
  close = vi.fn()
  answer = vi.fn()
  replaceTrack = vi.fn().mockResolvedValue(undefined)
  constructor(
    readonly peerId: string,
    readonly metadata: unknown,
  ) {}
  subscribe(listener: (event: VoiceMediaEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  emit(event: VoiceMediaEvent) {
    for (const listener of [...this.listeners]) listener(event)
  }
  ready() {
    this.emit({ type: 'stream', stream: fakeStream() })
    this.emit({ type: 'ice', state: 'connected' })
  }
}
export function fakePort() {
  const incoming = new Set<(call: VoiceMediaCall) => void>()
  const calls: FakeCall[] = []
  const port: VoiceMediaPort = {
    call: vi.fn((peerId: string, _stream: MediaStream, metadata: VoiceCallMetadata) => {
      const call = new FakeCall(peerId, metadata)
      calls.push(call)
      return call
    }),
    subscribeIncoming(listener) {
      incoming.add(listener)
      return () => {
        incoming.delete(listener)
      }
    },
    close: vi.fn(),
  }
  return {
    port,
    calls,
    incoming,
    deliver(call: FakeCall) {
      for (const listener of [...incoming]) listener(call)
    },
  }
}
export function fakeAudio() {
  const silent = new FakeTrack()
  let selected = silent
  const observers = new Set<(ready: boolean) => void>()
  const releases: ReturnType<typeof vi.fn>[] = []
  const audio: VoiceAudio = {
    resume: vi.fn().mockResolvedValue(undefined),
    subscribeState(listener) {
      observers.add(listener)
      return () => {
        observers.delete(listener)
      }
    },
    getOutgoingStream: () => fakeStream(selected),
    setMicrophone: vi.fn((stream: MediaStream | null) => {
      selected = (stream?.getAudioTracks()[0] as unknown as FakeTrack) ?? silent
      return selected as unknown as MediaStreamTrack
    }),
    setMicOff: vi.fn((off: boolean) => {
      selected.enabled = !off
    }),
    suspendTransmission: vi.fn(() => {
      selected.enabled = false
    }),
    attach: vi.fn(() => {
      const release = vi.fn()
      releases.push(release)
      return release
    }),
    setMasterVolume: vi.fn(),
    setParticipant: vi.fn(),
    dispose: vi.fn(() => {
      silent.stop()
      return Promise.resolve()
    }),
  }
  return { audio, silent, releases, observers }
}
export function fakeTransport(media?: VoiceMediaPort): Transport {
  return {
    id: 'self',
    media,
    connectTo: vi.fn(),
    authenticate: vi.fn(),
    send: vi.fn(),
    broadcast: vi.fn(),
    relay: vi.fn(),
    disconnectPeer: vi.fn().mockResolvedValue(undefined),
    connectedIds: () => [],
    close: vi.fn(),
  }
}
export const a: VoicePresence = { memberId: 'a', peerId: 'pa', voiceSessionId: 'va', micOff: true }
export const b: VoicePresence = { memberId: 'b', peerId: 'pb', voiceSessionId: 'vb', micOff: true }
