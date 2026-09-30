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
function setup() {
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
  return { audio, silent, gains, sources, context }
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
