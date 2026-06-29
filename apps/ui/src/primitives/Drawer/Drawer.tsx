import type { CSSProperties, ReactNode } from 'react'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  side?: 'right' | 'left'
  // ширина поверхности; меняется плавно (анимируется inline-size)
  width?: number | string
  children: ReactNode
  className?: string
}

// Тупая controlled-поверхность: знает только сторону, ширину и открыт/закрыт.
// Оркестрацию (что показывать, когда открывать) держит консьюмер.
export default function Drawer({
  open,
  side = 'right',
  width,
  children,
  className = '',
}: DrawerProps) {
  const style =
    width == null
      ? undefined
      : ({ inlineSize: typeof width === 'number' ? `${width}px` : width } as CSSProperties)

  return (
    <div
      className={`${styles.drawer} ${styles[side]} ${open ? styles.open : ''} ${className}`}
      style={style}
      aria-hidden={!open}
    >
      {children}
    </div>
  )
}
