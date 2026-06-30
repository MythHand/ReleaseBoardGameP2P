import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import Typography, { type TypographyBase, type TypographyTk } from '../Typography'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'tech' | 'danger' | 'dangerGhost' | 'icon'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: ButtonVariant
  className?: string
  ref?: Ref<HTMLButtonElement>
}

// Label typography per variant. icon = a glyph / SVG sized in CSS, so it has no
// Typography wrapper; the rest set their text through the component.
const LABEL_TYPO: Record<ButtonVariant, { base: TypographyBase; tk: TypographyTk } | null> = {
  primary: { base: 'button', tk: 'tk-18' },
  tech: { base: 'label-sm', tk: 'tk-18' },
  danger: { base: 'label-sm', tk: 'tk-18' },
  dangerGhost: { base: 'label-sm', tk: 'tk-18' },
  icon: null,
}

export default function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: ButtonProps) {
  const typo = LABEL_TYPO[variant]
  return (
    <button className={`${styles.btn} ${styles[variant]} ${className}`} type="button" {...rest}>
      {typo ? (
        <Typography base={typo.base} tk={typo.tk} className={styles.label}>
          {variant === 'primary' && <span className={styles.bracket}>[</span>}
          {children}
          {variant === 'primary' && <span className={styles.bracket}>]</span>}
        </Typography>
      ) : (
        children
      )}
    </button>
  )
}
