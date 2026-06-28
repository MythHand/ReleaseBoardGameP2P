import type { ReactNode } from 'react'
import Avatar from '@/primitives/Avatar'
import Dropdown, { type DropdownItem } from '@/primitives/Dropdown'
import styles from './PlayerSlot.module.css'

interface PlayerSlotProps {
  name: string
  avatarSize?: number
  // подсветка строки + пометка «(вы)»
  me?: boolean
  youLabel?: string
  // offline — приглушённый аватар и имя
  offline?: boolean
  // бейдж роли сразу после имени (например host)
  badge?: ReactNode
  // статус в правом кластере: тоггл готовности / бейдж
  status?: ReactNode
  // пункты дропдауна действий «⋯» — рендерятся примитивом Dropdown
  dropdown?: DropdownItem[]
  dropdownLabel?: string
}

// Строка участника лобби: аватар + имя (+ «вы») + бейдж роли + правый кластер
// со статусом и дропдауном действий. Каркас и стили взяты из экрана Lobby.
export default function PlayerSlot({
  name,
  avatarSize = 34,
  me = false,
  youLabel = 'вы',
  offline = false,
  badge,
  status,
  dropdown,
  dropdownLabel,
}: PlayerSlotProps) {
  return (
    <div className={`${styles.slot} ${offline ? styles.slotOff : ''} ${me ? styles.slotMe : ''}`}>
      <Avatar name={name} size={avatarSize} muted={offline} />
      <span className={styles.name}>
        {name}
        {me && <span className={styles.you}> ({youLabel})</span>}
      </span>
      {badge}
      {(status || dropdown) && (
        <div className={styles.rowEnd}>
          {status}
          {dropdown && <Dropdown items={dropdown} ariaLabel={dropdownLabel} />}
        </div>
      )}
    </div>
  )
}

// Пустой слот-заглушка (пунктирная строка): «свободный слот» и т.п.
export function EmptySlot({ children }: { children: ReactNode }) {
  return <div className={styles.slotEmpty}>{children}</div>
}
