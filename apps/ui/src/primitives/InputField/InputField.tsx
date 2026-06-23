import type { InputHTMLAttributes, ReactNode } from 'react'
import styles from './InputField.module.css'

export interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
}

export default function InputField({ label, ...rest }: InputFieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.input} {...rest} />
    </label>
  )
}
