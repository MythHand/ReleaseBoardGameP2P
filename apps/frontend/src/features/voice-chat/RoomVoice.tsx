import { useTranslation } from '@release/translation'
import { Typography, VoiceChat, type VoiceChatCopy, VoicePanel } from '@release/ui'
import type { ComponentProps } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import { toVoiceParticipants } from './model'

export type RoomVoiceView = ComponentProps<typeof VoiceChat> & { issueText: string | null }
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
  }
  return {
    participants: toVoiceParticipants(voice, session.state?.peers ?? {}),
    status: voice.status,
    selfId: voice.selfMemberId ?? undefined,
    volume: voice.volume,
    micOff: voice.micOff,
    copy,
    issueText: voice.issue ? t(`voiceChat.issues.${voice.issue}`) : null,
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
  const { issueText, ...props } = view
  return (
    <>
      {panelTitle ? <VoicePanel {...props} title={panelTitle} /> : <VoiceChat {...props} />}
      {issueText && (
        <Typography base="body" as="div" role="status">
          {issueText}
        </Typography>
      )}
    </>
  )
}
