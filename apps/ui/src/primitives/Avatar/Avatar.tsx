import type { CSSProperties } from 'react'
import styles from './Avatar.module.css'

interface AvatarProps {
  // имя — берётся первая буква
  name: string
  // сторона квадрата в px; кегль выводится из размера
  size?: number
  // приглушённый вид (напр. игрок не в сети)
  muted?: boolean
}

// Аватар-инициал: квадрат с первой буквой имени. Размер — пропом.
export default function Avatar({ name, size = 32, muted = false }: AvatarProps) {
  const style = {
    inlineSize: size,
    blockSize: size,
    fontSize: Math.round(size * 0.45),
  } as CSSProperties

  return (
    <span className={`${styles.avatar} ${muted ? styles.muted : ''}`} style={style}>
      {name[0]?.toUpperCase()}
    </span>
  )
}
