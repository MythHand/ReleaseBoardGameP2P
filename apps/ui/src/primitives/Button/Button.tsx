import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react'
import styles from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'tech' | 'danger' | 'dangerGhost' | 'icon'
  className?: string
  ref?: Ref<HTMLButtonElement>
  // Когда задан — клик копирует это значение в буфер обмена, и кнопка на пару
  // секунд показывает copiedChildren вместо обычной подписи. Если copiedChildren
  // не передан — подпись не меняется (копирование без визуального отклика).
  copyValue?: string
  copiedChildren?: ReactNode
}

// Сколько держим состояние «скопировано» перед возвратом к обычной подписи.
const COPIED_HOLD_MS = 1800

export default function Button({
  children,
  variant = 'primary',
  className = '',
  copyValue,
  copiedChildren,
  onClick,
  ...rest
}: ButtonProps) {
  const isPrimary = variant === 'primary'
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e)
    if (copyValue == null) return
    navigator.clipboard?.writeText(copyValue)
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPIED_HOLD_MS)
  }

  const showCopied = copied && copiedChildren != null
  const label = showCopied ? copiedChildren : children

  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${className}`}
      type="button"
      onClick={handleClick}
      {...rest}
    >
      {isPrimary && <span className={styles.bracket}>[</span>}
      <span className={`${styles.label} ${showCopied ? styles.copied : ''}`}>{label}</span>
      {isPrimary && <span className={styles.bracket}>]</span>}
    </button>
  )
}
