import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import styles from './Modal.module.css'

const FOCUSABLE =
  'button:not([disabled]):not([data-modal-close]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  wide?: boolean
}

export default function Modal({ open, onClose, title, children, wide = false }: ModalProps) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (open) {
      returnRef.current = document.activeElement as HTMLElement
      setMounted(true)
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
    const t = setTimeout(() => {
      setMounted(false)
      returnRef.current?.focus()
    }, 380)
    return () => clearTimeout(t)
  }, [open])

  // Move focus into the modal once it is visible
  useEffect(() => {
    if (!shown || !dialogRef.current) return
    const first = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
    ;(first ?? dialogRef.current).focus()
  }, [shown])

  // Tab-cycle focus trap
  useEffect(() => {
    if (!mounted) return
    const dialog = dialogRef.current
    if (!dialog) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => dialog.removeEventListener('keydown', onKeyDown)
  }, [mounted])

  // Escape to close
  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss; accessible affordances are the close <button> + Escape handler; overlay is presentational
    <div
      className={`${styles.overlay} ${shown ? styles.shown : ''}`}
      onClick={onClose}
      role="presentation"
    >
      <dialog
        ref={dialogRef}
        className={`${styles.modal} ${wide ? styles.wide : ''}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-labelledby={titleId}
        aria-modal="true"
        tabIndex={-1}
        open
      >
        <div className={styles.head}>
          <span id={titleId} className={styles.title}>
            {title}
          </span>
        </div>
        <div className={styles.body}>{children}</div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="закрыть"
          data-modal-close
        >
          ✕
        </button>
      </dialog>
    </div>
  )
}
