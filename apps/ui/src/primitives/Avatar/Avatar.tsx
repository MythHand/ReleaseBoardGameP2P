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
}

// Аватар: квадрат со скруглением. По умолчанию — инициал имени; если передан
// `children`, они заполняют аватар целиком (клип по скруглению) вместо буквы.
export default function Avatar({ name, size = 32, muted = false, children }: AvatarProps) {
  const style = {
    inlineSize: size,
    blockSize: size,
    fontSize: Math.round(size * 0.45),
  } as CSSProperties

  return (
    <span className={`${styles.avatar} ${muted ? styles.muted : ''}`} style={style}>
      {children ?? name?.[0]?.toUpperCase()}
    </span>
  )
}
