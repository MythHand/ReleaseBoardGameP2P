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
  let microphone: MediaStreamTrack | undefined
  let micOff = true
  let disposal: Promise<void> | undefined
  const selectedTrack = () => (microphone?.readyState === 'live' ? microphone : silentTrack)
  return {
    async resume() {
      await context.resume()
      if (context.state !== 'running') throw new Error('Audio output blocked')
    },
    subscribeState(listener) {
      const handler = () => listener(context.state === 'running')
      context.addEventListener('statechange', handler)
      const release = () => {
        context.removeEventListener('statechange', handler)
        observers.delete(release)
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
      const source = context.createMediaStreamSource(stream)
      const gain = context.createGain()
      const setting = settings.get(memberId) ?? { volume: 100, muted: false }
      gain.gain.value = setting.muted ? 0 : clampVolume(setting.volume) / 100
      source.connect(gain)
      gain.connect(master)
      let released = false
      const entry = {
        gain,
        release: () => {
          if (released) return
          released = true
          source.disconnect()
          gain.disconnect()
          if (playback.get(memberId) === entry) playback.delete(memberId)
        },
      }
      playback.set(memberId, entry)
      return entry.release
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
      settings.clear()
      disposal = context.close().catch(() => {})
      return disposal
    },
  }
}
