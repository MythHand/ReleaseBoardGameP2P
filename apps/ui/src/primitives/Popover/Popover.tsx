import { type ReactNode, useEffect, useId, useState } from 'react'
import Button, { type ButtonVariant } from '../Button'
import styles from './Popover.module.css'

// Page-wide "only one open at a time", the way Dropdown does it: an opening
// popover broadcasts its id on window, and every other open one closes.
const EXCLUSIVE_EVENT = 'ui-popover-open'

interface PopoverProps {
  // what the trigger button says or shows
  trigger: ReactNode
  // the trigger's look — any Button variant
  variant?: ButtonVariant
  // the trigger's name for a screen reader, when `trigger` is not text
  ariaLabel?: string
  // which edge of the trigger the panel lines up with: `end` opens it toward the
  // start (for a trigger at the right of its row), `start` toward the end
  align?: 'start' | 'end'
  // what the panel lines up against: the trigger, or the nearest positioned
  // ancestor — the row or column the popover stands in
  anchor?: 'trigger' | 'parent'
  // the panel stands out by its own padding, so its content — not its frame —
  // lines up with that edge: values inside sit under the values outside
  flush?: boolean
  // the panel's content — anything, controls included; it sets the panel's width
  children: ReactNode
  className?: string
}

// A panel that opens from a button and holds content of its own — sliders,
// lists — where Dropdown holds a list of actions. It closes on a click outside,
// on Escape, and when another popover opens; a click inside keeps it open.
// The trigger is Button itself, so a popover reads like every other button.
export default function Popover({
  trigger,
  variant = 'tech',
  ariaLabel,
  align = 'end',
  anchor = 'trigger',
  flush = false,
  children,
  className = '',
}: PopoverProps) {
  const id = useId()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) setOpen(false)
    }
    window.addEventListener(EXCLUSIVE_EVENT, onOther)
    return () => window.removeEventListener(EXCLUSIVE_EVENT, onOther)
  }, [id])

  return (
    <div className={`${styles.wrap} ${anchor === 'trigger' ? styles.onTrigger : ''} ${className}`}>
      <Button
        variant={variant}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (open) {
            setOpen(false)
          } else {
            window.dispatchEvent(new CustomEvent(EXCLUSIVE_EVENT, { detail: id }))
            setOpen(true)
          }
        }}
      >
        {trigger}
      </Button>
      {open && (
        // a click inside is the panel's own business, not a click outside
        // biome-ignore lint/a11y/noStaticElementInteractions: only stops the outside-click close
        // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard closes it through Escape
        <div
          className={`${styles.panel} ${styles[align]} ${flush ? styles.flush : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  )
}
