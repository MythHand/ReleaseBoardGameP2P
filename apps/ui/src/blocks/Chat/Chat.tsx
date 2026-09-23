import { useLayoutEffect, useRef, useState } from 'react'
import Button from '@/primitives/Button'
import Message, { MessageNote, type MessageRole } from '@/primitives/Message'
import ScrollArea, { type ScrollAreaHandle } from '@/primitives/ScrollArea'
import Textarea from '@/primitives/Textarea'
import Typography from '@/primitives/Typography'
import styles from './Chat.module.css'

// Роль автора несёт примитив реплики — здесь она только переезжает из данных.
export type ChatRole = MessageRole

// Насколько «внизу» ещё считается низом: пара пикселей набегает от дробных
// высот строк, да и человек, стоящий почти у края, ждёт подтягивания.
const BOTTOM_SLACK = 24

export interface ChatMessage {
  id: string
  // ник автора — реплика подписана так же, как игрок назван на любом экране.
  // У технической записи автора нет: её пишет не человек.
  who?: string
  text: string
  // время в готовом виде: форматирование — забота консьюмера, не кита
  time?: string
  role?: ChatRole
  // автор уже вышел — имя гаснет, но реплика остаётся в истории
  gone?: boolean
  // техническая запись: не реплика, а событие в ленте — «игрок вошёл», «хост
  // сменил режим», «связь потеряна»
  system?: boolean
}

export interface ChatCopy {
  placeholder: string
  // подпись действия отправки — она же aria-label кнопки-глифа
  send: string
  empty: string
}

interface ChatProps {
  messages: ChatMessage[]
  copy: ChatCopy
  // чьи реплики отмечаются своими; без него не отмечается ни одна
  selfName?: string
  onSend?: (text: string) => void
  className?: string
}

// Лента переписки: прокручиваемый лог и строка ввода — и больше ничего. Сами
// реплики рисует примитив Message; лента отвечает только за порядок — что с чем
// склеено, что своё, что подтянуть к низу.
// Блок держит лишь черновик в поле; сообщения приходят и уходят через пропсы,
// потому что откуда они берутся (P2P, мок, история) кит знать не должен.
// Оформления у блока нет вовсе — ни фона, ни рамок, ни собственного заголовка,
// как у Rules. Он встаёт в чужое место (колонка экрана, выезжающая панель,
// окно), и это место рисует себя и называет его само.
export default function Chat({ messages, copy, selfName, onSend, className = '' }: ChatProps) {
  const [draft, setDraft] = useState('')
  const logRef = useRef<ScrollAreaHandle>(null)
  // прижат ли лог к низу. Это состояние ЧИТАТЬ после прихода сообщения уже
  // поздно — новые узлы меняют scrollHeight, — поэтому оно пишется на прокрутке.
  const atBottom = useRef(true)

  const watchScroll = (el: HTMLElement) => {
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_SLACK
  }

  // новое сообщение подтягивает ленту, но только если её и так держали у низа.
  // Ушёл читать историю выше — тебя оттуда не выдёргивает. На монтировании лог
  // считается прижатым, поэтому сразу открывается на последнем.
  // biome-ignore lint/correctness/useExhaustiveDependencies: зависимость — приход новых сообщений, а не значение внутри тела; `messages` и есть то, после чего лог надо доводить до низа
  useLayoutEffect(() => {
    const el = logRef.current?.viewport()
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    onSend?.(text)
    setDraft('')
  }

  return (
    <section className={`${styles.chat} ${className}`}>
      <ScrollArea
        className={styles.log}
        contentClassName={styles.logInner}
        ref={logRef}
        onScroll={watchScroll}
      >
        {messages.length === 0 && (
          <Typography as="p" base="mono-xs" className={styles.empty}>
            {copy.empty}
          </Typography>
        )}
        {messages.map((m, i) => {
          if (m.system) return <MessageNote key={m.id}>{m.text}</MessageNote>
          const prev = messages[i - 1]
          return (
            <Message
              key={m.id}
              text={m.text}
              who={m.who}
              time={m.time}
              authorRole={m.role}
              self={m.who === selfName}
              gone={m.gone}
              // склейка — знание ленты, а не реплики: подряд идущие сообщения
              // одного автора идут одной очередью, а событие её разрывает
              grouped={!prev?.system && prev?.who === m.who}
            />
          )
        })}
      </ScrollArea>

      <Textarea
        className={styles.compose}
        value={draft}
        placeholder={copy.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter отправляет, Shift+Enter — перенос строки: привычка мессенджера
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        }}
        trailing={
          <Button variant="icon" className={styles.sendBtn} aria-label={copy.send} onClick={send}>
            <span className={styles.sendGlyph}>↵</span>
          </Button>
        }
      />
    </section>
  )
}
