export interface VoicePresence {
  memberId: string
  peerId: string
  voiceSessionId: string
  micOff: boolean
}
export interface VoiceRosterPayload {
  authorityId: string
  revision: number
  participants: VoicePresence[]
}
export type VoiceIntent =
  | { type: 'VOICE_JOIN' | 'VOICE_MIC'; payload: { voiceSessionId: string; micOff: boolean } }
  | { type: 'VOICE_LEAVE'; payload: { voiceSessionId: string } }
export type VoiceMessage = VoiceIntent | { type: 'VOICE_ROSTER'; payload: VoiceRosterPayload }
export type VoiceWireMessage = VoiceMessage & { from: string; seq: number }
