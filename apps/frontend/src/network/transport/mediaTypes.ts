export interface VoiceCallMetadata {
  version: 1
  callerSessionId: string
  calleeSessionId: string
}
export type VoiceMediaEvent =
  | { type: 'stream'; stream: MediaStream }
  | { type: 'ice'; state: RTCIceConnectionState }
  | { type: 'closed' }
  | { type: 'error'; error: unknown }
export interface VoiceMediaCall {
  id: string
  peerId: string
  metadata: unknown
  answer(stream: MediaStream): void
  replaceTrack(track: MediaStreamTrack): Promise<void>
  subscribe(listener: (event: VoiceMediaEvent) => void): () => void
  close(): void
}
export interface VoiceMediaPort {
  call(peerId: string, stream: MediaStream, metadata: VoiceCallMetadata): VoiceMediaCall
  subscribeIncoming(listener: (call: VoiceMediaCall) => void): () => void
  close(): void
}
