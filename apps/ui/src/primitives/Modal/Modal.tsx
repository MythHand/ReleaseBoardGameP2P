import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
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

  // While it fades out — `open` already false, still mounted for the exit — the
  // modal takes no more requests to close. A second Escape, or a click on the
  // backdrop or the ✕, would otherwise call onClose again, and a consumer that
  // does something on close would do it twice. A ref, so the keyboard listener
  // reads the current value without waiting to be re-subscribed.
  const openRef = useRef(open)
  openRef.current = open
  const requestClose = () => {
    if (openRef.current) onClose()
  }

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
      // Only restore focus if the trigger is still in the document. After a
      // submit that navigates away the trigger is unmounted, and focusing a
      // detached node is a silent no-op that strands focus at the document root.
      if (returnRef.current?.isConnected) returnRef.current.focus()
      returnRef.current = null
    }, 380)
    return () => clearTimeout(t)
  }, [open])

  // Move focus into the modal once it is visible
  useEffect(() => {
    if (!shown || !dialogRef.current) return
    const first = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)[0]
    ;(first ?? dialogRef.current).focus()
  }, [shown])

  // Keyboard: Escape to close + Tab-cycle focus trap.
  // The listener is on `window` in the CAPTURE phase so it (a) fires for Escape
  // even when focus has left the dialog (e.g. a click on the presentational
  // backdrop) and (b) runs before the dialog's bubble-phase onKeyDown
  // stopPropagation, which would otherwise swallow the event.
  useEffect(() => {
    if (!mounted) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (openRef.current) onClose()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      // Always drive Tab manually so Safari (which skips buttons by default)
      // still cycles through every focusable element inside the dialog; a -1
      // index (focus outside the dialog) pulls it back to the first/last item.
      e.preventDefault()
      const current = focusable.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        focusable[current <= 0 ? focusable.length - 1 : current - 1].focus()
      } else {
        focusable[current >= focusable.length - 1 ? 0 : current + 1].focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss; accessible affordances are the close <button> + Escape handler; overlay is presentational
    <div
      className={`${styles.overlay} ${shown ? styles.shown : ''}`}
      onClick={requestClose}
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
        <button type="button" className={styles.close} onClick={requestClose} aria-label="close">
          ✕
        </button>
      </dialog>
    </div>
  )
}
