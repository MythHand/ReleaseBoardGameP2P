import { type ReactNode, useEffect, useState } from 'react'
import styles from './Overlay.module.css'

interface OverlayProps {
  children: ReactNode
  className?: string
}

// Scrim поверх контейнера: центрирует контент, плавно появляется (двойной rAF,
// как у Modal). Тон/блюр/z-index переопределяются className потребителя.
export default function Overlay({ children, className = '' }: OverlayProps) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let r2: number
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [])

  return (
    <div className={`${styles.overlay} ${shown ? styles.shown : ''} ${className}`}>{children}</div>
  )
}
