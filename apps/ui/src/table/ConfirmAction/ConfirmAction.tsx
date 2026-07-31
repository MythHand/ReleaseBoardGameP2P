import Typography from '@/primitives/Typography'
import styles from './ConfirmAction.module.css'

export interface ConfirmActionProps {
  // slides the bar up into view; false slides it back down (enter + exit anim).
  // The bar stays mounted so the exit plays — the consumer keeps it rendered and
  // just flips `open`.
  open?: boolean
  // confirm button label (localized by the consumer — the library is i18n-agnostic)
  label: string
  // selection not complete yet → the button stays visible but inert
  disabled?: boolean
  onConfirm?: () => void
  // optional context line above the button — rendered only when provided
  caption?: string
  className?: string
}

// Confirm bar — the shared "confirm the selection" surface for interactive pick
// flows (Git Cherry-pick, Git Rebase, …). A full block, not a bare button: its
// own surface, an optional caption slot, and a slide up / down animation. It
// pins to the bottom of its positioned container (the table area / sandbox) at
// the top layer, overlapping whatever is beneath. Presentational + i18n-agnostic.
export default function ConfirmAction({
  open = true,
  label,
  disabled = false,
  onConfirm,
  caption,
  className = '',
}: ConfirmActionProps) {
  return (
    <div className={`${styles.bar} ${open ? styles.open : ''} ${className}`} aria-hidden={!open}>
      <div className={styles.inner}>
        {caption && (
          <Typography base="label-sm" tk="tk-16" className={styles.caption}>
            {caption}
          </Typography>
        )}
        <button type="button" className={styles.btn} disabled={disabled} onClick={onConfirm}>
          <Typography base="label-md" tk="tk-16">
            {label}
          </Typography>
        </button>
      </div>
    </div>
  )
}
