import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './Button.module.css'

// Кнопка в стиле лоадера. variant:
//   primary — основная, брекеты [ TEXT ], моноширинный uppercase;
//   tech    — техническая, бордер-бокс (как audio-toggle лоадера);
//   danger  — техническая в деструктивном (красном) акценте;
//   icon    — квадратная иконочная, по высоте поля ввода (растягивается до строки).
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'tech' | 'danger' | 'icon'
  className?: string
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
