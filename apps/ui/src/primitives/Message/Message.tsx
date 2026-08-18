import type { ReactNode } from 'react'
import Avatar from '@/primitives/Avatar'
import Typography from '@/primitives/Typography'
import styles from './Message.module.css'

// Роль автора красит его имя и подложку его собственных реплик: хост —
// зелёный, игрок — синий, зритель — белый.
export type MessageRole = 'host' | 'player' | 'spectator'

const ROLE_CLASS: Record<MessageRole, string> = {
  host: styles.roleHost,
  player: styles.rolePlayer,
  spectator: styles.roleSpectator,
}

export interface MessageProps {
  text: string
  // автор: ник, как он назван на любом экране
  who?: string
  // время в готовом виде — форматирование остаётся за консьюмером
  time?: string
  // роль автора в комнате. Имя проп НЕ `role`: на компоненте его не отличить от
  // ARIA-атрибута — ни линтеру, ни читателю.
  authorRole?: MessageRole
  // своя реплика: подложка в цвет своей роли
  self?: boolean
  // автор уже вышел — имя гаснет, текст остаётся читаемым
  gone?: boolean
  // склеена с предыдущей репликой того же автора: без аватара и шапки, вплотную
  grouped?: boolean
  className?: string
}

// Одна реплика в ленте. Всё, что она знает о себе, приходит параметрами — кто,
// когда, в какой роли, своя ли, склеена ли с предыдущей. Откуда взялась реплика
// и как лента их упорядочила, примитив не знает.
export default function Message({
  text,
  who,
  time,
  authorRole = 'spectator',
  self = false,
  gone = false,
  grouped = false,
  className = '',
}: MessageProps) {
  return (
    <div
      className={[
        styles.msg,
        ROLE_CLASS[authorRole],
        grouped ? styles.grouped : '',
        self ? styles.self : '',
        gone ? styles.gone : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.gutter}>{!grouped && <Avatar name={who} size={26} />}</div>
      <div className={styles.body}>
        {!grouped && (
          <div className={styles.meta}>
            <Typography base="mono-sm" tk="tk-02" className={styles.who}>
              {who}
            </Typography>
            <Typography base="mono-xs" className={styles.time}>
              {time}
            </Typography>
          </div>
        )}
        <Typography as="p" base="body-sm" className={styles.text}>
          {text}
        </Typography>
      </div>
    </div>
  )
}

// Техническая запись в той же ленте — событие, а не реплика: «игрок вошёл»,
// «хост сменил режим», «связь потеряна». Автора у неё нет, потому что писал её
// не человек, поэтому это отдельная форма, а не Message с пустыми полями.
export function MessageNote({ children }: { children: ReactNode }) {
  return (
    <Typography as="p" base="mono-xs" className={styles.note}>
      {children}
    </Typography>
  )
}
