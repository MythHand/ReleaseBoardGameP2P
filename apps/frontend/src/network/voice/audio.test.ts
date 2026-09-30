import { afterEach, expect, it, vi } from 'vitest'
import { createVoiceAudio } from './audio'

class Track extends EventTarget {
  kind = 'audio'
  enabled = true
  readyState = 'live'
  stop = vi.fn(() => {
    this.readyState = 'ended'
  })
}
class Stream {
  constructor(readonly tracks: Track[]) {}
  getTracks() {
    return this.tracks
  }
  getAudioTracks() {
    return this.tracks
  }
}
class Node {
  connect = vi.fn()
  disconnect = vi.fn()
  gain = { value: 1 }
}
class Decoder {
  srcObject: MediaStream | null = null
  muted = false
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
}
function setup() {
  const decoders: Decoder[] = []
  vi.stubGlobal(
    'Audio',
    class extends Decoder {
      constructor() {
        super()
        decoders.push(this)
      }
    },
  )
  vi.stubGlobal('MediaStream', Stream)
  const silent = new Track()
  const output = Object.assign(new Node(), { stream: new Stream([silent]) })
  const gains: Node[] = []
  const sources: Node[] = []
  const context = Object.assign(new EventTarget(), {
    destination: new Node(),
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createMediaStreamDestination: () => output,
    createGain: () => {
      const node = new Node()
      gains.push(node)
      return node
    },
    createMediaStreamSource: () => {
      const node = new Node()
      sources.push(node)
      return node
    },
  })
  const audio = createVoiceAudio(context as unknown as AudioContext)
  return { audio, silent, gains, sources, context, decoders }
}
afterEach(() => vi.unstubAllGlobals())
it('keeps a silent outgoing audio track and never plays the local microphone', () => {
  const { audio, silent, sources } = setup()
  expect(audio.getOutgoingStream().getAudioTracks()[0]).toBe(silent)
  const mic = new Track()
  audio.setMicrophone(new Stream([mic]) as unknown as MediaStream)
  audio.setMicOff(false)
  expect(audio.getOutgoingStream().getAudioTracks()[0]).toBe(mic)
  expect(mic.enabled).toBe(true)
  expect(sources).toHaveLength(0)
  audio.setMicOff(true)
  expect(mic.enabled).toBe(false)
  mic.stop()
  expect(audio.getOutgoingStream().getAudioTracks()[0]).toBe(silent)
})
it('applies both percentages, keeps muted slider changes, and bounds invalid gains', () => {
  const { audio, gains } = setup()
  audio.attach('m', new Stream([new Track()]) as unknown as MediaStream)
  audio.setMasterVolume(200)
  audio.setParticipant('m', { volume: 200, muted: false })
  expect(gains[0].gain.value * gains[1].gain.value).toBe(4)
  audio.setParticipant('m', { volume: 150, muted: true })
  expect(gains[1].gain.value).toBe(0)
  audio.setParticipant('m', { volume: 150, muted: false })
  expect(gains[1].gain.value).toBe(1.5)
  audio.setParticipant('m', { volume: -10, muted: false })
  expect(gains[1].gain.value).toBe(0)
  audio.setMasterVolume(999)
  expect(gains[0].gain.value).toBe(2)
  audio.setMasterVolume(Number.NaN)
  expect(gains[0].gain.value).toBe(1)
})
it('replaces playback once and disposes only resources it owns', async () => {
  const { audio, sources, silent, context } = setup()
  const mic = new Track()
  const remote = new Track()
  audio.setMicrophone(new Stream([mic]) as unknown as MediaStream)
  const release = audio.attach('m', new Stream([remote]) as unknown as MediaStream)
  audio.attach('m', new Stream([remote]) as unknown as MediaStream)
  release()
  expect(sources[0].disconnect).toHaveBeenCalledOnce()
  expect(sources[1].disconnect).not.toHaveBeenCalled()
  await audio.dispose()
  await audio.dispose()
  expect(sources[1].disconnect).toHaveBeenCalledOnce()
  expect(silent.stop).toHaveBeenCalledOnce()
  expect(mic.stop).not.toHaveBeenCalled()
  expect(remote.stop).not.toHaveBeenCalled()
  expect(context.close).toHaveBeenCalledOnce()
})
it('suspends transmission without losing its microphone mute preference', () => {
  const { audio } = setup()
  const mic = new Track()
  audio.setMicrophone(new Stream([mic]) as unknown as MediaStream)
  audio.setMicOff(false)
  audio.suspendTransmission()
  expect(mic.enabled).toBe(false)
  audio.setMicOff(false)
  expect(mic.enabled).toBe(true)
})

it('reports browser output suspension and releases its observer', async () => {
  const { audio, context } = setup()
  const listener = vi.fn()
  const unsubscribe = audio.subscribeState(listener)
  context.state = 'suspended'
  context.dispatchEvent(new Event('statechange'))
  expect(listener).toHaveBeenCalledWith(false)
  unsubscribe()
  listener.mockClear()
  context.state = 'running'
  context.dispatchEvent(new Event('statechange'))
  expect(listener).not.toHaveBeenCalled()
  await audio.dispose()
})

it('activates remote decoding without a second audible path and releases each decoder once', async () => {
  const { audio, decoders } = setup()
  const stream = new Stream([new Track()]) as unknown as MediaStream
  const release = audio.attach('m', stream)
  expect(decoders).toHaveLength(1)
  expect(decoders[0].srcObject).toBe(stream)
  expect(decoders[0].muted).toBe(true)
  expect(decoders[0].play).toHaveBeenCalledOnce()
  audio.attach('m', stream)
  expect(decoders[0].pause).toHaveBeenCalledOnce()
  expect(decoders[0].srcObject).toBeNull()
  release()
  expect(decoders[1].pause).not.toHaveBeenCalled()
  await audio.dispose()
  expect(decoders[1].pause).toHaveBeenCalledOnce()
  expect(decoders[1].srcObject).toBeNull()
})
it('reports decoder playback refusal and ignores a late refusal after release', async () => {
  const { audio, decoders } = setup()
  const listener = vi.fn()
  audio.subscribeState(listener)
  let reject!: (error: Error) => void
  const pending = new Promise<undefined>((_, fail) => {
    reject = fail
  })
  // Each decoder owns its instance method; inject the next element's play at construction.
  vi.stubGlobal(
    'Audio',
    class extends Decoder {
      constructor() {
        super()
        this.play = vi.fn().mockReturnValue(pending)
        decoders.push(this)
      }
    },
  )
  const release = audio.attach('m', new Stream([new Track()]) as unknown as MediaStream)
  reject(new Error('Playback denied'))
  await Promise.resolve()
  expect(listener).toHaveBeenCalledWith(false)
  listener.mockClear()
  release()
  expect(listener).toHaveBeenCalledWith(true)
  let lateReject!: (error: Error) => void
  const late = new Promise<undefined>((_, fail) => {
    lateReject = fail
  })
  vi.stubGlobal(
    'Audio',
    class extends Decoder {
      constructor() {
        super()
        this.play = vi.fn().mockReturnValue(late)
      }
    },
  )
  const lateRelease = audio.attach('m', new Stream([new Track()]) as unknown as MediaStream)
  lateRelease()
  listener.mockClear()
  lateReject(new Error('Retired playback denied'))
  await Promise.resolve()
  expect(listener).not.toHaveBeenCalled()
  await audio.dispose()
})
