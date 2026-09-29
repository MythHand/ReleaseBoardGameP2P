import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import Button, { type ButtonVariant } from '../Button'
import styles from './Popover.module.css'

// Page-wide "only one open at a time", the way Dropdown does it: an opening
// popover broadcasts its id on window, and every other open one closes.
const EXCLUSIVE_EVENT = 'ui-popover-open'
// how far the panel keeps from the viewport's bottom edge (owner, 29.09)
const ROOM_MARGIN = 36

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
// go outside closes nothing. The press itself is stopped and its default
// cancelled — a range under it does not jump, a field does not take the focus
// (review of #210) — and the click it turns into is spent on the closing too:
// whatever lay under it is not pressed by accident.
//
// The panel is no taller than the room below it: it measures that room when it
// opens and whenever the window resizes, and its content shrinks into it — a
// long list scrolls inside rather than running off the screen.
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
  const panelRef = useRef<HTMLDivElement>(null)
  // the room from the panel's top to the viewport's bottom, in px
  const [room, setRoom] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const top = panelRef.current?.getBoundingClientRect().top ?? 0
      setRoom(Math.max(0, window.innerHeight - top - ROOM_MARGIN))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open])

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
      // the press goes no further, and does nothing where it landed — cancelling
      // it also holds back the mouse events a range or a field acts on
      e.stopPropagation()
      e.preventDefault()
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
        <div
          ref={panelRef}
          className={`${styles.panel} ${styles[align]} ${flush ? styles.flush : ''}`}
          style={room === null ? undefined : ({ maxBlockSize: `${room}px` } as CSSProperties)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
