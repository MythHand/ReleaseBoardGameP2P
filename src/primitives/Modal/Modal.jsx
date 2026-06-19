import { useEffect, useState } from 'react'
import styles from './Modal.module.css'

// Переиспользуемая модалка с плавным появлением/закрытием (fade + scale).
// Остаётся смонтированной на время exit-анимации.
export default function Modal({ open, onClose, title, children }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // двойной rAF: гарантируем, что начальное состояние (opacity 0) отрисовано,
      // иначе переход не проигрывается и появление «бьёт» резко
      let r2
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
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    <div
      className={`${styles.overlay} ${shown ? styles.shown : ''}`}
      onClick={onClose}
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>{title}</span>
          <button className={styles.close} onClick={onClose} aria-label="закрыть">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
