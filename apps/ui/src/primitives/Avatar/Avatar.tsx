import type { CSSProperties, ReactNode } from 'react'
import styles from './Avatar.module.css'

interface AvatarProps {
  // имя — берётся первая буква (когда нет заполняющего контента)
  name?: string
  // сторона квадрата в px; кегль выводится из размера
  size?: number
  // приглушённый вид (напр. игрок не в сети)
  muted?: boolean
  // контент на всю площадь (напр. пресет-аватар) — рендерится вместо инициала
  children?: ReactNode
  // speaking in the voice chat — a ring around the square
  speaking?: boolean
}

// Аватар: квадрат со скруглением. По умолчанию — инициал имени; если передан
// `children`, они заполняют аватар целиком (клип по скруглению) вместо буквы.
// Two layers: the face clips its content to the rounding, so the speaking ring
// lives on the outer one — a clip on the face would cut the ring off, and a
// ring drawn by the face would follow its rounding.
export default function Avatar({
  name,
  size = 32,
  muted = false,
  speaking = false,
  children,
}: AvatarProps) {
  const style = {
    inlineSize: size,
    blockSize: size,
    fontSize: Math.round(size * 0.45),
  } as CSSProperties

  return (
    <span
      className={`${styles.avatar} ${muted ? styles.muted : ''} ${speaking ? styles.speaking : ''}`}
      style={style}
    >
      <span className={styles.face}>{children ?? name?.[0]?.toUpperCase()}</span>
    </span>
  )
}
