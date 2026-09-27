import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
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
// lists — where Dropdown holds a list of actions. It closes on a press outside,
// on Escape, and when another popover opens; anything done inside keeps it open.
// The trigger is Button itself, so a popover reads like every other button.
//
// A press outside only closes it (owner, 27.09). It is the press, not the click
// that follows, that closes — so a slider dragged past the panel's edge and let
// go outside closes nothing — and the click that press turns into is spent on
// the closing: whatever lay under it is not pressed by accident.
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
  // the trigger and the panel: a press in here is not a press outside
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // The click a closing press turns into is swallowed on its way down, before
    // anything under it hears it. A press that never becomes a click (dragged
    // away, a touch that scrolled) must not leave it armed for a later, real
    // click — the next press disarms it.
    const swallow = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      disarm()
    }
    const disarm = () => {
      window.removeEventListener('click', swallow, true)
      window.removeEventListener('pointerdown', disarm, true)
    }
    const onPress = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
      window.addEventListener('click', swallow, true)
      // added while this press is being dispatched, so it answers the next one
      window.addEventListener('pointerdown', disarm, true)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPress, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPress, true)
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
    <div
      ref={wrapRef}
      className={`${styles.wrap} ${anchor === 'trigger' ? styles.onTrigger : ''} ${className}`}
    >
      <Button
        variant={variant}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => {
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
        <div className={`${styles.panel} ${styles[align]} ${flush ? styles.flush : ''}`}>
          {children}
        </div>
      )}
    </div>
  )
}
