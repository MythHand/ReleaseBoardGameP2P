import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import styles from './Modal.module.css'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  wide?: boolean
}

// Переиспользуемая модалка с плавным появлением/закрытием (fade + scale).
// Остаётся смонтированной на время exit-анимации. wide — широкий вариант (двухколоночные формы).
export default function Modal({ open, onClose, title, children, wide = false }: ModalProps) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // двойной rAF: гарантируем, что начальное состояние (opacity 0) отрисовано,
      // иначе переход не проигрывается и появление «бьёт» резко
      let r2: number
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setShown(true))
      })
      return () => {
        cancelAnimationFrame(r1)
        cancelAnimationFrame(r2)
      }
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 380)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss convenience; accessible affordances are the close <button> + global Escape handler (useEffect above); overlay is presentational
    <div
      className={`${styles.overlay} ${shown ? styles.shown : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <dialog
        className={`${styles.modal} ${wide ? styles.wide : ''}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        open
      >
        <div className={styles.head}>
          <span className={styles.title}>{title}</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="закрыть">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </dialog>
    </div>
  )
}
