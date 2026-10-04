import { useTranslation } from '@release/translation'
import { VoiceChat, type VoiceChatCopy, VoicePanel } from '@release/ui'
import type { ComponentProps } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { toVoiceParticipants } from './model'

export type RoomVoiceView = ComponentProps<typeof VoiceChat>
export function useRoomVoiceView(): RoomVoiceView {
  const session = useSession()
  const { t } = useTranslation()
  const { voice } = session
  const copy: VoiceChatCopy = {
    inVoice: t('voiceChat.inVoice'),
    connect: t('voiceChat.connect'),
    connecting: t('voiceChat.connecting'),
    disconnect: t('voiceChat.disconnect'),
    interrupted: t('voiceChat.interrupted'),
    volume: t('voiceChat.volume'),
    you: t('voiceChat.you'),
    mute: t('voiceChat.mute'),
    unmute: t('voiceChat.unmute'),
    muteMic: t('voiceChat.muteMic'),
    unmuteMic: t('voiceChat.unmuteMic'),
    micMuted: t('voiceChat.micMuted'),
    close: t('voiceChat.close'),
  }
  const participants = toVoiceParticipants(voice, session.state?.peers ?? {})
  const names = participants
    .filter((p) => voice.unreachableMemberIds.includes(p.id))
    .map((p) => p.name)
    .join(', ')
  return {
    participants,
    status: voice.status,
    selfId: voice.selfMemberId ?? undefined,
    volume: voice.volume,
    micOff: voice.micOff,
    copy,
    issue: voice.issue
      ? {
          key:
            voice.issue === 'peersUnreachable'
              ? JSON.stringify([voice.issue, ...voice.unreachableMemberIds])
              : voice.issue,
          title: t(`voiceChat.issues.${voice.issue}.title`, { names }),
          text: t(`voiceChat.issues.${voice.issue}.text`),
          concerns: ['audioBlocked', 'joinFailed', 'peersUnreachable', 'roomDisconnected'].includes(
            voice.issue,
          )
            ? 'connection'
            : 'microphone',
        }
      : null,
    onConnect: () => {
      void voice.connect()
    },
    onDisconnect: voice.disconnect,
    onVolumeChange: voice.setVolume,
    onParticipantVolumeChange: voice.setParticipantVolume,
    onParticipantMuteChange: voice.setParticipantMuted,
    onMicChange: (off) => {
      void voice.setMicOff(off)
    },
  }
}
export function RoomVoice({ view, panelTitle }: { view: RoomVoiceView; panelTitle?: string }) {
  return panelTitle ? <VoicePanel {...view} title={panelTitle} /> : <VoiceChat {...view} />
}
