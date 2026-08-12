import type { ReactNode } from 'react'
import Typography from '@/primitives/Typography'
import styles from './TechControls.module.css'

// The controls that live in a <TechBar>. Before these existed the same button
// was copy-pasted into a dozen module.css files and the segmented switch existed
// in two incompatible shapes; the canonical values are TableStory's (the switch,
// the label) and Defense Release's (the button, the toggle).

// An action: restart the scene, throw an attack, pass. Always a <button>.
export function TechButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button type="button" className={styles.btn} onClick={onClick} disabled={disabled}>
      <Typography base="label-sm" tk="tk-16">
        {children}
      </Typography>
    </button>
  )
}

// A two-state condition of the scene: sudo on, Monitoring in the zone. The same
// box as the button, filled when on. Replaces both the hand-rolled `.chip` and
// the bare <input type="checkbox"> the git-card scenes used.
export function TechToggle({
  on,
  onChange,
  disabled,
  children,
}: {
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={styles.toggle}
      data-on={on}
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <Typography base="label-sm" tk="tk-16">
        {children}
      </Typography>
    </button>
  )
}

// One unbreakable unit of the bar. The bar wraps when it runs out of width, and
// a caption that wrapped away from the control it names is no longer a caption —
// so anything that reads as one thing is grouped here and wraps as one thing.
export function TechField({ children }: { children: ReactNode }) {
  return <div className={styles.field}>{children}</div>
}

export interface TechOption<T extends string | number> {
  value: T
  label: string
}

// A small closed set picked in place — deck count, player count, a mode axis.
// For a long list use HoverSelect instead; the switch shows every option at once.
export function TechSwitch<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string
  options: TechOption<T>[]
  value: T
  onChange: (value: T) => void
}) {
  const track = (
    <div className={styles.switch}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? `${styles.seg} ${styles.segOn}` : styles.seg}
          onClick={() => onChange(o.value)}
        >
          <Typography base="label-sm" tk="tk-12">
            {o.label}
          </Typography>
        </button>
      ))}
    </div>
  )
  if (!label) return track
  return (
    <TechField>
      <TechLabel>{label}</TechLabel>
      {track}
    </TechField>
  )
}

// What the scene expects of you right now: "pull a card out of the hand", "pick
// a deck to split". A sentence, so it is neither uppercased nor widely tracked —
// that is what separates it from TechLabel, which names a control.
export function TechHint({ children }: { children: ReactNode }) {
  return (
    <Typography base="mono-sm" tk="tk-04" className={styles.hint}>
      {children}
    </Typography>
  )
}

// A caption in the bar: what a control counts, or what the one next to it means.
// Group it with that control in a <TechField> so a wrap can never separate them.
export function TechLabel({ children }: { children: ReactNode }) {
  return (
    <Typography base="label-sm" tk="tk-12" className={styles.label}>
      {children}
    </Typography>
  )
}
