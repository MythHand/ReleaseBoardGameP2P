import type { ReactNode } from 'react'
import PresetAvatar from '@/avatars/PresetAvatar'
import PencilSimpleIcon from '@/icons/PencilSimpleIcon'
import Avatar from '@/primitives/Avatar'
import Dropdown, { type DropdownItem } from '@/primitives/Dropdown'
import styles from './PlayerSlot.module.css'

interface PlayerSlotProps {
  name: string
  // preset avatar id (PRESET_AVATARS); without it the avatar is the name's initial
  avatar?: string
  avatarSize?: number
  // speaking in the voice chat — the ring around the avatar
  speaking?: boolean
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
  // the avatar and the name become one button that edits this player; hovering
  // or focusing it lays a pencil over the avatar. Without it the row is static.
  onEdit?: () => void
}

// Строка участника лобби: аватар + имя (+ «вы») + бейдж роли + правый кластер
// со статусом и дропдауном действий. Каркас и стили взяты из экрана Lobby.
export default function PlayerSlot({
  name,
  avatar: avatarId,
  avatarSize = 34,
  speaking = false,
  me = false,
  youLabel = 'вы',
  offline = false,
  badge,
  status,
  dropdown,
  dropdownLabel,
  onEdit,
}: PlayerSlotProps) {
  const avatar = avatarId ? (
    <PresetAvatar id={avatarId} size={avatarSize} muted={offline} speaking={speaking} />
  ) : (
    <Avatar name={name} size={avatarSize} muted={offline} speaking={speaking} />
  )
  const label = (
    <span className={styles.name}>
      {name}
      {me && <span className={styles.you}> ({youLabel})</span>}
    </span>
  )

  return (
    <div className={`${styles.slot} ${offline ? styles.slotOff : ''} ${me ? styles.slotMe : ''}`}>
      {onEdit ? (
        <button type="button" className={styles.edit} onClick={onEdit}>
          <span className={styles.editAvatar}>
            {avatar}
            <span className={styles.editMark} aria-hidden="true">
              <PencilSimpleIcon size={16} />
            </span>
          </span>
          {label}
        </button>
      ) : (
        <>
          {avatar}
          {label}
        </>
      )}
      {badge}
      {(Boolean(status) || Boolean(dropdown)) && (
        <div className={styles.rowEnd}>
          {status}
          {dropdown && <Dropdown items={dropdown} ariaLabel={dropdownLabel} />}
        </div>
      )}
    </div>
  )
}

// An empty slot can carry an action (adding a bot) in the same end cluster
// used for occupied rows' status, so controls align across the player column.
export function EmptySlot({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.slotEmpty}>
      {children}
      {Boolean(action) && <div className={styles.rowEnd}>{action}</div>}
    </div>
  )
}
