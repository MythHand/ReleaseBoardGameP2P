import type { InputHTMLAttributes, ReactNode } from 'react'
import styles from './InputField.module.css'

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
  error?: string
}

export default function InputField({ label, error, ...rest }: InputFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={`${styles.input}${error ? ` ${styles.inputError}` : ''}`} {...rest} />
      {error && <span className={styles.errorMsg}>{error}</span>}
    </label>
  )
}
