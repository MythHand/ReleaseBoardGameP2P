import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useState } from 'react'
import Chat, { type ChatMessage, type ChatRole } from '@/blocks/Chat'
import { CHAT_SELF, makeChat } from '@/mocks/chat'
import { pick, useLang } from '../../Playground/lang'
import { TechSwitch } from '../controls/TechControls'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'
import styles from './ChatBlock.module.css'

// Live chat block: the log scrolls, the composer sends. Where messages come from
// is the consumer's business — here they are appended locally. The role switch
// shows what you look like to yourself: your own replies carry your role colour.
// The control sits in the page flow, not in a TechBar — kit pages have no
// technical line, their controls live inside the examples.
export default function ChatBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: ruCommon.chat, en: enCommon.chat })
  const [role, setRole] = useState<ChatRole>('player')
  const [messages, setMessages] = useState<ChatMessage[]>(makeChat)

  const send = (text: string) =>
    setMessages((prev) => [
      ...prev,
      { id: `local-${prev.length}`, who: CHAT_SELF, role, text, time: '20:17' },
    ])

  const own = messages.map((m) => (m.who === CHAT_SELF ? { ...m, role } : m))

  return (
    <KitPage title="Chat" tag="block">
      <KitSection
        title={pick(lang, {
          ru: 'Колонка чата — ширина как у панели «история»',
          en: 'Chat column — the width of the history panel',
        })}
      >
        <KitCell
          caption={pick(lang, {
            ru: 'живая лента: Enter отправляет, Shift+Enter переносит строку',
            en: 'live log: Enter sends, Shift+Enter adds a line',
          })}
        >
          <div className={styles.column}>
            <Chat messages={own} copy={copy} selfName={CHAT_SELF} onSend={send} />
          </div>
        </KitCell>

        <KitCell caption={pick(lang, { ru: 'пустая лента', en: 'empty log' })}>
          <div className={styles.column}>
            <Chat messages={[]} copy={copy} selfName={CHAT_SELF} />
          </div>
        </KitCell>

        <KitCell
          caption={pick(lang, { ru: 'своя роль — цвет своих реплик', en: 'own role — own colour' })}
        >
          <TechSwitch
            options={[
              { value: 'host', label: 'host' },
              { value: 'player', label: 'player' },
              { value: 'spectator', label: 'spectator' },
            ]}
            value={role}
            onChange={setRole}
          />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}
