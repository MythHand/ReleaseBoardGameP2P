import { type ReactNode, useEffect, useState } from 'react'
import styles from './Overlay.module.css'

interface OverlayProps {
  children?: ReactNode
  className?: string
  /**
   * WHETHER IT IS UP, when the consumer keeps it mounted.
   *
   * Left out, the overlay fades in on mount and simply goes when it unmounts —
   * which is all a dialog's backing ever needed. Given, it stays in the markup
   * and follows the flag, so it fades BOTH ways: a surface that dims the table
   * while a choice is being made has an end as well as a beginning, and an
   * unmount has no end to animate (owner, 22.09).
   */
  shown?: boolean
}

// Scrim поверх контейнера: центрирует контент, плавно появляется (двойной rAF,
// как у Modal). Тон/блюр/z-index переопределяются className потребителя.
export default function Overlay({ children, className = '', shown }: OverlayProps) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    let r2: number
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setEntered(true))
    })
    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [])

  // the painted first frame is always the transparent one — `entered` is what
  // makes the fade a transition rather than an instant paint at full tone
  const up = entered && (shown ?? true)
  return (
    <div className={`${styles.overlay} ${up ? styles.shown : ''} ${className}`}>{children}</div>
  )
}
