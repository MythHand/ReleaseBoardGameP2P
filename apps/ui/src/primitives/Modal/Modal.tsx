import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { KEYBOARD_PRIORITY, useKeyboardLayer } from '@/keyboard'
import { getKeyboardRegistry } from '@/keyboard/registry'
import Typography from '../Typography'
import styles from './Modal.module.css'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

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
  const restoreFocus = useRef(false)
  const { isTopOfPriority, stackIndex } = useKeyboardLayer({
    name: `modal:${titleId}`,
    active: mounted,
    priority: KEYBOARD_PRIORITY.modal,
    blockBelow: true,
    root: () => dialogRef.current,
    bindings: [
      {
        key: 'Escape',
        focus: 'any',
        run: () => {
          if (open) onClose()
          return 'handled'
        },
      },
      {
        key: 'Tab',
        focus: 'any',
        repeat: true,
        modifiers: 'shift',
        run: (e) => {
          const dialog = dialogRef.current
          if (!dialog) return 'handled'
          const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
          const current = focusable.indexOf(document.activeElement as HTMLElement)
          // Drive every Tab manually, including Safari's default button skipping.
          const next = e.shiftKey
            ? focusable[current <= 0 ? focusable.length - 1 : current - 1]
            : focusable[current >= focusable.length - 1 ? 0 : current + 1]
          ;(next ?? dialog).focus()
          return 'handled'
        },
      },
    ],
  })

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
      restoreFocus.current =
        getKeyboardRegistry(window).topRoot(KEYBOARD_PRIORITY.modal) === dialogRef.current
      setMounted(false)
    }, 380)
    return () => clearTimeout(t)
  }, [open])

  // Move focus into the modal once it is visible
  useEffect(() => {
    if (!shown || !isTopOfPriority || !dialogRef.current) return
    const first = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
    ;(first ?? dialogRef.current).focus()
  }, [shown, isTopOfPriority])

  // Restore only after the closing layer has left the registry. A lower
  // modal closing in the background must not move the top modal's focus.
  useEffect(() => {
    if (mounted) return
    const saved = returnRef.current
    if (restoreFocus.current) {
      const top = getKeyboardRegistry(window).topRoot(KEYBOARD_PRIORITY.modal)
      if (saved?.isConnected && (!top || top.contains(saved))) saved.focus()
      else if (top) (top.querySelector<HTMLElement>(FOCUSABLE) ?? top).focus()
    }
    restoreFocus.current = false
    returnRef.current = null
  }, [mounted])

  if (!mounted) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss; accessible affordances are the close <button> + Escape handler; overlay is presentational
    <div
      className={`${styles.overlay} ${shown ? styles.shown : ''}`}
      style={{ '--modal-stack': Math.max(0, stackIndex) } as CSSProperties}
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
          <Typography base="heading-5" tk="tk-06" id={titleId}>
            {title}
          </Typography>
        </div>
        <div className={styles.body}>{children}</div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="close">
          ✕
        </button>
      </dialog>
    </div>
  )
}
