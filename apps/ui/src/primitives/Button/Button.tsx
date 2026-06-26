import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import styles from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'tech' | 'danger' | 'dangerGhost' | 'icon'
  className?: string
  ref?: Ref<HTMLButtonElement>
}

export default function Button({
  children,
  variant = 'primary',
  className = '',
  ...rest
}: ButtonProps) {
  const isPrimary = variant === 'primary'
  return (
    <button className={`${styles.btn} ${styles[variant]} ${className}`} type="button" {...rest}>
      {isPrimary && <span className={styles.bracket}>[</span>}
      <span className={styles.label}>{children}</span>
      {isPrimary && <span className={styles.bracket}>]</span>}
    </button>
  )
}
