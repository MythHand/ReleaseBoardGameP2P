import { useTranslation } from '@release/translation'
import { Chat, type ChatCopy, type ChatMessage } from '@release/ui'
import { useMemo } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import type { ChatSystemEvent, MemberId } from '~/shared/chat/types'
import { toChatMessages } from './model'

export interface RoomChatView {
  messages: ChatMessage[]
  notificationEntryIds: string[]
  selfMemberId: MemberId | null
  copy: ChatCopy
  send(text: string): boolean
}

export function useRoomChatView(): RoomChatView {
  const session = useSession()
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const time = useMemo(
    () => new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }),
    [language],
  )
  const modeCatalog = {
    handLimit: {
      title: t('gameModes.handLimit.title'),
      options: {
        base: t('gameModes.handLimit.options.base'),
        '8bit': t('gameModes.handLimit.options.8bit'),
        memory: t('gameModes.handLimit.options.memory'),
      },
    },
    releases: {
      title: t('gameModes.releases.title'),
      options: {
        base: t('gameModes.releases.options.base'),
        fast: t('gameModes.releases.options.fast'),
      },
    },
    releaseCond: {
      title: t('gameModes.releaseCond.title'),
      options: {
        base: t('gameModes.releaseCond.options.base'),
        easy: t('gameModes.releaseCond.options.easy'),
      },
    },
    ai: {
      title: t('gameModes.ai.title'),
      options: {
        base: t('gameModes.ai.options.base'),
        less: t('gameModes.ai.options.less'),
        no: t('gameModes.ai.options.no'),
      },
    },
    gitBranch: {
      title: t('gameModes.gitBranch.title'),
      options: {
        base: t('gameModes.gitBranch.options.base'),
        strategic: t('gameModes.gitBranch.options.strategic'),
      },
    },
  } as const
  const translateSystemEvent = (event: ChatSystemEvent): string => {
    switch (event.kind) {
      case 'memberJoined':
        return t('chat.system.memberJoined', { name: event.name })
      case 'memberLeft':
        return t('chat.system.memberLeft', { name: event.name })
      case 'memberReconnected':
        return t('chat.system.memberReconnected', { name: event.name })
      case 'memberKicked':
        return t('chat.system.memberKicked', { name: event.name })
      case 'roleChanged':
        return t('chat.system.roleChanged', {
          name: event.name,
          role: t(`chat.roles.${event.role}`),
        })
      case 'modeChanged': {
        const axis = modeCatalog[event.setting as keyof typeof modeCatalog]
        const option = axis ? (axis.options as Record<string, string>)[event.value] : undefined
        return axis && option
          ? t('chat.system.modeChanged', { setting: axis.title, value: option })
          : t('chat.system.modeChangedUnknown')
      }
    }
  }
  const peers = Object.values(session.state?.peers ?? {})
  const messages = toChatMessages({
    entries: session.chat.entries,
    peers,
    formatTime: (timestamp) => time.format(timestamp),
    systemText: translateSystemEvent,
  })

  return {
    messages,
    notificationEntryIds: session.chat.notificationEntryIds,
    selfMemberId: session.chat.selfMemberId,
    copy: {
      placeholder: t('chat.placeholder'),
      send: t('chat.send'),
      empty: t('chat.empty'),
    },
    send: session.chat.send,
  }
}

export function RoomChat({ view, className }: { view: RoomChatView; className?: string }) {
  return (
    <Chat
      messages={view.messages}
      selfMemberId={view.selfMemberId ?? undefined}
      copy={view.copy}
      onSend={view.send}
      className={className}
    />
  )
}
