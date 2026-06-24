import type { InputHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import styles from './Input.module.css'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
  trailing?: ReactNode
}

export default function Input({ label, error, trailing, className, id, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const inputClassName = `${styles.input}${error ? ` ${styles.inputError}` : ''}`

  return (
    <label htmlFor={inputId} className={`${styles.field}${className ? ` ${className}` : ''}`}>
      {label && <span className={styles.label}>{label}</span>}
      {trailing ? (
        <div className={styles.row}>
          <input id={inputId} className={inputClassName} {...rest} />
          {trailing}
        </div>
      ) : (
        <input id={inputId} className={inputClassName} {...rest} />
      )}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </label>
  )
}
