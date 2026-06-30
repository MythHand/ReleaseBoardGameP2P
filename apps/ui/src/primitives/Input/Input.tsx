import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  useCallback,
  useId,
  useImperativeHandle,
  useRef,
} from 'react'
import { play } from '@/animations'
import styles from './Input.module.css'

export interface InputHandle {
  // тряхнуть поле — фидбек ошибки (напр. незаполнено при сабмите). Дёргает весь
  // .field (лейбл + поле + trailing), как делалось вручную на экранах.
  shake: () => void
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  // error feedback: marks the field invalid (aria-invalid). The actual prompt is
  // a shake — triggered per submit by the Form, or imperatively via the handle.
  error?: string
  trailing?: ReactNode
  // по умолчанию значение капсится (коды, лобби); plain — натуральный регистр
  // (никнейм: в игре он используется как написан, без стилизации в капс)
  plain?: boolean
  // React 19: ref передаётся обычным пропом, forwardRef не нужен
  ref?: Ref<InputHandle>
}

function Input({ label, error, trailing, plain, className, id, ref, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const fieldRef = useRef<HTMLDivElement>(null)

  // Shakes the whole .field (label + input + trailing) — the error feedback.
  const shake = useCallback(() => play('shake', fieldRef.current), [])

  useImperativeHandle(ref, () => ({ shake }), [shake])

  const inputClassName = `${styles.input}${plain ? ` ${styles.plain}` : ''}`
  const invalid = error ? true : undefined
  const inputEl = <input id={inputId} className={inputClassName} aria-invalid={invalid} {...rest} />

  // `data-field` marks the shake target so a parent (e.g. the Form) can shake the
  // whole field on a failed submit without reaching for a ref.
  // The label is associated to the input via htmlFor/id rather than wrapping it,
  // so an interactive `trailing` control (e.g. a random-nickname / copy button)
  // is not nested inside a <label> — clicking it would otherwise also forward a
  // focus/activation to the text input.
  return (
    <div ref={fieldRef} data-field className={`${styles.field}${className ? ` ${className}` : ''}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      {trailing == null ? (
        inputEl
      ) : (
        <div className={styles.row}>
          {inputEl}
          {trailing}
        </div>
      )}
    </div>
  )
}

export default Input
