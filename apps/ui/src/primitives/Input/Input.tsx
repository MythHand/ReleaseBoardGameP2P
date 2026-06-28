import type { InputHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import styles from './Input.module.css'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
  trailing?: ReactNode
  // по умолчанию значение капсится (коды, лобби); plain — натуральный регистр
  // (никнейм: в игре он используется как написан, без стилизации в капс)
  plain?: boolean
}

export default function Input({
  label,
  error,
  trailing,
  plain,
  className,
  id,
  ...rest
}: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const inputClassName = `${styles.input}${plain ? ` ${styles.plain}` : ''}${
    error ? ` ${styles.inputError}` : ''
  }`

  // The label is associated to the input via htmlFor/id rather than wrapping it,
  // so an interactive `trailing` control (e.g. a random-nickname / copy button)
  // is not nested inside a <label> — clicking it would otherwise also forward a
  // focus/activation to the text input.
  return (
    <div className={`${styles.field}${className ? ` ${className}` : ''}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      {trailing ? (
        <div className={styles.row}>
          <input id={inputId} className={inputClassName} {...rest} />
          {trailing}
        </div>
      ) : (
        <input id={inputId} className={inputClassName} {...rest} />
      )}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </div>
  )
}
