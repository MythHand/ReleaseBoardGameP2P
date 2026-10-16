import { createSpeakingDetector, rms, SPEAKING_POLL_MS } from './levels'

export interface ParticipantAudioSettings {
  volume: number
  muted: boolean
}
export interface VoiceAudio {
  resume(): Promise<void>
  subscribeState(listener: (ready: boolean) => void): () => void
  getOutgoingStream(): MediaStream
  setMicrophone(stream: MediaStream | null): MediaStreamTrack
  setMicOff(off: boolean): void
  suspendTransmission(): void
  attach(memberId: string, stream: MediaStream): () => void
  setMasterVolume(volume: number): void
  setParticipant(memberId: string, settings: ParticipantAudioSettings): void
  // Who is audible right now — every attached participant and, while the
  // microphone is live and on, me under `setSelfId`. Called only on change.
  subscribeSpeaking(listener: (ids: ReadonlySet<string>) => void): () => void
  setSelfId(memberId: string | null): void
  dispose(): Promise<void>
}
export function clampVolume(value: number): number {
  return Number.isNaN(value) ? 100 : Math.max(0, Math.min(200, value))
}
export function createVoiceAudio(context: AudioContext): VoiceAudio {
  const silentNode = context.createMediaStreamDestination()
  const silentTrack = silentNode.stream.getAudioTracks()[0]
  if (!silentTrack) throw new Error('Silent audio track unavailable')
  const master = context.createGain()
  master.connect(context.destination)
  const playback = new Map<string, { gain: GainNode; release(): void }>()
  const settings = new Map<string, ParticipantAudioSettings>()
  const observers = new Set<() => void>()
  const stateListeners = new Set<(ready: boolean) => void>()
  const failedDecoders = new Set<object>()
  const outputReady = () => context.state === 'running' && failedDecoders.size === 0
  const notifyOutput = () => {
    for (const listener of [...stateListeners]) listener(outputReady())
  }
  let microphone: MediaStreamTrack | undefined
  let micOff = true
  let disposal: Promise<void> | undefined
  // Level meters, one per audible stream. Each taps its source BEFORE the
  // participant's gain, so volume and a local mute never hide who is talking —
  // whether that is shown is the display's call (features/voice-chat/useSpeaking).
  const meters = new Map<string, AnalyserNode>()
  let micMeter: { source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | undefined
  let selfId: string | null = null
  const speakingListeners = new Set<(ids: ReadonlySet<string>) => void>()
  const detector = createSpeakingDetector()
  let poll: ReturnType<typeof setInterval> | undefined
  let frame = new Float32Array(512)
  const meter = (source: AudioNode) => {
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    return analyser
  }
  const sample = () => {
    const levels = new Map<string, number>()
    const read = (id: string, analyser: AnalyserNode) => {
      if (frame.length !== analyser.fftSize) frame = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(frame)
      levels.set(id, rms(frame))
    }
    for (const [id, analyser] of meters) read(id, analyser)
    if (micMeter && selfId && !micOff && microphone?.readyState === 'live')
      read(selfId, micMeter.analyser)
    const changed = detector.update(levels, Date.now())
    if (changed) for (const listener of [...speakingListeners]) listener(changed)
  }
  // Polling runs only while there is something to measure.
  const syncPoll = () => {
    const needed = meters.size > 0 || micMeter !== undefined
    if (needed && poll === undefined) poll = setInterval(sample, SPEAKING_POLL_MS)
    if (!needed && poll !== undefined) {
      clearInterval(poll)
      poll = undefined
      sample()
    }
  }
  const selectedTrack = () => (microphone?.readyState === 'live' ? microphone : silentTrack)
  return {
    async resume() {
      await context.resume()
      if (context.state !== 'running') throw new Error('Audio output blocked')
    },
    subscribeState(listener) {
      stateListeners.add(listener)
      const handler = () => listener(outputReady())
      context.addEventListener('statechange', handler)
      const release = () => {
        context.removeEventListener('statechange', handler)
        observers.delete(release)
        stateListeners.delete(listener)
      }
      observers.add(release)
      return release
    },
    getOutgoingStream() {
      return new MediaStream([selectedTrack()])
    },
    setMicrophone(stream) {
      microphone = stream?.getAudioTracks().find((track) => track.readyState === 'live')
      if (microphone) microphone.enabled = !micOff
      micMeter?.source.disconnect()
      micMeter?.analyser.disconnect()
      micMeter = undefined
      if (microphone) {
        // Measured, never played: the source feeds the analyser and nothing else.
        const source = context.createMediaStreamSource(new MediaStream([microphone]))
        micMeter = { source, analyser: meter(source) }
      }
      syncPoll()
      return selectedTrack()
    },
    setMicOff(off) {
      micOff = off
      if (microphone) microphone.enabled = !off
    },
    suspendTransmission() {
      if (microphone) microphone.enabled = false
    },
    attach(memberId, stream) {
      playback.get(memberId)?.release()
      // Chromium starts remote RTP decoding through a playing media element.
      // Keep it muted: the Web Audio graph owns the only audible output path.
      const decoder = new Audio()
      decoder.muted = true
      decoder.srcObject = stream
      const source = context.createMediaStreamSource(stream)
      const gain = context.createGain()
      const setting = settings.get(memberId) ?? { volume: 100, muted: false }
      gain.gain.value = setting.muted ? 0 : clampVolume(setting.volume) / 100
      source.connect(gain)
      const analyser = meter(source)
      meters.set(memberId, analyser)
      syncPoll()
      gain.connect(master)
      let released = false
      const entry = {
        gain,
        release: () => {
          if (released) return
          released = true
          decoder.pause()
          decoder.srcObject = null
          source.disconnect()
          analyser.disconnect()
          if (meters.get(memberId) === analyser) meters.delete(memberId)
          syncPoll()
          gain.disconnect()
          if (failedDecoders.delete(entry)) notifyOutput()
          if (playback.get(memberId) === entry) playback.delete(memberId)
        },
      }
      playback.set(memberId, entry)
      void decoder.play().catch(() => {
        if (released) return
        failedDecoders.add(entry)
        notifyOutput()
      })
      return entry.release
    },
    subscribeSpeaking(listener) {
      speakingListeners.add(listener)
      return () => {
        speakingListeners.delete(listener)
      }
    },
    setSelfId(memberId) {
      selfId = memberId
    },
    setMasterVolume(volume) {
      master.gain.value = clampVolume(volume) / 100
    },
    setParticipant(memberId, setting) {
      const normalized = { volume: clampVolume(setting.volume), muted: setting.muted }
      settings.set(memberId, normalized)
      const node = playback.get(memberId)
      if (node) node.gain.gain.value = normalized.muted ? 0 : normalized.volume / 100
    },
    dispose() {
      if (disposal !== undefined) return disposal
      for (const release of [...observers]) release()
      for (const entry of [...playback.values()]) entry.release()
      silentTrack.stop()
      silentNode.disconnect()
      master.disconnect()
      micMeter?.source.disconnect()
      micMeter?.analyser.disconnect()
      micMeter = undefined
      meters.clear()
      clearInterval(poll)
      poll = undefined
      speakingListeners.clear()
      settings.clear()
      disposal = context.close().catch(() => {})
      return disposal
    },
  }
}
