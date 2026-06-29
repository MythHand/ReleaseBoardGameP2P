import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import Button, { type ButtonProps } from './Button'
import styles from './CopyButton.module.css'

// How long the "copied" label holds before reverting to the normal one.
const COPIED_HOLD_MS = 1800

export interface CopyButtonProps extends ButtonProps {
  // Clicking copies this value to the clipboard.
  copyValue: string
  // Shown briefly in place of the label after a copy. Omit for no visual feedback.
  copiedChildren?: ReactNode
}

// A Button that copies copyValue to the clipboard on click and, for a moment,
// swaps its label for copiedChildren. Composition over the primitive: the copy
// concern lives here, while the visual and semantics stay in Button.
export default function CopyButton({
  copyValue,
  copiedChildren,
  children,
  onClick,
  ...rest
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e)
    navigator.clipboard?.writeText(copyValue)
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_HOLD_MS)
  }

  const showCopied = copied && copiedChildren != null
  return (
    <Button onClick={handleClick} {...rest}>
      {showCopied ? <span className={styles.copied}>{copiedChildren}</span> : children}
    </Button>
  )
}
