import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import styles from './Input.module.css'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  // подпись над полем; если не задана — рендерится только инпут
  label?: string
  // элемент справа от поля (напр. иконочная кнопка), выровнен по высоте инпута
  trailing?: ReactNode
  className?: string
}

// Текстовое поле в моно-стиле форм. Подпись опциональна, i18n-agnostic (текст — пропсом).
export default function Input({ label, trailing, className = '', id, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const control = <input id={inputId} className={styles.input} {...rest} />

  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      {trailing ? (
        <div className={styles.row}>
          {control}
          {trailing}
        </div>
      ) : (
        control
      )}
    </div>
  )
}
